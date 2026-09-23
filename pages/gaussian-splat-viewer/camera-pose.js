/**
 * Camera pose codec for the Gaussian splat viewer.
 * A pose is position, rotation (quaternion xyzw), orbit target, up, and
 * perspective (fov, zoom, near, far). The gsv1 string and the JSON object
 * carry the same numbers, so either one restores the same camera.
 */

const STRING_PREFIX = 'gsv1';
const FIELD_COUNT = 17;

export function readCameraPose(camera, controls) {
    settleControls(controls);
    const forward = lookDirection(camera);
    const target = controls
        ? [controls.target.x, controls.target.y, controls.target.z]
        : [
            camera.position.x + forward[0],
            camera.position.y + forward[1],
            camera.position.z + forward[2]
        ];
    return {
        v: 1,
        position: [camera.position.x, camera.position.y, camera.position.z],
        rotation: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
        target,
        up: [camera.up.x, camera.up.y, camera.up.z],
        fov: camera.fov,
        zoom: camera.zoom,
        near: camera.near,
        far: camera.far
    };
}

export function writeCameraPose(camera, controls, pose) {
    const up = pose.up || [0, 1, 0];
    camera.up.set(up[0], up[1], up[2]);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.fov = pose.fov;
    camera.zoom = pose.zoom;
    camera.near = pose.near;
    camera.far = pose.far;
    const savedTarget = pose.target || targetAlongView(pose.position, pose.rotation, 5);
    if (pose.lookAtTarget) {
        if (controls) controls.target.set(savedTarget[0], savedTarget[1], savedTarget[2]);
        camera.lookAt(savedTarget[0], savedTarget[1], savedTarget[2]);
    } else {
        camera.quaternion.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], pose.rotation[3]);
        const distance = Math.hypot(
            pose.position[0] - savedTarget[0],
            pose.position[1] - savedTarget[1],
            pose.position[2] - savedTarget[2]
        ) || 5;
        const forward = directionFromQuaternion(pose.rotation);
        const target = [
            pose.position[0] + forward[0] * distance,
            pose.position[1] + forward[1] * distance,
            pose.position[2] + forward[2] * distance
        ];
        if (controls) controls.target.set(target[0], target[1], target[2]);
    }
    camera.updateProjectionMatrix();
    settleControls(controls);
}

export function poseToString(pose) {
    const numbers = stringNumbers(pose);
    return `${STRING_PREFIX} ${numbers.map(formatNumber).join(' ')}`;
}

export function poseToJSON(pose) {
    return JSON.stringify(pose, null, 2);
}

export function parseCameraPose(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('Paste a gsv1 camera string or camera JSON');
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parsePoseJSON(trimmed);
    if (/^gsv1\b/i.test(trimmed)) return parsePoseString(trimmed);
    throw new Error('Use a gsv1 camera string or a camera JSON object');
}

export function settleControls(controls) {
    if (!controls || typeof controls.update !== 'function') return;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
}

function parsePoseString(text) {
    const body = text.replace(/^gsv1\b/i, '').trim();
    const parts = body.split(/[\s,]+/).filter(Boolean);
    if (parts.length !== FIELD_COUNT) {
        throw new Error(`A gsv1 string needs ${FIELD_COUNT} numbers: position, rotation, target, up, fov, zoom, near, far`);
    }
    const n = parts.map(parseNumber);
    return validatePose({
        v: 1,
        position: n.slice(0, 3),
        rotation: n.slice(3, 7),
        target: n.slice(7, 10),
        up: n.slice(10, 13),
        fov: n[13],
        zoom: n[14],
        near: n[15],
        far: n[16]
    });
}

function parsePoseJSON(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        throw new Error('That JSON could not be read');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Camera JSON must be an object');
    }
    const position = readVec3(data.position, 'position');
    const rotation = readQuat(data.rotation || data.quaternion);
    const target = readOptionalVec3(data.target || data.lookAt);
    const up = readOptionalVec3(data.up) || [0, 1, 0];
    if (!rotation && !target) {
        throw new Error('Camera JSON needs a rotation quaternion or a target');
    }
    const fov = readNumber(data.fov ?? data.perspective, 'fov');
    const zoom = data.zoom === undefined ? 1 : readNumber(data.zoom, 'zoom');
    const near = data.near === undefined ? 0.05 : readNumber(data.near, 'near');
    const far = data.far === undefined ? 500 : readNumber(data.far, 'far');
    return validatePose({
        v: 1,
        position,
        rotation: rotation || undefined,
        target: target || undefined,
        up,
        fov,
        zoom,
        near,
        far
    });
}

function validatePose(pose) {
    if (!pose.rotation) {
        pose.rotation = rotationFromView(pose.position, pose.target, pose.up);
        pose.lookAtTarget = true;
    }
    pose.rotation = unitQuaternion(pose.rotation);
    if (!pose.target) pose.target = targetAlongView(pose.position, pose.rotation, 5);
    const offset = [
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2]
    ];
    if (Math.hypot(offset[0], offset[1], offset[2]) < 1e-8) {
        throw new Error('Camera position and target are the same point');
    }
    if (Math.hypot(pose.up[0], pose.up[1], pose.up[2]) < 1e-8) {
        throw new Error('Camera up vector has zero length');
    }
    if (!(pose.fov > 0 && pose.fov < 180)) throw new Error('Field of view must be between 0 and 180');
    if (!(pose.zoom > 0)) throw new Error('Zoom must be greater than 0');
    if (!(pose.near > 0) || !(pose.far > pose.near)) throw new Error('Near and far planes are not usable');
    return pose;
}

function stringNumbers(pose) {
    return [
        ...pose.position,
        ...pose.rotation,
        ...pose.target,
        ...pose.up,
        pose.fov,
        pose.zoom,
        pose.near,
        pose.far
    ];
}

function formatNumber(value) {
    return Object.is(value, -0) ? '-0' : String(value);
}

function parseNumber(token) {
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error(`“${token}” is not a number`);
    return value;
}

function readNumber(value, label) {
    const number = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(number)) throw new Error(`Camera JSON is missing a valid ${label}`);
    return number;
}

function readVec3(value, label) {
    const vec = readOptionalVec3(value);
    if (!vec) throw new Error(`Camera JSON is missing ${label}`);
    return vec;
}

function readOptionalVec3(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
        if (value.length !== 3) return null;
        return value.map((part, index) => readNumber(part, `vector ${index}`));
    }
    if (typeof value === 'object' && value.x !== undefined) {
        return [readNumber(value.x, 'x'), readNumber(value.y, 'y'), readNumber(value.z, 'z')];
    }
    return null;
}

function readQuat(value) {
    if (!value) return null;
    let parts = null;
    if (Array.isArray(value) && value.length === 4) parts = value;
    else if (typeof value === 'object' && value.w !== undefined) parts = [value.x, value.y, value.z, value.w];
    if (!parts) return null;
    return parts.map((part, index) => readNumber(part, `quaternion ${index}`));
}

function unitQuaternion(q) {
    const length = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!(length > 0)) throw new Error('Rotation quaternion has zero length');
    if (Math.abs(length - 1) < 1e-8) return q;
    return q.map((part) => part / length);
}

function lookDirection(camera) {
    const q = camera.quaternion;
    const x = q.x;
    const y = q.y;
    const z = q.z;
    const w = q.w;
    const vx = 2 * (x * z + w * y);
    const vy = 2 * (y * z - w * x);
    const vz = 1 - 2 * (x * x + y * y);
    return [-vx, -vy, -vz];
}

function targetAlongView(position, rotation, distance) {
    const dir = directionFromQuaternion(rotation);
    return [
        position[0] + dir[0] * distance,
        position[1] + dir[1] * distance,
        position[2] + dir[2] * distance
    ];
}

function directionFromQuaternion(q) {
    const x = q[0];
    const y = q[1];
    const z = q[2];
    const w = q[3];
    const vx = 2 * (x * z + w * y);
    const vy = 2 * (y * z - w * x);
    const vz = 1 - 2 * (x * x + y * y);
    return [-vx, -vy, -vz];
}

function rotationFromView(position, target, up) {
    const zx = position[0] - target[0];
    const zy = position[1] - target[1];
    const zz = position[2] - target[2];
    const zLen = Math.hypot(zx, zy, zz) || 1;
    const zAxis = [zx / zLen, zy / zLen, zz / zLen];
    const xAxis = cross(up, zAxis);
    const xLen = Math.hypot(xAxis[0], xAxis[1], xAxis[2]);
    if (xLen < 1e-8) return [0, 0, 0, 1];
    xAxis[0] /= xLen;
    xAxis[1] /= xLen;
    xAxis[2] /= xLen;
    const yAxis = cross(zAxis, xAxis);
    return quaternionFromBasis(xAxis, yAxis, zAxis);
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function quaternionFromBasis(xAxis, yAxis, zAxis) {
    const m00 = xAxis[0];
    const m10 = xAxis[1];
    const m20 = xAxis[2];
    const m01 = yAxis[0];
    const m11 = yAxis[1];
    const m21 = yAxis[2];
    const m02 = zAxis[0];
    const m12 = zAxis[1];
    const m22 = zAxis[2];
    const trace = m00 + m11 + m22;
    let x;
    let y;
    let z;
    let w;
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        w = 0.25 * s;
        x = (m21 - m12) / s;
        y = (m02 - m20) / s;
        z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }
    return unitQuaternion([x, y, z, w]);
}
