import type { RunSession, RoutineSummaryStats, RunTaskResult, TaskStatus } from '$lib/types/run';

export function statusCaption(status: TaskStatus): 'Complete' | 'Later' | 'Not Today' {
	if (status === 'completed') return 'Complete';
	if (status === 'later' || status === 'pending') return 'Later';
	return 'Not Today';
}

function resultPriority(result: RunTaskResult): number {
	const isLater = result.status === 'later' || result.status === 'pending';
	if (isLater) {
		return result.important ? 0 : 1;
	}
	if (result.important) return 2;
	if (result.status === 'completed') return 3;
	return 4;
}

export function deriveSummary(session: RunSession): RoutineSummaryStats {
	const ranked = session.tasks.map((task, order) => ({
		order,
		result: {
			taskId: task.id,
			title: task.title,
			description: task.description,
			status: session.statuses[task.id] ?? 'pending',
			important: task.important === true
		} satisfies RunTaskResult
	}));

	ranked.sort((a, b) => {
		const byPriority = resultPriority(a.result) - resultPriority(b.result);
		if (byPriority !== 0) return byPriority;
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
