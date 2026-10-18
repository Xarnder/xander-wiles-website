import { randomToken, sha256Hex } from '../../src/lib/game/net/capability';
import { MAX_WORLD_JSON_BYTES, isValidWorldId } from '../../src/lib/game/net/protocol';
import { maxSpeedForRunSpeed } from '../../src/lib/game/net/RoomCore';
import type { Env } from './env';
import { isRecord, readLimitedBody } from './http';
import { getUsage } from './usage';
import type { WorldAccess, WorldManifest } from './WorldRoom';

export { WorldRoom } from './WorldRoom';

/**
 * Routes:
 *
 *   GET  /health                  liveness check
 *   POST /w                       publish a world (admin only) → { worldId, name, invites }
 *   GET  /w/:worldId/snapshot     the published world + its manifest (needs an invite token)
 *   GET  /w/:worldId/ws           WebSocket upgrade into that world's room
 *   GET  /w/:worldId/export       the live world as one record (owner only)
 *   GET  /w/:worldId/restore-points            earlier versions kept (owner only)
 *   POST /w/:worldId/restore  { pointId }      go back to one (owner only; everyone resyncs)
 *
 * Each world is one Durable Object, addressed by name. `locationHint: 'weur'` asks for it to be
 * created in Western Europe, near the UK players it's for (best effort; it never moves afterwards).
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');
		if (origin && !isAllowedOrigin(origin, env)) {
			return new Response('Origin not allowed', { status: 403 });
		}
		const cors = corsHeaders(origin);

		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
		if (url.pathname === '/health') return json({ ok: true }, 200, cors);
		if (url.pathname === '/w' && request.method === 'POST') return publish(request, env, cors);

		const match = /^\/w\/([^/]+)\/(snapshot|ws|export|restore-points|restore|usage)$/.exec(
			url.pathname
		);
		if (match && isValidWorldId(match[1])) {
			const room = env.WORLD_ROOM.get(env.WORLD_ROOM.idFromName(match[1]), {
				locationHint: 'weur'
			});
			if (match[2] === 'ws') return room.fetch(request);
			const method = match[2] === 'restore' ? 'POST' : 'GET';
			if (request.method !== method) return json({ error: 'Method not allowed' }, 405, cors);
			const body = method === 'POST' ? await readLimitedBody(request, 1024) : undefined;
			if (body === null) return json({ error: 'Request too large.' }, 413, cors);
			const response = await room.fetch(
				new Request(`https://room/w/${match[1]}/${match[2]}`, {
					method,
					headers: { Authorization: request.headers.get('Authorization') ?? '' },
					body
				})
			);
			if (match[2] === 'usage' && response.ok) return json(await getUsage(env), 200, cors);
			return withHeaders(response, cors);
		}

		return json({ error: 'Not found' }, 404, cors);
	}
} satisfies ExportedHandler<Env>;

async function publish(
	request: Request,
	env: Env,
	cors: Record<string, string>
): Promise<Response> {
	if (!env.ADMIN_SECRET) {
		return json({ error: 'Publishing is not configured on this server.' }, 503, cors);
	}
	const supplied = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
	if (!(await secretsMatch(supplied, env.ADMIN_SECRET))) {
		return json({ error: 'That admin key is not right.' }, 401, cors);
	}

	const text = await readLimitedBody(request, MAX_WORLD_JSON_BYTES + 1024);
	if (text === null) {
		return json({ error: 'That world is too large to publish (10 MB limit).' }, 413, cors);
	}

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return json({ error: 'The request was not valid JSON.' }, 400, cors);
	}
	const world = isRecord(body) ? body.world : undefined;
	if (
		!isRecord(body) ||
		!isRecord(world) ||
		typeof world.name !== 'string' ||
		typeof world.seed !== 'string' ||
		!Number.isSafeInteger(world.schemaVersion) ||
		!isRecord(world.environment) ||
		typeof body.generatorVersion !== 'number' ||
		!Number.isSafeInteger(body.generatorVersion)
	) {
		return json({ error: 'That does not look like a Forest Drift world.' }, 400, cors);
	}

	const worldId = crypto.randomUUID();
	const worldJson = JSON.stringify(world);
	const byteLength = new TextEncoder().encode(worldJson).byteLength;
	if (byteLength > MAX_WORLD_JSON_BYTES) {
		return json({ error: 'That world is too large to publish (10 MB limit).' }, 413, cors);
	}
	const player = (world.environment as { terrain?: { player?: { runSpeed?: unknown } } }).terrain
		?.player;
	const manifest: WorldManifest = {
		worldId,
		name: world.name.slice(0, 80),
		schemaVersion: world.schemaVersion as number,
		generatorVersion: body.generatorVersion,
		publishedAt: new Date().toISOString(),
		byteLength,
		maxSpeed: maxSpeedForRunSpeed(Number(player?.runSpeed))
	};
	// One link per role (Q3-A). Only the tokens' hashes are stored; the tokens go back to the
	// publisher once, in this response, and live on only in the links they share.
	const invites = { owner: randomToken(), editor: randomToken(), viewer: randomToken() };
	const access: WorldAccess = {
		owner: await sha256Hex(invites.owner),
		editor: await sha256Hex(invites.editor),
		viewer: await sha256Hex(invites.viewer)
	};
	const room = env.WORLD_ROOM.get(env.WORLD_ROOM.idFromName(worldId), { locationHint: 'weur' });
	await room.publish(manifest, worldJson, access);
	return json({ worldId, name: manifest.name, invites }, 201, cors);
}

/** Localhost and private LAN origins (for testing on a phone or iPad), plus any configured origins. */
function isAllowedOrigin(origin: string, env: Env): boolean {
	let host: string;
	try {
		host = new URL(origin).hostname;
	} catch {
		return false;
	}
	if (
		host === 'localhost' ||
		host === '127.0.0.1' ||
		host === '[::1]' ||
		host.endsWith('.localhost') ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host)
	) {
		return true;
	}
	const allowed = (env.ALLOWED_ORIGINS ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	return allowed.includes(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
	if (!origin) return {};
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '600',
		Vary: 'Origin'
	};
}

function json(value: unknown, status: number, headers: Record<string, string>): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
	});
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
	const copy = new Response(response.body, response);
	for (const [key, value] of Object.entries(headers)) copy.headers.set(key, value);
	return copy;
}

/** Constant-time comparison via SHA-256 digests, so the key can't be guessed from response timing. */
async function secretsMatch(supplied: string, expected: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const [a, b] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
		crypto.subtle.digest('SHA-256', encoder.encode(expected))
	]);
	const left = new Uint8Array(a);
	const right = new Uint8Array(b);
	let diff = 0;
	for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
	return diff === 0;
}
