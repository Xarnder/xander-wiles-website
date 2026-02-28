/**
 * WaypointManager — Creates, stores, and renders waypoint beacons in the 3D world.
 * Waypoints are per-world, stored in IndexedDB, and rendered as tall light beams.
 */

import * as THREE from 'three';
import { openDB, promisifyRequest } from '../storage/ArkonhexDB.js';
import { axialToWorld, worldToAxial } from '../utils/HexUtils.js';

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Soft pastel beam colors to cycle through
const BEAM_COLORS = [
    0x55efc4, // mint
    0x74b9ff, // sky blue
    0xffeaa7, // soft yellow
    0xfd79a8, // pink
    0xa29bfe, // lavender
    0xdfe6e9, // light grey
    0xfab1a0, // salmon
    0x81ecec, // cyan
];

export class WaypointManager {
    constructor(engine) {
        this.engine = engine;
        this.waypoints = []; // in-memory cache
        this.beams = new Map(); // id -> THREE.Group
        this.worldId = null;
    }

    /**
     * Load all waypoints for the given world from IndexedDB.
     */
    async loadWaypoints(worldId) {
        this.worldId = worldId;
        this.clearAll();

        const db = await openDB();
        const tx = db.transaction('waypoints', 'readonly');
        const index = tx.objectStore('waypoints').index('worldId');
        const all = await promisifyRequest(index.getAll(worldId));

        this.waypoints = all || [];

        // Create 3D beams for each
        for (const wp of this.waypoints) {
            if (wp.visible !== false) {
                this._createBeamMesh(wp);
            }
        }

        console.log(`[WaypointManager] Loaded ${this.waypoints.length} waypoints`);
    }

    /**
     * Create a new waypoint at the given world position.
     */
    async createWaypoint(name, position) {
        const wp = {
            id: generateUUID(),
            worldId: this.worldId,
            name: name || `Waypoint ${this.waypoints.length + 1}`,
            x: position.x,
            y: position.y,
            z: position.z,
            color: BEAM_COLORS[this.waypoints.length % BEAM_COLORS.length],
            visible: true,
            createdAt: Date.now()
        };

        // Save to DB
        const db = await openDB();
        const tx = db.transaction('waypoints', 'readwrite');
        tx.objectStore('waypoints').put(wp);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        this.waypoints.push(wp);
        this._createBeamMesh(wp);

        console.log(`[WaypointManager] Created waypoint "${wp.name}" at (${wp.x.toFixed(1)}, ${wp.y.toFixed(1)}, ${wp.z.toFixed(1)})`);
        return wp;
    }

    /**
     * Delete a waypoint by ID.
     */
    async deleteWaypoint(id) {
        const db = await openDB();
        const tx = db.transaction('waypoints', 'readwrite');
        tx.objectStore('waypoints').delete(id);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        this.waypoints = this.waypoints.filter(w => w.id !== id);
        this._removeBeamMesh(id);

        console.log(`[WaypointManager] Deleted waypoint ${id}`);
    }

    /**
     * Rename a waypoint.
     */
    async renameWaypoint(id, newName) {
        const wp = this.waypoints.find(w => w.id === id);
        if (!wp) return;

        wp.name = newName.trim() || wp.name;

        const db = await openDB();
        const tx = db.transaction('waypoints', 'readwrite');
        tx.objectStore('waypoints').put(wp);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Toggle visibility of a waypoint beam.
     */
    async toggleWaypoint(id) {
        const wp = this.waypoints.find(w => w.id === id);
        if (!wp) return;

        wp.visible = !wp.visible;

        // Update DB
        const db = await openDB();
        const tx = db.transaction('waypoints', 'readwrite');
        tx.objectStore('waypoints').put(wp);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });

        if (wp.visible) {
            this._createBeamMesh(wp);
        } else {
            this._removeBeamMesh(id);
        }
    }

    /**
     * Remove all beams from the scene (used on world exit).
     */
    clearAll() {
        for (const [id, group] of this.beams) {
            this.engine.scene.remove(group);
            group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        this.beams.clear();
        this.waypoints = [];
    }

    /**
     * Build a tall glowing beam pillar for a waypoint.
     */
    _createBeamMesh(wp) {
        if (this.beams.has(wp.id)) return; // Already exists

        const beamHeight = 300;
        const beamRadius = 0.3;

        const group = new THREE.Group();

        // Inner core beam (bright, narrow)
        const coreGeom = new THREE.CylinderGeometry(beamRadius * 0.4, beamRadius * 0.4, beamHeight, 6);
        const coreMat = new THREE.MeshBasicMaterial({
            color: wp.color,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const core = new THREE.Mesh(coreGeom, coreMat);
        core.position.y = beamHeight / 2;
        group.add(core);

        // Outer glow beam (wider, more transparent)
        const glowGeom = new THREE.CylinderGeometry(beamRadius, beamRadius, beamHeight, 6);
        const glowMat = new THREE.MeshBasicMaterial({
            color: wp.color,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        glow.position.y = beamHeight / 2;
        group.add(glow);

        // Position at waypoint world coords
        group.position.set(wp.x, 0, wp.z);

        this.engine.scene.add(group);
        this.beams.set(wp.id, group);
    }

    /**
     * Remove a beam mesh from the scene.
     */
    _removeBeamMesh(id) {
        const group = this.beams.get(id);
        if (!group) return;

        this.engine.scene.remove(group);
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        this.beams.delete(id);
    }
}
