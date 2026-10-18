import type { WorldRoom } from './WorldRoom';

export interface Env {
	WORLD_ROOM: DurableObjectNamespace<WorldRoom>;
	/** Server-only, Account Analytics Read. Never forward to clients. */
	CLOUDFLARE_ANALYTICS_TOKEN?: string;
	CLOUDFLARE_ACCOUNT_ID?: string;
	/**
	 * Locked decision Q2-A: only the admin publishes worlds. Set with `wrangler secret put ADMIN_SECRET`
	 * in production and in `.dev.vars` locally. Publishing is refused while it is unset.
	 */
	ADMIN_SECRET?: string;
	/**
	 * Optional separate key for signing capabilities (plan §8.6). When unset, a key derived from
	 * `ADMIN_SECRET` is used, so a fresh deploy needs only the one secret. Setting this later signs
	 * everyone out of their saved capabilities; their invite links keep working.
	 */
	CAPABILITY_SECRET?: string;
	/**
	 * Extra browser origins allowed to connect, comma-separated (e.g. `https://xanderwiles.com`).
	 * Localhost and private-network origins are always allowed so the game can be tested on a LAN.
	 */
	ALLOWED_ORIGINS?: string;
}
