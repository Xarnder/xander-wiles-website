export interface RoutineTask {
	id: string;
	title: string;
	description?: string;
	order: number;
	/** When true, the task stays in the routine but is skipped during a run. */
	disabled?: boolean;
	/** When true, the task is marked as important and requires a double-check. */
	important?: boolean;
}

export function isTaskDisabled(task: Pick<RoutineTask, 'disabled'>): boolean {
	return task.disabled === true;
}

export function isTaskImportant(task: Pick<RoutineTask, 'important'>): boolean {
	return task.important === true;
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
