import { describe, expect, it } from 'vitest';
import { parseTaskListText } from './parse-task-list';

describe('parseTaskListText', () => {
	it('parses numbered lines', () => {
		const input = `1. Turn Off PC
2. Unplugged Speakers
3. Put left over food in fridge
10. Wash Face`;
		expect(parseTaskListText(input)).toEqual([
			'Turn Off PC',
			'Unplugged Speakers',
			'Put left over food in fridge',
			'Wash Face'
		]);
	});

	it('parses bullets and plain lines', () => {
		expect(parseTaskListText('- Stretch\n* Water\nPlan day')).toEqual([
			'Stretch',
			'Water',
			'Plan day'
		]);
	});

	it('ignores blank lines', () => {
		expect(parseTaskListText('1. One\n\n2. Two\n')).toEqual(['One', 'Two']);
	});
});
