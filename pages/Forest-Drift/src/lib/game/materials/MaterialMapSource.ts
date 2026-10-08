import { generateMaterialMaps } from './generateMaterialMaps';
import type { MaterialMapData, ResolvedMaterialRecipe } from './ProceduralMaterialTypes';

export interface MaterialMapRequest {
	id: number;
	recipe: ResolvedMaterialRecipe;
}

export type MaterialMapResponse =
	| { id: number; data: MaterialMapData; error?: undefined }
	| { id: number; error: string; data?: undefined };

/** Where generated maps come from — a worker pool in the browser, inline generation elsewhere. */
export interface MaterialMapSource {
	generate(recipe: ResolvedMaterialRecipe): Promise<MaterialMapData>;
	dispose(): void;
}

/**
 * Generates on the calling thread, yielding to the event loop first so callers never block inside
 * `getMaterial`. Used in Node (unit tests) and as the fallback when workers are unavailable.
 */
export class InlineMaterialMapSource implements MaterialMapSource {
	async generate(recipe: ResolvedMaterialRecipe): Promise<MaterialMapData> {
		await new Promise((resolve) => setTimeout(resolve, 0));
		return generateMaterialMaps(recipe);
	}

	dispose(): void {}
}

interface PendingJob {
	recipe: ResolvedMaterialRecipe;
	resolve: (data: MaterialMapData) => void;
	reject: (error: Error) => void;
}

/**
 * A small pool of module workers (at most 3, leaving cores for the game). Jobs are handed out in
 * request order; if a worker fails to start or errors, its job falls back to inline generation so a
 * material is never left permanently flat.
 */
export class WorkerMaterialMapSource implements MaterialMapSource {
	private readonly workers: Worker[] = [];
	private readonly idle: Worker[] = [];
	private readonly queue: { id: number; job: PendingJob }[] = [];
	private readonly inFlight = new Map<number, { worker: Worker; job: PendingJob }>();
	private readonly fallback = new InlineMaterialMapSource();
	private nextId = 1;

	constructor(createWorker: () => Worker, poolSize: number) {
		for (let i = 0; i < poolSize; i++) {
			try {
				const worker = createWorker();
				worker.onmessage = (event: MessageEvent<MaterialMapResponse>) =>
					this.onMessage(worker, event.data);
				worker.onerror = (event) => {
					event.preventDefault();
					this.onWorkerFailure(worker);
				};
				this.workers.push(worker);
				this.idle.push(worker);
			} catch {
				// Worker construction can fail (CSP, unsupported module workers) — inline fallback covers it.
			}
		}
	}

	generate(recipe: ResolvedMaterialRecipe): Promise<MaterialMapData> {
		if (this.workers.length === 0) return this.fallback.generate(recipe);
		return new Promise((resolve, reject) => {
			this.queue.push({ id: this.nextId++, job: { recipe, resolve, reject } });
			this.pump();
		});
	}

	dispose(): void {
		for (const worker of this.workers) worker.terminate();
		this.workers.length = 0;
		this.idle.length = 0;
		for (const { job } of this.inFlight.values())
			job.reject(new Error('Material map source disposed'));
		for (const { job } of this.queue) job.reject(new Error('Material map source disposed'));
		this.inFlight.clear();
		this.queue.length = 0;
	}

	private pump(): void {
		while (this.idle.length > 0 && this.queue.length > 0) {
			const worker = this.idle.pop() as Worker;
			const { id, job } = this.queue.shift() as { id: number; job: PendingJob };
			this.inFlight.set(id, { worker, job });
			const request: MaterialMapRequest = { id, recipe: job.recipe };
			worker.postMessage(request);
		}
	}

	private onMessage(worker: Worker, response: MaterialMapResponse): void {
		const entry = this.inFlight.get(response.id);
		this.inFlight.delete(response.id);
		this.idle.push(worker);
		if (entry) {
			if (response.data) entry.job.resolve(response.data);
			else this.fallback.generate(entry.job.recipe).then(entry.job.resolve, entry.job.reject);
		}
		this.pump();
	}

	private onWorkerFailure(worker: Worker): void {
		for (const [id, entry] of this.inFlight) {
			if (entry.worker !== worker) continue;
			this.inFlight.delete(id);
			this.fallback.generate(entry.job.recipe).then(entry.job.resolve, entry.job.reject);
		}
		const index = this.workers.indexOf(worker);
		if (index >= 0) this.workers.splice(index, 1);
		worker.terminate();
		if (this.workers.length === 0) {
			for (const { job } of this.queue.splice(0)) {
				this.fallback.generate(job.recipe).then(job.resolve, job.reject);
			}
		}
	}
}

/** Browser → worker pool; Node/tests or no Worker support → inline. */
export function createMaterialMapSource(): MaterialMapSource {
	if (typeof Worker === 'undefined' || typeof window === 'undefined') {
		return new InlineMaterialMapSource();
	}
	const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
	const poolSize = Math.max(1, Math.min(3, cores - 1));
	return new WorkerMaterialMapSource(
		() => new Worker(new URL('./proceduralTexture.worker.ts', import.meta.url), { type: 'module' }),
		poolSize
	);
}
