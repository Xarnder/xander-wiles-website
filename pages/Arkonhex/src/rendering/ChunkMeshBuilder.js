import * as THREE from 'three';
import { HEX_SIZE, axialToWorld, getSeededBlockHeight } from '../utils/HexUtils.js';
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
                emissive: 0x000000,
                emissiveIntensity: 0.0,
                transparent: true,
                opacity: 0.6,
                depthWrite: false, // Critical for water 
                side: THREE.FrontSide,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });

            // If this is the water material, hook into the shader for vertex animation
            if (color === 'blue') {
                this.waterUniforms = { uTime: { value: 0 } };

                this.transparentMaterials[color].onBeforeCompile = (shader) => {
                    shader.uniforms.uTime = this.waterUniforms.uTime;

                    shader.vertexShader = `
                        uniform float uTime;
                        \n` + shader.vertexShader;

                    // Hook into 'begin_vertex' to apply the wave offset
                    // Water blocks have their base at y=0 and top at y=0.5. 
                    // We only want the top surface (y > 0.1) to wave, to prevent tearing from the ground.
                    const token = `#include <begin_vertex>`;
                    const customTransform = `
                        vec3 transformed = vec3( position );
                        if (transformed.y > 0.1) {
                            // Simple continuous layered sine wave based on world X and Z, plus time
                            float wave = sin(position.x * 1.5 + uTime) * cos(position.z * 1.5 + uTime * 0.8) * 0.1;
                            transformed.y += wave;
                        }
                    `;
                    shader.vertexShader = shader.vertexShader.replace(token, customTransform);
                };
            }
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

        // Shared line material for distant LOD blocks to fake geometric depth
        this.lodOutlineMaterial = new LineMaterial({
            color: 0x000000,
            linewidth: 1, // Reduced for thinner lines as requested
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
            transparent: true,
            opacity: 0.6,
            depthWrite: false
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
        if (!this.shadowTex || !this.shadowTex.image) {
            // Fallback: If no texture is loaded, just update the flat colors.
            for (const [colorName, hexStr] of blockSystem.palette.entries()) {
                if (this.materials[colorName]) this.materials[colorName].color.set(hexStr);
                if (this.transparentMaterials[colorName]) this.transparentMaterials[colorName].color.set(hexStr);
            }
            return;
        }

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
            compositeTex.needsUpdate = true;

            // Assign specific mapped textures
            if (this.materials[colorName].map) this.materials[colorName].map.dispose();
            this.materials[colorName].color.setHex(0xffffff); // Reset flat tint since texture brings colour
            this.materials[colorName].map = compositeTex;
            this.materials[colorName].needsUpdate = true;

            if (this.transparentMaterials[colorName].map) this.transparentMaterials[colorName].map.dispose();
            this.transparentMaterials[colorName].color.setHex(0xffffff); // Reset flat tint
            this.transparentMaterials[colorName].map = compositeTex;
            this.transparentMaterials[colorName].needsUpdate = true;
        }
    }

    /**
     * Updates the color of LOD outlines and Glass outlines dynamically based on time of day.
     * @param {THREE.Camera} camera 
     * @param {THREE.DirectionalLight} sunLight 
     * @param {number} timeOfDay - Normalized time 0.0 to 1.0
     */
    updateOutlineColors(camera, sunLight, timeOfDay) {
        // --- LOD outline logic ---
        if (this.lodOutlineMaterial) {
            const isDaytime = timeOfDay > 0.23 && timeOfDay < 0.77;

            if (!isDaytime) {
                // Nighttime: static dark gray moonlight outlines
                this.lodOutlineMaterial.color.setHex(0x1a1a1a);
            } else {
                // Daytime: Dynamic silhouetting based on look direction vs sun
                const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

                const sunDir = new THREE.Vector3().copy(sunLight.position).normalize();
                const dot = lookDir.dot(sunDir);

                const normalizedDot = (dot + 1) / 2;

                const sunColor = new THREE.Color(0x000000); // Black when facing sun
                const awayColor = new THREE.Color(0xffffff); // White when facing away

                this.lodOutlineMaterial.color.copy(awayColor).lerp(sunColor, normalizedDot);
            }
        }

    }

    /**
     * Builds a single merged BufferGeometry for an entire chunk.
     * Uses vertex colors to distinguish block types and top/base sections.
     * @param {Chunk} chunk - The chunk data structure
     * @param {BlockSystem} blockSystem - Reference to block definitions
     * @param {ChunkSystem} chunkSystem - Reference to chunk system for neighboring queries
     * @param {string} seed - The world seed for procedural generation logic
     */
    buildChunkMesh(chunk, blockSystem, chunkSystem, seed = "arkonhex") {
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

        const glassPositions = Array.from({ length: numMaterials }, () => []);
        const glassNormals = Array.from({ length: numMaterials }, () => []);
        const glassUvs = Array.from({ length: numMaterials }, () => []);
        const glassIndices = Array.from({ length: numMaterials }, () => []);
        const glassVertexOffsets = new Array(numMaterials).fill(0);

        const CHUNK_SIZE = 16;
        const neighborOffsets = [
            { q: 1, r: 0 },
            { q: 0, r: 1 },
            { q: -1, r: 1 },
            { q: -1, r: 0 },
            { q: 0, r: -1 },
            { q: 1, r: -1 }
        ];

        // Shared Geometry Helpers
        const addQuad = (p1, p2, p3, p4, uv1, uv2, uv3, uv4, normal, matIndex) => {
            let tPos, tNorm, tUv, tInd, currentOffset;

            // These rely on the specific material indices passed in
            if (matIndex >= numMaterials) return;

            // Translucency arrays are bound to the materials
            // In Arkonhex, the `isGlass` check is an id-based shortcut, we need a better check later,
            // but for now, we pass `isTrans` or `isGlass` as a boolean from the outer loop.
            // Since this is generic, we'll let the outer loop pass target arrays directly, 
            // OR we just use the global scope arrays. Since this is in `buildChunkMesh`, 
            // it has access to the arrays above.

            // To be safe, we'll pass the target array group as arguments down the line,
            // but for now let's just use a param `type` ('solid', 'trans', 'glass')
        };
        // We will just let the callers push directly, or pass the target array explicitly.
        // Actually, since the variables are hoisted locally, we can let it access them if we know the block type.

        const pushTri = (p1, p2, p3, uv1, uv2, uv3, normal, matIndex, targetType) => {
            let tPos, tNorm, tUv, tInd, currentOffset;

            if (targetType === 'glass') {
                tPos = glassPositions[matIndex];
                tNorm = glassNormals[matIndex];
                tUv = glassUvs[matIndex];
                tInd = glassIndices[matIndex];
                currentOffset = glassVertexOffsets[matIndex];
                glassVertexOffsets[matIndex] += 3;
            } else if (targetType === 'trans') {
                tPos = transPositions[matIndex];
                tNorm = transNormals[matIndex];
                tUv = transUvs[matIndex];
                tInd = transIndices[matIndex];
                currentOffset = transVertexOffsets[matIndex];
                transVertexOffsets[matIndex] += 3;
            } else {
                tPos = positions[matIndex];
                tNorm = normals[matIndex];
                tUv = uvs[matIndex];
                tInd = indices[matIndex];
                currentOffset = vertexOffsets[matIndex];
                vertexOffsets[matIndex] += 3;
            }

            tPos.push(...p1, ...p2, ...p3);
            tUv.push(...uv1, ...uv2, ...uv3);
            tNorm.push(...normal, ...normal, ...normal);

            tInd.push(currentOffset, currentOffset + 1, currentOffset + 2);
        };

        const pushQuad = (p1, p2, p3, p4, uv1, uv2, uv3, uv4, normal, matIndex, targetType) => {
            let tPos, tNorm, tUv, tInd, currentOffset;

            if (targetType === 'glass') {
                tPos = glassPositions[matIndex];
                tNorm = glassNormals[matIndex];
                tUv = glassUvs[matIndex];
                tInd = glassIndices[matIndex];
                currentOffset = glassVertexOffsets[matIndex];
                glassVertexOffsets[matIndex] += 4;
            } else if (targetType === 'trans') {
                tPos = transPositions[matIndex];
                tNorm = transNormals[matIndex];
                tUv = transUvs[matIndex];
                tInd = transIndices[matIndex];
                currentOffset = transVertexOffsets[matIndex];
                transVertexOffsets[matIndex] += 4;
            } else {
                tPos = positions[matIndex];
                tNorm = normals[matIndex];
                tUv = uvs[matIndex];
                tInd = indices[matIndex];
                currentOffset = vertexOffsets[matIndex];
                vertexOffsets[matIndex] += 4;
            }

            tPos.push(...p1, ...p2, ...p3, ...p4);
            tUv.push(...uv1, ...uv2, ...uv3, ...uv4);
            tNorm.push(...normal, ...normal, ...normal, ...normal);

            tInd.push(
                currentOffset, currentOffset + 1, currentOffset + 2,
                currentOffset + 2, currentOffset + 3, currentOffset
            );
        };

        // ─── FAST-PATH FOR LOD CHUNKS ───
        if (chunk.isLOD) {
            // LOD chunks only render the topmost visible surface block. No side faces, no bottoms.
            for (let lq = 0; lq < CHUNK_SIZE; lq++) {
                for (let lr = 0; lr < CHUNK_SIZE; lr++) {
                    const globalQ = chunk.cq * CHUNK_SIZE + lq;
                    const globalR = chunk.cr * CHUNK_SIZE + lr;

                    // Scan downwards to find highest solid/liquid block
                    let surfaceY = -1;
                    let surfaceId = 0;
                    for (let y = 63; y >= 0; y--) {
                        const id = chunk.getBlock(lq, lr, y);
                        if (id !== 0) {
                            surfaceY = y;
                            surfaceId = id;
                            break;
                        }
                    }

                    if (surfaceY !== -1) {
                        const def = blockSystem.getBlockDef(surfaceId);
                        if (!def) continue;

                        const topColorName = blockSystem.getColorName(def.topColor);
                        const topMatIndex = this.materialIndexMap.get(topColorName) ?? 0;

                        const worldPos = axialToWorld(globalQ, globalR);
                        const topY = surfaceY * BLOCK_HEIGHT + 1.0; // LOD chunks are flat 1.0 height

                        // Build Top Face
                        for (let i = 0; i < 6; i++) {
                            const c1 = corners[i];
                            const c2 = corners[(i + 1) % 6];

                            const uv1Top = [worldPos.x, worldPos.z];
                            const uv2Top = [worldPos.x + c2.x, worldPos.z + c2.y];
                            const uv3Top = [worldPos.x + c1.x, worldPos.z + c1.y];

                            const isTrans = def.transparent || def.translucent;
                            const isGlass = surfaceId === 9; // Specifically target glass for always-on outlines
                            const targetType = isGlass ? 'glass' : (isTrans ? 'trans' : 'solid');

                            // Add center, c2, c1 triangle (reversed winding for top face)
                            pushTri(
                                [worldPos.x, topY, worldPos.z],
                                [worldPos.x + c2.x, topY, worldPos.z + c2.y],
                                [worldPos.x + c1.x, topY, worldPos.z + c1.y],
                                uv1Top, uv2Top, uv3Top,
                                [0, 1, 0],
                                topMatIndex,
                                targetType
                            );

                            // --- LOD Boundary Side Faces ---
                            // To prevent LOD blocks from looking like floating paper-thin planes,
                            // we drop a huge quad down to y=0 for the chunk's outer edges. 
                            const offset = neighborOffsets[i];
                            const nlq = lq + offset.q;
                            const nlr = lr + offset.r;

                            // Check if this specific face points OUTSIDE the chunk 
                            // (or points to a much lower neighbor inside the chunk)
                            let needsSide = false;

                            if (nlq < 0 || nlq >= CHUNK_SIZE || nlr < 0 || nlr >= CHUNK_SIZE) {
                                // Face points outside this chunk's boundaries.
                                // In a perfect LOD system we'd check the neighbor chunk's LOD height,
                                // but dropping a solid side skirt guarantees no holes when looking horizontally.
                                needsSide = true;
                            } else {
                                // Face points inside the chunk. Only draw a side if the neighbor is significantly lower.
                                // Scan neighbor's surface
                                let nSurfaceY = -1;
                                for (let ny = 63; ny >= 0; ny--) {
                                    if (chunk.getBlock(nlq, nlr, ny) !== 0) {
                                        nSurfaceY = ny;
                                        break;
                                    }
                                }
                                if (nSurfaceY < surfaceY) {
                                    needsSide = true; // Drop a cliff down to neighbor's level
                                }
                            }

                            if (needsSide) {
                                // Draw a huge side plane from topY down to 0
                                const baseY = 0;

                                const dx = c2.x - c1.x;
                                const dz = c2.y - c1.y;
                                const normal = new THREE.Vector3(dz, 0, -dx).normalize().toArray();

                                // Simple stretched UVs just to get the base terrain color mapped
                                const uv1T = [0, topY];
                                const uv2T = [1, topY];
                                const uv2B = [1, baseY];
                                const uv1B = [0, baseY];

                                pushQuad(
                                    [worldPos.x + c1.x, topY, worldPos.z + c1.y],
                                    [worldPos.x + c2.x, topY, worldPos.z + c2.y],
                                    [worldPos.x + c2.x, baseY, worldPos.z + c2.y],
                                    [worldPos.x + c1.x, baseY, worldPos.z + c1.y],
                                    uv1T, uv2T, uv2B, uv1B,
                                    normal, topMatIndex,
                                    targetType
                                );
                            }
                        }
                    }
                }
            }
        }
        else {
            // ─── DETAILED CHUNK PATH ───
            // Iterate all blocks in the chunk data
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
                const isGlass = block.id === 9; // Specifically target glass for always-on outlines
                const targetType = isGlass ? 'glass' : (isTrans ? 'trans' : 'solid');

                const isSolidFn = (id) => {
                    if (id === 0) return false;
                    const d = blockSystem.getBlockDef(id);
                    return d && d.hardness > 0;
                };

                // block.q and block.r are already global owing to chunk.getBlocks()
                const globalQ = block.q;
                const globalR = block.r;

                // Calculate exact seeded height, or flatten to 0.5 if it's Water
                const blockAboveId = chunkSystem ? chunkSystem.getBlockGlobal(globalQ, globalR, block.y + 1) : 0;
                const blockHeight = chunk.isLOD ? 1.0 : (def.name === 'water' ? 0.5 : getSeededBlockHeight(globalQ, globalR, block.y, seed, blockAboveId, isSolidFn));

                // Top Face (Center + 6 corners = 6 triangles)
                const topY = yOffset + blockHeight;
                const splitY = yOffset + (blockHeight * BASE_RATIO);
                const baseY = yOffset;

                // Updated neighbor face culling logic that factors in variable heights
                const shouldRenderFace = (gq, gr, gy, myDef, myHeight, isSide = false) => {
                    if (!chunkSystem) return true;
                    const nid = chunkSystem.getBlockGlobal(gq, gr, gy);

                    // If no block there, definitely render the face
                    if (nid === 0) return true;

                    const nDef = blockSystem.getBlockDef(nid);
                    if (!nDef) return true;

                    const nTrans = nDef.transparent || nDef.translucent;

                    // SPECIAL LOGIC FOR VARIABLE HEIGHT BLOCKS
                    // Only needed for horizontal side faces
                    if (isSide && myHeight > 0.4) { // If I am taller than the minimum
                        // Get the exact height of the neighbor block to see if it covers me
                        const nBlockAboveId = chunkSystem.getBlockGlobal(gq, gr, gy + 1);
                        const nHeight = chunk.isLOD ? 1.0 : (nDef.name === 'water' ? 0.5 : getSeededBlockHeight(gq, gr, gy, seed, nBlockAboveId, isSolidFn));

                        // If my neighbor is solid but shorter than me, part of my upper side will be exposed!
                        if (!nTrans && nHeight < myHeight) {
                            return true;
                        }
                    }

                    // If neighbor is solid opaque, don't render face against it
                    if (!nTrans) return false;

                    // If both are translucent of the same type (e.g. water touching water), cull face
                    if (myDef.translucent && nDef.translucent && nid === block.id) return false;

                    // If both are transparent of the same type (e.g. leaves touching leaves), cull face to save polygons
                    if (myDef.transparent && nDef.transparent && nid === block.id) return false;

                    return true;
                };

                // Build Top Face
                if (shouldRenderFace(globalQ, globalR, block.y + 1, def, blockHeight, false)) {
                    for (let i = 0; i < 6; i++) {
                        const c1 = corners[i];
                        const c2 = corners[(i + 1) % 6];

                        // Add center, c2, c1 triangle (reversed winding for top face)
                        pushTri(
                            [worldPos.x, topY, worldPos.z],
                            [worldPos.x + c2.x, topY, worldPos.z + c2.y],
                            [worldPos.x + c1.x, topY, worldPos.z + c1.y],
                            [worldPos.x, worldPos.z],
                            [worldPos.x + c2.x, worldPos.z + c2.y],
                            [worldPos.x + c1.x, worldPos.z + c1.y],
                            [0, 1, 0],
                            topMatIndex,
                            targetType
                        );
                    }
                }

                // Build Bottom Face
                if (shouldRenderFace(globalQ, globalR, block.y - 1, def, blockHeight, false)) {
                    for (let i = 0; i < 6; i++) {
                        const c1 = corners[i];
                        const c2 = corners[(i + 1) % 6];

                        // Add center, c1, c2 triangle (normal winding for bottom face)
                        pushTri(
                            [worldPos.x, baseY, worldPos.z],
                            [worldPos.x + c1.x, baseY, worldPos.z + c1.y],
                            [worldPos.x + c2.x, baseY, worldPos.z + c2.y],
                            [worldPos.x, worldPos.z],
                            [worldPos.x + c1.x, worldPos.z + c1.y],
                            [worldPos.x + c2.x, worldPos.z + c2.y],
                            [0, -1, 0],
                            baseMatIndex,
                            targetType
                        );
                    }
                }

                // Build 6 Sides
                for (let i = 0; i < 6; i++) {
                    const offset = neighborOffsets[i];
                    if (!shouldRenderFace(globalQ + offset.q, globalR + offset.r, block.y, def, blockHeight, true)) {
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
                    pushQuad(
                        [worldPos.x + c1.x, topY, worldPos.z + c1.y],
                        [worldPos.x + c2.x, topY, worldPos.z + c2.y],
                        [worldPos.x + c2.x, splitY, worldPos.z + c2.y],
                        [worldPos.x + c1.x, splitY, worldPos.z + c1.y],
                        uv1Top, uv2Top, uv2Mid, uv1Mid,
                        normal, topMatIndex,
                        targetType
                    );

                    // Base Section Quad (75%)
                    pushQuad(
                        [worldPos.x + c1.x, splitY, worldPos.z + c1.y],
                        [worldPos.x + c2.x, splitY, worldPos.z + c2.y],
                        [worldPos.x + c2.x, baseY, worldPos.z + c2.y],
                        [worldPos.x + c1.x, baseY, worldPos.z + c1.y],
                        uv1Mid, uv2Mid, uv2Bot, uv1Bot,
                        normal, baseMatIndex,
                        targetType
                    );
                }
            }
        } // End Detailed Path

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
        const glassMesh = buildMesh(glassPositions, glassNormals, glassUvs, glassIndices, this.transparentMaterialArray);

        const group = new THREE.Group();
        if (solidMesh && solidMesh.geometry.attributes.position.count > 0) {
            group.add(solidMesh);

            // Add block outlines if globally enabled, or if it's an LOD chunk faking depth
            if (blockSystem.showOutlines || chunk.isLOD) {
                const edges = new THREE.EdgesGeometry(solidMesh.geometry, 1); // 1 deg threshold for sharp hex edges
                if (edges.attributes.position.count > 0) {
                    const lineGeom = new LineSegmentsGeometry().fromEdgesGeometry(edges);

                    // Use black LOD lines for distant chunks, otherwise white standard lines
                    const mat = chunk.isLOD ? this.lodOutlineMaterial : this.outlineMaterial;
                    const outline = new Line2(lineGeom, mat);

                    group.add(outline);
                }
            }
        }
        if (transMesh && transMesh.geometry.attributes.position.count > 0) {
            group.add(transMesh);

            // Add outlines for transparent blocks only if enabled
            if (blockSystem.showOutlines) {
                const edges = new THREE.EdgesGeometry(transMesh.geometry, 1);
                if (edges.attributes.position.count > 0) {
                    const lineGeom = new LineSegmentsGeometry().fromEdgesGeometry(edges);
                    const outline = new Line2(lineGeom, this.outlineMaterial);
                    group.add(outline);
                }
            }
        }
        if (glassMesh && glassMesh.geometry.attributes.position.count > 0) {
            group.add(glassMesh);
        }

        return group;
    }
}
