import { describe, expect, it } from 'vitest';
import {
	POSE_BYTES,
	POSE_FLAGS,
	SNAPSHOT_ENTRY_BYTES,
	SNAPSHOT_HEADER_BYTES,
	decodePose,
	decodeSnapshot,
	encodePose,
	encodeSnapshot,
	fromWireTime,
	parseClientMessage,
	sanitizeColour,
	sanitizeDisplayName,
	toWireTime
} from '../protocol';

describe('pose codec', () => {
	it('round-trips a pose in exactly 24 bytes', () => {
		const pose = {
			flags: POSE_FLAGS.moving | POSE_FLAGS.running,
			seq: 65535,
			sampleTime: 1_760_000_123_456,
			x: 1234.5678,
			y: 42.25,
			z: -9876.125,
			yaw: 1.2345,
			pitch: -0.4
		};
		const bytes = encodePose(pose);
		expect(bytes.byteLength).toBe(POSE_BYTES);
		const decoded = decodePose(bytes)!;
		expect(decoded.flags).toBe(pose.flags);
		expect(decoded.seq).toBe(65535);
		expect(decoded.sampleTime).toBe(toWireTime(pose.sampleTime));
		expect(decoded.x).toBeCloseTo(pose.x, 3);
		expect(decoded.y).toBeCloseTo(pose.y, 4);
		expect(decoded.z).toBeCloseTo(pose.z, 3);
		expect(decoded.yaw).toBeCloseTo(pose.yaw, 3);
		expect(decoded.pitch).toBeCloseTo(pose.pitch, 3);
	});

	it('wraps yaw into [0, 2π) and clamps pitch', () => {
		const decoded = decodePose(
			encodePose({ flags: 0, seq: 0, sampleTime: 0, x: 0, y: 0, z: 0, yaw: -Math.PI / 2, pitch: 3 })
		)!;
		expect(decoded.yaw).toBeCloseTo((3 * Math.PI) / 2, 3);
		expect(decoded.pitch).toBeCloseTo(Math.PI / 2, 4);
	});

	it('rejects malformed binary', () => {
		expect(decodePose(new ArrayBuffer(10))).toBeNull();
		const wrongType = new Uint8Array(POSE_BYTES);
		wrongType[0] = 0x7f;
		expect(decodePose(wrongType.buffer)).toBeNull();
	});
});

describe('snapshot codec', () => {
	it('round-trips entries at 6 + 20n bytes', () => {
		const snapshot = {
			serverTime: 1_760_000_000_000,
			entries: [
				{ slot: 0, flags: 1, x: 1, y: 2, z: 3, yaw: 0.5, pitch: 0.1, sampleAgeMs: 42 },
				{ slot: 19, flags: 9, x: -5, y: 6, z: 7, yaw: 6, pitch: -1, sampleAgeMs: 70000 }
			]
		};
		const bytes = encodeSnapshot(snapshot);
		expect(bytes.byteLength).toBe(SNAPSHOT_HEADER_BYTES + 2 * SNAPSHOT_ENTRY_BYTES);
		const decoded = decodeSnapshot(bytes)!;
		expect(decoded.serverTime).toBe(toWireTime(snapshot.serverTime));
		expect(decoded.entries).toHaveLength(2);
		expect(decoded.entries[1]!.slot).toBe(19);
		expect(decoded.entries[1]!.sampleAgeMs).toBe(65535);
		expect(decoded.entries[0]!.yaw).toBeCloseTo(0.5, 3);
	});

	it('rejects a truncated snapshot', () => {
		const bytes = encodeSnapshot({
			serverTime: 0,
			entries: [{ slot: 1, flags: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, sampleAgeMs: 0 }]
		});
		expect(decodeSnapshot(bytes.slice(0, bytes.byteLength - 1))).toBeNull();
	});
});

describe('wire time', () => {
	it('recovers full timestamps across the 32-bit wrap', () => {
		const full = 2 ** 32 * 409 + 5;
		expect(fromWireTime(toWireTime(full), full - 1000)).toBe(full);
		expect(fromWireTime(toWireTime(full), full + 1000)).toBe(full);
		const beforeWrap = 2 ** 32 * 409 - 10;
		expect(fromWireTime(toWireTime(beforeWrap), full)).toBe(beforeWrap);
	});
});

describe('message validation', () => {
	it('sanitizes display names to 2–20 printable characters', () => {
		expect(sanitizeDisplayName('  Sam   the\tBuilder ')).toBe('Sam the Builder');
		expect(sanitizeDisplayName('A')).toBeNull();
		expect(sanitizeDisplayName('x'.repeat(40))).toHaveLength(20);
		expect(sanitizeDisplayName(42)).toBeNull();
	});

	it('accepts only #rrggbb colours', () => {
		expect(sanitizeColour('#AABBCC')).toBe('#aabbcc');
		expect(sanitizeColour('red')).toBeNull();
	});

	it('parses only known client messages', () => {
		expect(parseClientMessage('{"t":"ping","c":12}')).toEqual({ t: 'ping', c: 12 });
		expect(parseClientMessage('{"t":"nope"}')).toBeNull();
		expect(parseClientMessage('not json')).toBeNull();
	});
});
