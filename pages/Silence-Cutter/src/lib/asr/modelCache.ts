/**
 * Model weight cache in the Origin Private File System.
 *
 * The Cache API proved unreliable for multi-hundred-MB entries (`cache.put` fails with an
 * internal error in some Chromium builds), so model files are stored as plain OPFS files instead:
 * disk-backed, written as a stream, committed atomically (written to `.partial`, then renamed or
 * marked complete), and readable without loading into RAM until ONNX Runtime needs them.
 *
 * Only model weights/configs downloaded from Hugging Face are stored here — never user media.
 * Implements the `match`/`put` subset of the Cache interface that Transformers.js accepts as
 * `env.customCache`.
 */

const DIR = 'model-cache';

function fileName(key: string): string {
	return key.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function dir(): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();
	return root.getDirectoryHandle(DIR, { create: true });
}

async function exists(d: FileSystemDirectoryHandle, name: string): Promise<boolean> {
	try {
		await d.getFileHandle(name);
		return true;
	} catch {
		return false;
	}
}

type MovableHandle = FileSystemFileHandle & { move?: (name: string) => Promise<void> };

export class OpfsModelCache {
	/** Keys served from disk during this session (used to report cache hits). */
	readonly hits = new Set<string>();

	async match(key: string): Promise<Response | undefined> {
		try {
			const d = await dir();
			const name = fileName(key);
			if (await exists(d, `${name}.partial`)) return undefined;
			const handle = await d.getFileHandle(name);
			const file = await handle.getFile();
			this.hits.add(key);
			return new Response(file, {
				headers: { 'content-length': String(file.size), 'content-type': 'application/octet-stream' }
			});
		} catch {
			return undefined;
		}
	}

	async put(key: string, response: Response): Promise<void> {
		if (!response.body) return;
		const d = await dir();
		const name = fileName(key);
		const partial = (await d.getFileHandle(`${name}.partial`, { create: true })) as MovableHandle;
		const writable = await partial.createWritable();
		await response.body.pipeTo(writable);
		if (typeof partial.move === 'function') {
			try {
				await d.removeEntry(name);
			} catch {
				/* not present */
			}
			await partial.move(name);
		} else {
			// No atomic rename available: copy into place, then drop the partial marker file.
			const final = await d.getFileHandle(name, { create: true });
			const out = await final.createWritable();
			await (await partial.getFile()).stream().pipeTo(out);
			await d.removeEntry(`${name}.partial`);
		}
	}
}

/** Which of `urls` are fully cached (for showing "cached" before any download starts). */
export async function cachedStatus(urls: string[]): Promise<Record<string, number | null>> {
	const out: Record<string, number | null> = {};
	try {
		const d = await dir();
		await Promise.all(
			urls.map(async (url) => {
				const name = fileName(url);
				try {
					if (await exists(d, `${name}.partial`)) {
						out[url] = null;
						return;
					}
					out[url] = (await (await d.getFileHandle(name)).getFile()).size;
				} catch {
					out[url] = null;
				}
			})
		);
	} catch {
		for (const u of urls) out[u] = null;
	}
	return out;
}

/** Delete cached files for the given URLs (or everything when omitted). Returns bytes freed. */
export async function clearModelCache(urls?: string[]): Promise<number> {
	let freed = 0;
	try {
		const d = await dir();
		const names: string[] = [];
		if (urls) {
			for (const u of urls) names.push(fileName(u), `${fileName(u)}.partial`);
		} else {
			for await (const [name] of (
				d as unknown as { entries(): AsyncIterable<[string, unknown]> }
			).entries()) {
				names.push(name);
			}
		}
		for (const name of names) {
			try {
				freed += (await (await d.getFileHandle(name)).getFile()).size;
				await d.removeEntry(name);
			} catch {
				/* missing */
			}
		}
	} catch {
		/* OPFS unavailable */
	}
	return freed;
}

export function modelFileUrl(repo: string, path: string): string {
	return `https://huggingface.co/${repo}/resolve/main/${path}`;
}
