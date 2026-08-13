import type { RunSession, RoutineSummaryStats, RunTaskResult, TaskStatus } from '$lib/types/run';

export function statusCaption(status: TaskStatus): 'Complete' | 'Later' | 'Not Today' {
	if (status === 'completed') return 'Complete';
	if (status === 'later' || status === 'pending') return 'Later';
	return 'Not Today';
}

function resultPriority(status: RunTaskResult['status']): number {
	if (status === 'later' || status === 'pending') return 0;
	if (status === 'completed') return 1;
	return 2;
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
	const later = results.filter((r) => r.status === 'later' || r.status === 'pending').length;
	const skipped = results.filter((r) => r.status === 'skipped').length;
	const total = results.length;
	const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

	return {
		completed,
		later,
		skipped,
		total,
		percentComplete,
		results
	};
}
