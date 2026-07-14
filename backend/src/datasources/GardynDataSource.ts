import type { GardynSnapshot } from '@shared/types';

export interface GardynDataSource {
  fetchSnapshot(gardynId: string): Promise<GardynSnapshot>;
}
