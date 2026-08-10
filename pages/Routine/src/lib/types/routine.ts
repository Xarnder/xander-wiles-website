export interface RoutineTask {
	id: string;
	title: string;
	description?: string;
	order: number;
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
