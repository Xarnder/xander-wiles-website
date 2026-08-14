import type { RoutineTask } from './routine';

export type TaskStatus = 'pending' | 'completed' | 'later' | 'skipped';
export type StartMode = 'fresh' | 'continue';

export interface RunTaskResult {
	taskId: string;
	title: string;
	description?: string;
	status: TaskStatus;
}

export interface RunSession {
	routineId: string;
	routineName: string;
	tasks: RoutineTask[];
	statuses: Record<string, TaskStatus>;
	currentIndex: number;
	phase: 'running' | 'summary';
	startMode?: StartMode;
	/** Last statuses already written to first-pass stats, if any. */
	recordedStatStatuses?: Record<string, TaskStatus> | null;
}

export interface RoutineSummaryStats {
	completed: number;
	later: number;
	skipped: number;
	total: number;
	percentComplete: number;
	results: RunTaskResult[];
}

/** Live stacked-bar shares for a run. Percents always sum to 100 (or 0). */
export interface ProgressSegments {
	total: number;
	pending: number;
	completed: number;
	later: number;
	skipped: number;
	percents: {
		pending: number;
		completed: number;
		later: number;
		skipped: number;
	};
	resolvedPercent: number;
}
