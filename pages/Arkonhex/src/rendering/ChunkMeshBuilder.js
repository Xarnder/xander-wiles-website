import * as THREE from 'three';
import { HEX_SIZE, axialToWorld } from '../utils/HexUtils.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 } from 'three/addons/lines/Line2.js';

const BLOCK_HEIGHT = 1.0;
const TOP_RATIO = 0.25; // Top 25%
const BASE_RATIO = 0.75; // Bottom 75%

// Hexagon corners (pointy-topped)
const corners = [];
for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30; // Pointy topped needs -30 offset
    const angle_rad = Math.PI / 180 * angle_deg;
    corners.push(new THREE.Vector2(
        HEX_SIZE * Math.cos(angle_rad),
        HEX_SIZE * Math.sin(angle_rad)
    ));
}

export class ChunkMeshBuilder {
    constructor(blockSystem) {
        // Create material dictionaries mapping colour names to their dynamically generated texture material
        this.materials = {};
        this.transparentMaterials = {};

        // We map textures to specific Array index positions for BufferGeometry.addGroup()
        // Index 0 is a fallback/default material
        this.materialIndexMap = new Map();

        // Use the actual palette keys exactly as loaded from JSON
        const colors = Array.from(blockSystem.palette.keys());

        let currentIndex = 0;
        for (const color of colors) {
            this.materialIndexMap.set(color, currentIndex++);

            // Init materials temporarily with flat colours while textures generate
            this.materials[color] = new THREE.MeshStandardMaterial({
                color: blockSystem.palette.get(color),
                roughness: 0.8,
                metalness: 0.1,
                side: THREE.FrontSide,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });

            this.transparentMaterials[color] = new THREE.MeshStandardMaterial({
                color: blockSystem.palette.get(color),
                roughness: 0.1,
                metalness: 0.1,
                transparent: true,
                opacity: 0.6,
                depthWrite: false, // Critical for water 
                side: THREE.FrontSide,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
        }

        // We must export out ordered Arrays for the final THREE.Mesh construction
        // Array order MUST exactly match materialIndexMap sequence
        this.materialArray = colors.map(c => this.materials[c]);
        this.transparentMaterialArray = colors.map(c => this.transparentMaterials[c]);

        // Shared line material for efficient thick block outlines
        this.outlineMaterial = new LineMaterial({
            color: 0xffffff,
            linewidth: 3,
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
        });

        // Dynamically build Canvas Textures using the shadow map
        const loader = new THREE.TextureLoader();
        loader.load(
            'assets/textures/base-texture.webp',
            (shadowTex) => {
                this.shadowTex = shadowTex; // Save for live updates
                this.rebuildTextures(blockSystem); // Initial build with default JSON opacities
            },
            undefined,
            (err) => console.error('[Arkonhex] Failed to load shadow map base-texture.webp:', err)
        );
    }

    /**
     * Paints the AOC shadow map onto block canvases. 
     * Can be recalled by the Settings UI to update AOC strength in real-time.
     */
    rebuildTextures(blockSystem, globalStrength = null) {
        if (!this.shadowTex || !this.shadowTex.image) return;

        const img = this.shadowTex.image;
        const width = img.width;
        const height = img.height;

        for (const [colorName, hexStr] of blockSystem.palette.entries()) {
            // Create an off-screen canvas for this specific material
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // 1. Paint the solid base colour
            ctx.fillStyle = hexStr;
            ctx.fillRect(0, 0, width, height);

            // 2. Overlay the dark shadow map with controlled blending
            // If globalStrength is passed from the UI slider, override the JSON default.
            if (globalStrength !== null) {
                ctx.globalAlpha = globalStrength;
            } else {
                ctx.globalAlpha = blockSystem.paletteOpacity.get(colorName) ?? 0.8;
            }

            ctx.drawImage(img, 0, 0, width, height);

            // 3. Extract back into Three.js
            const compositeTex = new THREE.CanvasTexture(canvas);
            compositeTex.wrapS = THREE.RepeatWrapping;
            compositeTex.wrapT = THREE.RepeatWrapping;
            compositeTex.colorSpace = THREE.SRGBColorSpace;

            // Assign specific mapped textures
            this.materials[colorName].color.setHex(0xffffff); // Reset flat tint since texture brings colour
            this.materials[colorName].map = compositeTex;
            this.materials[colorName].needsUpdate = true;

            this.transparentMaterials[colorName].color.setHex(0xffffff); // Reset flat tint
            this.transparentMaterials[colorName].map = compositeTex;
            this.transparentMaterials[colorName].needsUpdate = true;
        }
    }

    /**
     * Builds a single merged BufferGeometry for an entire chunk.
     * Uses vertex colors to distinguish block types and top/base sections.
     * @param {Chunk} chunk - The chunk data structure
     * @param {BlockSystem} blockSystem - Reference to block definitions
     * @param {ChunkSystem} chunkSystem - Reference to chunk system for neighboring queries
     */
    buildChunkMesh(chunk, blockSystem, chunkSystem) {
        // We now have multiple materials, so we need a discrete set of buffers for each material index
        const numMaterials = this.materialArray.length;

        // Arrays of arrays. index 0 corresponds to materialIndexMap mapped to 'red', etc.
        const positions = Array.from({ length: numMaterials }, () => []);
        const normals = Array.from({ length: numMaterials }, () => []);
        const uvs = Array.from({ length: numMaterials }, () => []);
        const indices = Array.from({ length: numMaterials }, () => []);
        const vertexOffsets = new Array(numMaterials).fill(0);

        const transPositions = Array.from({ length: numMaterials }, () => []);
        const transNormals = Array.from({ length: numMaterials }, () => []);
        const transUvs = Array.from({ length: numMaterials }, () => []);
        const transIndices = Array.from({ length: numMaterials }, () => []);
        const transVertexOffsets = new Array(numMaterials).fill(0);

        const CHUNK_SIZE = 16;
        const neighborOffsets = [
            { q: 1, r: 0 },
            { q: 0, r: 1 },
            { q: -1, r: 1 },
            { q: -1, r: 0 },
            { q: 0, r: -1 },
            { q: 1, r: -1 }
        ];

        // Iterate all blocks in the chunk data
        // Chunk provides an iterator or array of {q, r, y, blockId}
        for (const block of chunk.getBlocks()) {
            if (block.id === 0) continue; // Air

            const def = blockSystem.getBlockDef(block.id);
            if (!def) continue;

            // Resolve the texture mapped Material Index ID instead of Float32 colors
            const topColorName = blockSystem.getColorName(def.topColor);
            const baseColorName = blockSystem.getColorName(def.baseColor);

            const topMatIndex = this.materialIndexMap.get(topColorName) ?? 0;
            const baseMatIndex = this.materialIndexMap.get(baseColorName) ?? 0;

            // Determine if we need to render faces based on neighbors (Frustum/Face Culling)
            // For now, render all faces of active blocks, we will optimize face culling next.
            const worldPos = axialToWorld(block.q, block.r);
            const yOffset = block.y * BLOCK_HEIGHT;

            const isTrans = def.transparent || def.translucent;

            // Helper to add a quad specifically to a material group
            const addQuad = (p1, p2, p3, p4, uv1, uv2, uv3, uv4, normal, matIndex) => {
                const tPos = isTrans ? transPositions[matIndex] : positions[matIndex];
                const tNorm = isTrans ? transNormals[matIndex] : normals[matIndex];
                const tUv = isTrans ? transUvs[matIndex] : uvs[matIndex];
                const tInd = isTrans ? transIndices[matIndex] : indices[matIndex];
                let currentOffset = isTrans ? transVertexOffsets[matIndex] : vertexOffsets[matIndex];

                tPos.push(...p1, ...p2, ...p3, ...p4);
                tUv.push(...uv1, ...uv2, ...uv3, ...uv4);
                tNorm.push(...normal, ...normal, ...normal, ...normal);

                tInd.push(
                    currentOffset, currentOffset + 1, currentOffset + 2,
                    currentOffset + 2, currentOffset + 3, currentOffset
                );

                if (isTrans) transVertexOffsets[matIndex] += 4;
                else vertexOffsets[matIndex] += 4;
            };

            // block.q and block.r are already global owing to chunk.getBlocks()
            const globalQ = block.q;
            const globalR = block.r;

            // Helper to add a triangle specifically to a material group (used for hex caps)
            const addTriangle = (p1, p2, p3, uv1, uv2, uv3, normal, matIndex) => {
                const tPos = isTrans ? transPositions[matIndex] : positions[matIndex];
                const tNorm = isTrans ? transNormals[matIndex] : normals[matIndex];
                const tUv = isTrans ? transUvs[matIndex] : uvs[matIndex];
                const tInd = isTrans ? transIndices[matIndex] : indices[matIndex];
                let currentOffset = isTrans ? transVertexOffsets[matIndex] : vertexOffsets[matIndex];

                tPos.push(...p1, ...p2, ...p3);
                tUv.push(...uv1, ...uv2, ...uv3);
                tNorm.push(...normal, ...normal, ...normal);

                tInd.push(currentOffset, currentOffset + 1, currentOffset + 2);

                if (isTrans) transVertexOffsets[matIndex] += 3;
                else vertexOffsets[matIndex] += 3;
            };

            const shouldRenderFace = (gq, gr, gy, myDef) => {
                if (!chunkSystem) return true;
                const nid = chunkSystem.getBlockGlobal(gq, gr, gy);
                if (nid === 0) return true;

                const nDef = blockSystem.getBlockDef(nid);
                if (!nDef) return true;

                const nTrans = nDef.transparent || nDef.translucent;

                // If neighbor is solid opaque, don't render face against it
                if (!nTrans) return false;

                // If both are translucent of the same type (e.g. water touching water), cull face
                if (myDef.translucent && nDef.translucent && nid === block.id) return false;

                // If both are transparent of the same type (e.g. leaves touching leaves), cull face to save polygons
                if (myDef.transparent && nDef.transparent && nid === block.id) return false;

                return true;
            };

            // Top Face (Center + 6 corners = 6 triangles)
            const topY = yOffset + BLOCK_HEIGHT;
            const splitY = yOffset + (BLOCK_HEIGHT * BASE_RATIO);
            const baseY = yOffset;

            // Build Top Face
            if (shouldRenderFace(globalQ, globalR, block.y + 1, def)) {
                for (let i = 0; i < 6; i++) {
                    const c1 = corners[i];
                    const c2 = corners[(i + 1) % 6];

                    // Add center, c2, c1 triangle (reversed winding for top face)
                    addTriangle(
                        [worldPos.x, topY, worldPos.z],
                        [worldPos.x + c2.x, topY, worldPos.z + c2.y],
                        [worldPos.x + c1.x, topY, worldPos.z + c1.y],
                        [worldPos.x, worldPos.z],
                        [worldPos.x + c2.x, worldPos.z + c2.y],
                        [worldPos.x + c1.x, worldPos.z + c1.y],
                        [0, 1, 0],
                        topMatIndex
                    );
                }
            }

            // Build Bottom Face
            if (shouldRenderFace(globalQ, globalR, block.y - 1, def)) {
                for (let i = 0; i < 6; i++) {
                    const c1 = corners[i];
                    const c2 = corners[(i + 1) % 6];

                    // Add center, c1, c2 triangle (normal winding for bottom face)
                    addTriangle(
                        [worldPos.x, baseY, worldPos.z],
                        [worldPos.x + c1.x, baseY, worldPos.z + c1.y],
                        [worldPos.x + c2.x, baseY, worldPos.z + c2.y],
                        [worldPos.x, worldPos.z],
                        [worldPos.x + c1.x, worldPos.z + c1.y],
                        [worldPos.x + c2.x, worldPos.z + c2.y],
                        [0, -1, 0],
                        baseMatIndex
                    );
                }
            }

            // Build 6 Sides
            for (let i = 0; i < 6; i++) {
                const offset = neighborOffsets[i];
                if (!shouldRenderFace(globalQ + offset.q, globalR + offset.r, block.y, def)) {
                    continue;
                }

                const c1 = corners[i];
                const c2 = corners[(i + 1) % 6];

                // Normal calculation for the side
                const dx = c2.x - c1.x;
                const dz = c2.y - c1.y;
                const normal = new THREE.Vector3(dz, 0, -dx).normalize().toArray();

                // Texture scale for sides, wrapping smoothly 0->1 across the side horizontally 
                // and tying seamlessly to exact world Y vertically to prevent arbitrary stretching.
                // 1 unit equals one physical hex side-width
                const uv1Top = [0, topY];
                const uv2Top = [1, topY];
                const uv2Mid = [1, splitY];
                const uv1Mid = [0, splitY];
                const uv2Bot = [1, baseY];
                const uv1Bot = [0, baseY];

                // Top Section Quad (25%)
                addQuad(
                    [worldPos.x + c1.x, topY, worldPos.z + c1.y],
                    [worldPos.x + c2.x, topY, worldPos.z + c2.y],
                    [worldPos.x + c2.x, splitY, worldPos.z + c2.y],
                    [worldPos.x + c1.x, splitY, worldPos.z + c1.y],
                    uv1Top, uv2Top, uv2Mid, uv1Mid,
                    normal, topMatIndex
                );

                // Base Section Quad (75%)
                addQuad(
                    [worldPos.x + c1.x, splitY, worldPos.z + c1.y],
                    [worldPos.x + c2.x, splitY, worldPos.z + c2.y],
                    [worldPos.x + c2.x, baseY, worldPos.z + c2.y],
                    [worldPos.x + c1.x, baseY, worldPos.z + c1.y],
                    uv1Mid, uv2Mid, uv2Bot, uv1Bot,
                    normal, baseMatIndex
                );
            }
        }

        const buildMesh = (posArr, normArr, uvArr, indArr, materialsArray) => {
            // Flatten arrays and track material group offsets
            const flatPos = [];
            const flatNorm = [];
            const flatUv = [];
            const flatInd = [];
            const groups = [];

            let indexOffset = 0; // Tracks the running offset of indices mapped so far

            for (let i = 0; i < numMaterials; i++) {
                if (posArr[i].length === 0) continue;

                // Create a group entry matching the material Index
                // `start` is the index of the first element in the indices array for this group
                groups.push({
                    start: flatInd.length,
                    count: indArr[i].length,
                    materialIndex: i
                });

                // Vertices must be offset by the current vertex count in flatPos
                const vertexOffset = flatPos.length / 3;
                for (let j = 0; j < indArr[i].length; j++) {
                    flatInd.push(indArr[i][j] + vertexOffset);
                }

                flatPos.push(...posArr[i]);
                flatNorm.push(...normArr[i]);
                flatUv.push(...uvArr[i]);
            }

            if (flatPos.length === 0) return null;

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(flatPos, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(flatNorm, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(flatUv, 2));
            geometry.setIndex(flatInd);

            for (const g of groups) {
                geometry.addGroup(g.start, g.count, g.materialIndex);
            }

            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();
            geometry.computeVertexNormals();

            const mesh = new THREE.Mesh(geometry, materialsArray);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };

        const solidMesh = buildMesh(positions, normals, uvs, indices, this.materialArray);
        const transMesh = buildMesh(transPositions, transNormals, transUvs, transIndices, this.transparentMaterialArray);

        const group = new THREE.Group();
        if (solidMesh) {
            group.add(solidMesh);

            // Add block outlines if enabled
            if (blockSystem.showOutlines) {
                const edges = new THREE.EdgesGeometry(solidMesh.geometry, 1); // 1 deg threshold for sharp hex edges
                const lineGeom = new LineSegmentsGeometry().fromEdgesGeometry(edges);
                const outline = new Line2(lineGeom, this.outlineMaterial);
                group.add(outline);
            }
        }
        if (transMesh) {
            group.add(transMesh);

            // Add outlines for transparent blocks too if enabled
            if (blockSystem.showOutlines) {
                const edges = new THREE.EdgesGeometry(transMesh.geometry, 1);
                const lineGeom = new LineSegmentsGeometry().fromEdgesGeometry(edges);
                const outline = new Line2(lineGeom, this.outlineMaterial);
                group.add(outline);
            }
        }

        return group;
    }
}
