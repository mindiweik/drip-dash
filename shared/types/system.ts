const systems = ['nursery', 'gardyn'] as const;
export type System = typeof systems[number];

export interface GardynSystem {
	id: string;
	name: string; // "Gardyn 1 Name", "Nursery 1 Name"
	kind: System;
	rows: GardynSystem['kind'] extends 'nursery' ? 5 : 10;
	cols: GardynSystem['kind'] extends 'nursery' ? 2 : 3;
	slots: SystemSlot[];
	createdAt: string; // ISO date string
}

export interface SystemSlot {
	id: string;
	systemId: string;
	rowIndex: number;
	colIndex: number;
	label?: string; // optional "Plant" label or emoji
}
