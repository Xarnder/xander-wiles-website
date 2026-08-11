import type { RunSession, RoutineSummaryStats, RunTaskResult } from '$lib/types/run';

function resultPriority(status: RunTaskResult['status']): number {
	// Skipped / not-completed first so they stand out at the top of the summary list.
	if (status === 'skipped' || status === 'pending') return 0;
	return 1;
}

export function deriveSummary(session: RunSession): RoutineSummaryStats {
	const ranked = session.tasks.map((task, order) => ({
		order,
		result: {
			taskId: task.id,
			title: task.title,
			description: task.description,
			status: session.statuses[task.id] ?? 'pending'
		} satisfies RunTaskResult
	}));

	ranked.sort((a, b) => {
		const byStatus = resultPriority(a.result.status) - resultPriority(b.result.status);
		if (byStatus !== 0) return byStatus;
		return a.order - b.order;
	});

	const results = ranked.map((entry) => entry.result);
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
