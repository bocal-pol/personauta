import { storage } from '#imports';

export interface PinnedTab {
  id: string;
  url: string;
  title: string;
}

export const MAX_PINNED = 9;

/** spaceId -> ses onglets épinglés (max 9). Chaque espace a son propre jeu, indépendant des autres. */
export const pinnedTabsItem = storage.defineItem<Record<string, PinnedTab[]>>('sync:pinnedTabs', {
  fallback: {},
});

export async function getPinnedForSpace(spaceId: string): Promise<PinnedTab[]> {
  const all = await pinnedTabsItem.getValue();
  return all[spaceId] ?? [];
}

export async function setPinnedForSpace(spaceId: string, pinned: PinnedTab[]): Promise<void> {
  const all = await pinnedTabsItem.getValue();
  all[spaceId] = pinned;
  await pinnedTabsItem.setValue(all);
}

export async function removePinnedForSpace(spaceId: string): Promise<void> {
  const all = await pinnedTabsItem.getValue();
  if (spaceId in all) {
    delete all[spaceId];
    await pinnedTabsItem.setValue(all);
  }
}

export function canPin(pinned: PinnedTab[]): boolean {
  return pinned.length < MAX_PINNED;
}
