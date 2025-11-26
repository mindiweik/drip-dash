const systems = ['nursery', 'gardyn'] as const;
export type System = typeof systems[number];

export interface BaseSystem {
	id: string;
	name: string; // "Gardyn 1 Name", "Nursery 1 Name"
	slots: SystemSlot[];
	createdAt: string; // ISO date string
}

export interface NurserySystem extends BaseSystem {
	kind: 'nursery';
	rows: 5;
	cols: 2;
}

export interface GardynSystemProper extends BaseSystem {
	kind: 'gardyn';
	rows: 10;
	cols: 3;
}

export type GardynSystem = NurserySystem | GardynSystemProper;
export interface SystemSlot {
	id: string;
	systemId: string;
	rowIndex: number;
	colIndex: number;
	label?: string; // optional "Plant" label or emoji
}
