const tempOptions = ['low', 'low-medium', 'medium', 'medium-high', 'high'] as const;
export type TempOption = typeof tempOptions[number];

export interface Plant {
	id: string;
	name: string;
	quantity: number;
	temp: TempOption;
	about: string;
	care: string;
	uses: string;
	notes?: string;
	image_url?: string;
}

export interface PlantRecord {
	id: string;
	slotId: string;
	temp: TempOption;
	plantId: string;
	plantedAt?: string; // ISO date string
	harvestedAt?: string; // ISO date string
	removedAt?: string; // ISO date string
}
