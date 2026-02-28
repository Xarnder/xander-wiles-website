import * as THREE from 'three';
import { HEX_SIZE, axialToWorld } from '../utils/HexUtils.js';

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
    constructor() {
        // High quality physical material for terrain
        this.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.FrontSide
        });

        this.transparentMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            side: THREE.FrontSide
        });
    }

    /**
     * Builds a single merged BufferGeometry for an entire chunk.
     * Uses vertex colors to distinguish block types and top/base sections.
     * @param {Chunk} chunk - The chunk data structure
     * @param {BlockSystem} blockSystem - Reference to block definitions
     * @param {ChunkSystem} chunkSystem - Reference to chunk system for neighboring queries
     */
    buildChunkMesh(chunk, blockSystem, chunkSystem) {
        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];

        const transPositions = [];
        const transNormals = [];
        const transColors = [];
        const transIndices = [];

        let vertexOffset = 0;
        let transVertexOffset = 0;

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

            const topColor = blockSystem.getColor(def.topColor);
            const baseColor = blockSystem.getColor(def.baseColor);

            // Deep water darker tint
            let finalTopColor = [...topColor];
            let finalBaseColor = [...baseColor];

            if (def.translucent) {
                // Determine depth below sea level (16)
                const depthOffset = Math.max(0, 16 - block.y); // Example: y=10 means offset=6
                const darkness = Math.min(0.7, depthOffset * 0.05); // Max 70% dark

                // Sap RGB relative to darkness factor, heavily taxing green/red to push dark blue
                finalTopColor = [
                    Math.max(0, topColor[0] * (1.0 - darkness)),
                    Math.max(0, topColor[1] * (0.8 - darkness)),
                    Math.max(0, topColor[2] * (1.0 - (darkness * 0.5)))
                ];

                finalBaseColor = [
                    Math.max(0, baseColor[0] * (1.0 - darkness)),
                    Math.max(0, baseColor[1] * (0.8 - darkness)),
                    Math.max(0, baseColor[2] * (1.0 - (darkness * 0.5)))
                ];
            }

            // Determine if we need to render faces based on neighbors (Frustum/Face Culling)
            // For now, render all faces of active blocks, we will optimize face culling next.
            const worldPos = axialToWorld(block.q, block.r);
            const yOffset = block.y * BLOCK_HEIGHT;

            // Choose the correct arrays based on transparency
            const isTrans = def.transparent || def.translucent;
            const tPos = isTrans ? transPositions : positions;
            const tNorm = isTrans ? transNormals : normals;
            const tCol = isTrans ? transColors : colors;
            const tInd = isTrans ? transIndices : indices;
            let currentOffset = isTrans ? transVertexOffset : vertexOffset;

            // Helper to add a quad
            const addQuad = (p1, p2, p3, p4, normal, color) => {
                tPos.push(...p1, ...p2, ...p3, ...p4);
                tNorm.push(...normal, ...normal, ...normal, ...normal);
                tCol.push(...color, ...color, ...color, ...color);

                tInd.push(
                    currentOffset, currentOffset + 1, currentOffset + 2,
                    currentOffset + 2, currentOffset + 3, currentOffset
                );
                currentOffset += 4;
            };

            // block.q and block.r are already global owing to chunk.getBlocks()
            const globalQ = block.q;
            const globalR = block.r;

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
                    tPos.push(
                        worldPos.x, topY, worldPos.z,
                        worldPos.x + c2.x, topY, worldPos.z + c2.y,
                        worldPos.x + c1.x, topY, worldPos.z + c1.y
                    );
                    tNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
                    tCol.push(...finalTopColor, ...finalTopColor, ...finalTopColor);
                    tInd.push(currentOffset, currentOffset + 1, currentOffset + 2);
                    currentOffset += 3;
                }
            }

            // Build Bottom Face
            if (shouldRenderFace(globalQ, globalR, block.y - 1, def)) {
                for (let i = 0; i < 6; i++) {
                    const c1 = corners[i];
                    const c2 = corners[(i + 1) % 6];

                    tPos.push(
                        worldPos.x, baseY, worldPos.z,
                        worldPos.x + c1.x, baseY, worldPos.z + c1.y,
                        worldPos.x + c2.x, baseY, worldPos.z + c2.y
                    );
                    tNorm.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
                    tCol.push(...finalBaseColor, ...finalBaseColor, ...finalBaseColor);
                    tInd.push(currentOffset, currentOffset + 1, currentOffset + 2);
                    currentOffset += 3;
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

                // Top Section Quad (25%)
                addQuad(
                    [worldPos.x + c1.x, topY, worldPos.z + c1.y],
                    [worldPos.x + c2.x, topY, worldPos.z + c2.y],
                    [worldPos.x + c2.x, splitY, worldPos.z + c2.y],
                    [worldPos.x + c1.x, splitY, worldPos.z + c1.y],
                    normal, finalTopColor
                );

                // Base Section Quad (75%)
                addQuad(
                    [worldPos.x + c1.x, splitY, worldPos.z + c1.y],
                    [worldPos.x + c2.x, splitY, worldPos.z + c2.y],
                    [worldPos.x + c2.x, baseY, worldPos.z + c2.y],
                    [worldPos.x + c1.x, baseY, worldPos.z + c1.y],
                    normal, finalBaseColor
                );
            }

            // Update offsets
            if (isTrans) {
                transVertexOffset = currentOffset;
            } else {
                vertexOffset = currentOffset;
            }
        }

        const buildMesh = (pos, norm, col, ind, mat) => {
            if (pos.length === 0) return null;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            geometry.setIndex(ind);

            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();
            geometry.computeVertexNormals(); // Optional but helps lighting accuracy

            const mesh = new THREE.Mesh(geometry, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };

        const solidMesh = buildMesh(positions, normals, colors, indices, this.material);
        const transMesh = buildMesh(transPositions, transNormals, transColors, transIndices, this.transparentMaterial);

        const group = new THREE.Group();
        if (solidMesh) group.add(solidMesh);
        if (transMesh) group.add(transMesh);

        return group;
    }
}
