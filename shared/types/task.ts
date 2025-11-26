const plantDefaultTasks = ['trim', 'root', 'harvest', 'pollinate', 'freehand'] as const;
export type PlantDefaultTask = (typeof plantDefaultTasks)[number];

const systemDefaultTasks = ['top off', 'deep clean', 'clean tank', 'freehand'] as const;
export type SystemDefaultTask = (typeof systemDefaultTasks)[number];

export interface Task {
	id: string;
	name: PlantDefaultTask | SystemDefaultTask | string;
	details?: string;
	dueDate: string; // ISO date string
	completed: boolean;
	createdAt: string; // ISO date string
}
