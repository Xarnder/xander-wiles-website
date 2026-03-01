import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Create a simple geometry with duplicate vertices (like 2 adjacent planes)
const geom = new THREE.BufferGeometry();
const vertices = new Float32Array([
  0,0,0, 1,0,0, 1,1,0, // Tri 1
  0,0,0, 1,1,0, 0,1,0, // Tri 2 (forms a square 0,0 to 1,1)
  
  1,0,0, 2,0,0, 2,1,0, // Tri 3
  1,0,0, 2,1,0, 1,1,0  // Tri 4 (forms a square 1,0 to 2,1, sharing the X=1 edge)
]);
geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

console.log("Original Vertices:", geom.attributes.position.count);
const edges1 = new THREE.EdgesGeometry(geom, 1);
console.log("Original Edges:", edges1.attributes.position.count / 2); // each line segment is 2 verts

const merged = mergeVertices(geom);
console.log("Merged Vertices:", merged.attributes.position.count);
const edges2 = new THREE.EdgesGeometry(merged, 1);
console.log("Merged Edges:", edges2.attributes.position.count / 2);
