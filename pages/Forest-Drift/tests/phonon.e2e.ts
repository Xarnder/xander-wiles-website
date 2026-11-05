import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { SPEECH_ASSET_DB } from '../src/lib/game/speech/SpeechAssets';
import { lessons } from '../src/lib/game/tutorials/tutorials';
import { MODEL_BASE_URL, NARRATOR, phrases } from '../src/lib/game/speech/types';

test('Phonon generates every desktop and touch phrase locally, including after an offline reload', async ({
	page
}, testInfo) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in real model validation');
	test.setTimeout(600_000);
	const workerFile = readdirSync('dist/_app/immutable/workers').find((file) =>
		/^synthesis\.worker-.*\.js$/.test(file)
	);
	expect(workerFile).toBeDefined();
	const catalogue = [
		...new Set(
			[false, true].flatMap((touch) => lessons(touch).flatMap((lesson) => phrases(lesson.text)))
		)
	];
	const external: { url: string; method: string }[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin)
			external.push({ url: request.url(), method: request.method() });
	});
	await page.goto('/');
	const generate = (texts: string[]) =>
		page.evaluate(
			async ({ texts, workerFile, profile, assetDatabase, modelBase }) => {
				const worker = new Worker(`/_app/immutable/workers/${workerFile}`, { type: 'module' });
				const writes: Promise<void>[] = [];
				let id = 0;
				const result: { text: string; seconds: number; peak: number; rms: number; hash: string }[] =
					[];
				try {
					for (const text of texts) {
						const requestId = ++id;
						const audio = await new Promise<{ pcm: Float32Array; sampleRate: number }>(
							(resolve, reject) => {
								worker.onerror = (error) => reject(new Error(error.message));
								worker.onmessage = ({ data }) => {
									if (data.id !== requestId) return;
									if (data.asset) {
										writes.push(
											new Promise<void>((saved, failed) => {
												const opening = indexedDB.open(assetDatabase, 1);
												opening.onupgradeneeded = () => opening.result.createObjectStore('files');
												opening.onerror = () => failed(opening.error);
												opening.onsuccess = () => {
													const db = opening.result;
													const tx = db.transaction('files', 'readwrite');
													tx.objectStore('files').put(
														data.asset.bytes,
														modelBase + data.asset.file
													);
													tx.oncomplete = () => {
														db.close();
														saved();
													};
													tx.onerror = () => {
														db.close();
														failed(tx.error);
													};
												};
											})
										);
									} else if (data.error) reject(new Error(`${text}: ${data.error}`));
									else if (data.pcm) resolve(data);
								};
								worker.postMessage({ id: requestId, text, profile });
							}
						);
						if (
							audio.sampleRate !== 24000 ||
							!audio.pcm.length ||
							!audio.pcm.every(Number.isFinite)
						)
							throw new Error(`Invalid waveform: ${text}`);
						let peak = 0,
							squares = 0;
						for (const sample of audio.pcm) {
							peak = Math.max(peak, Math.abs(sample));
							squares += sample * sample;
						}
						const hash = Array.from(
							new Uint8Array(
								await crypto.subtle.digest('SHA-256', audio.pcm as Float32Array<ArrayBuffer>)
							),
							(n) => n.toString(16).padStart(2, '0')
						).join('');
						result.push({
							text,
							seconds: audio.pcm.length / audio.sampleRate,
							peak,
							rms: Math.sqrt(squares / audio.pcm.length),
							hash
						});
					}
					await Promise.all(writes);
					return result;
				} finally {
					worker.terminate();
				}
			},
			{
				texts,
				workerFile,
				profile: NARRATOR.profile,
				assetDatabase: SPEECH_ASSET_DB,
				modelBase: MODEL_BASE_URL
			}
		);
	const generated = await generate(catalogue);
	expect(generated).toHaveLength(catalogue.length);
	for (const clip of generated) {
		expect(clip.peak, clip.text).toBeGreaterThan(0.001);
		expect(clip.rms, clip.text).toBeGreaterThan(0.0001);
		expect(clip.seconds, clip.text).toBeGreaterThan(0.1);
		expect(clip.seconds, clip.text).toBeLessThanOrEqual(18);
	}
	expect(external.length).toBeGreaterThan(0);
	// All external traffic is a model-file GET, never text/audio sent for remote synthesis.
	for (const request of external) {
		expect(request.method).toBe('GET');
		expect(new URL(request.url).hostname).toMatch(/(^|\.)(huggingface\.co|hf\.co|xethub\.hf\.co)$/);
	}
	await page.reload();
	external.length = 0;
	await page.route('https://**/*', (route) => route.abort());
	const restored = await generate([catalogue[0], catalogue.at(-1)!]);
	expect(restored[0].hash).toBe(generated[0].hash);
	expect(restored[1].hash).toBe(generated.at(-1)!.hash);
	expect(external).toEqual([]);
	await testInfo.attach('phonon-catalogue.json', {
		body: JSON.stringify({ phrases: catalogue.length, generated, offline: restored }, null, 2),
		contentType: 'application/json'
	});
	console.log(
		`PHONON_CATALOGUE ${testInfo.project.name}: ${catalogue.length} phrases, offline reload passed`
	);
});
