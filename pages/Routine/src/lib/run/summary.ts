import type { RunSession, RoutineSummaryStats, RunTaskResult } from '$lib/types/run';

export function deriveSummary(session: RunSession): RoutineSummaryStats {
	const results: RunTaskResult[] = session.tasks.map((task) => ({
		taskId: task.id,
		title: task.title,
		description: task.description,
		status: session.statuses[task.id] ?? 'pending'
	}));

	const completed = results.filter((r) => r.status === 'completed').length;
	const skipped = results.filter((r) => r.status === 'skipped').length;
	const pending = results.filter((r) => r.status === 'pending').length;
	const total = results.length;
	const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

	return {
		completed,
		skipped,
		pending,
		total,
		percentComplete,
		results
	};
}
