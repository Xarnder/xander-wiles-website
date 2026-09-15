import { describe, expect, it } from 'vitest';
import { fromDoc, toDoc } from './firestore-routines-repo';
import type { Routine } from '$lib/types/routine';

describe('Firestore serialization (cloud persistence)', () => {
	it('preserves important flag through toDoc and fromDoc round-trip', () => {
		const routine: Routine = {
			id: 'routine-1',
			name: 'Night Routine',
			description: 'Evening habits',
			icon: '🌙',
			sortOrder: 0,
			createdAt: '2026-09-15T12:00:00.000Z',
			updatedAt: '2026-09-15T12:00:00.000Z',
			tasks: [
				{
					id: 't-1',
					title: 'Brush teeth',
					order: 0,
					important: false
				},
				{
					id: 't-2',
					title: 'Lock front door',
					description: 'Check deadbolt',
					order: 1,
					important: true
				},
				{
					id: 't-3',
					title: 'Charge phone',
					order: 2
				}
			]
		};

		const docData = toDoc(routine);

		// Verify toDoc outputs valid types for Firestore (no undefined values)
		expect(docData.tasks[0].important).toBe(false);
		expect(docData.tasks[1].important).toBe(true);
		expect(docData.tasks[2].important).toBe(false);

		// Firestore throws if any field in document is undefined
		for (const task of docData.tasks) {
			for (const [key, value] of Object.entries(task)) {
				expect(value, `Field ${key} in task should not be undefined`).not.toBeUndefined();
			}
		}

		// Reconstruct routine from document data as Firestore does on snapshot
		const restored = fromDoc(routine.id, docData);

		expect(restored.tasks[0].important).toBeUndefined();
		expect(restored.tasks[1].important).toBe(true);
		expect(restored.tasks[2].important).toBeUndefined();
		expect(restored.tasks[1].title).toBe('Lock front door');
	});
});
