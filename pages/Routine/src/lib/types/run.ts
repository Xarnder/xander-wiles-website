import type { RoutineTask } from './routine';

export type TaskStatus = 'pending' | 'completed' | 'skipped';

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
}

export interface RoutineSummaryStats {
	completed: number;
	skipped: number;
	pending: number;
	total: number;
	percentComplete: number;
	results: RunTaskResult[];
}
