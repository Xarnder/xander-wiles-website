import { describe, expect, it } from 'vitest';
import { ObjectPool } from './objectPool';

describe('ObjectPool', () => {
	it('reuses released objects and enforces its allocation bound', () => {
		let created = 0;
		const pool = new ObjectPool<{ value: number }>({
			create: () => ({ value: ++created }),
			reset: (item) => {
				item.value = 0;
			},
			initialSize: 1,
			maxSize: 2
		});
		const first = pool.acquire();
		const second = pool.acquire();
		const overflow = pool.acquire();
		if (!first || !second) throw new Error('Pool unexpectedly empty');
		pool.release(first);
		const reused = pool.acquire();

		expect(overflow).toBeNull();
		expect(reused).toBe(first);
		expect(reused?.value).toBe(0);
		expect(pool.size).toBe(2);
	});

	it('ignores duplicate releases', () => {
		const pool = new ObjectPool({ create: () => ({}) });
		const item = pool.acquire();
		if (!item) throw new Error('Pool unexpectedly empty');

		expect(pool.release(item)).toBe(true);
		expect(pool.release(item)).toBe(false);
	});
});
