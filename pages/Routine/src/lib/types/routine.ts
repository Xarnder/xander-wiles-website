export interface RoutineTask {
	id: string;
	title: string;
	description?: string;
	order: number;
	/** When true, the task stays in the routine but is skipped during a run. */
	disabled?: boolean;
}

export function isTaskDisabled(task: Pick<RoutineTask, 'disabled'>): boolean {
	return task.disabled === true;
}

export function enabledTasks(tasks: RoutineTask[]): RoutineTask[] {
	return tasks.filter((task) => !isTaskDisabled(task));
}

export interface Routine {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	tasks: RoutineTask[];
	sortOrder: number;
	createdAt: string;
	updatedAt: string;
}

export type RoutineInput = Omit<Routine, 'createdAt' | 'updatedAt'> & {
	createdAt?: string;
	updatedAt?: string;
};
