import { storage } from '#imports';

/** Les 9 couleurs natives de chrome.tabGroups — aucune autre valeur n'est acceptée par l'API. */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export interface Folder {
  id: string;
  name: string;
  color: GroupColor;
}

export interface KeptTab {
  id: string;
  url: string;
  title: string;
  folderId: string;
}

/** spaceId -> ses dossiers. Chaque espace a ses propres dossiers, indépendants des autres. */
export const foldersItem = storage.defineItem<Record<string, Folder[]>>('sync:folders', { fallback: {} });
/** spaceId -> ses onglets à garder (rangés dans un dossier de ce même espace). */
export const keptTabsItem = storage.defineItem<Record<string, KeptTab[]>>('sync:keptTabs', { fallback: {} });

export async function getFoldersForSpace(spaceId: string): Promise<Folder[]> {
  const all = await foldersItem.getValue();
  return all[spaceId] ?? [];
}

export async function setFoldersForSpace(spaceId: string, folders: Folder[]): Promise<void> {
  const all = await foldersItem.getValue();
  all[spaceId] = folders;
  await foldersItem.setValue(all);
}

export async function removeFoldersForSpace(spaceId: string): Promise<void> {
  const all = await foldersItem.getValue();
  if (spaceId in all) {
    delete all[spaceId];
    await foldersItem.setValue(all);
  }
}

export async function getKeptForSpace(spaceId: string): Promise<KeptTab[]> {
  const all = await keptTabsItem.getValue();
  return all[spaceId] ?? [];
}

export async function setKeptForSpace(spaceId: string, kept: KeptTab[]): Promise<void> {
  const all = await keptTabsItem.getValue();
  all[spaceId] = kept;
  await keptTabsItem.setValue(all);
}

export async function removeKeptForSpace(spaceId: string): Promise<void> {
  const all = await keptTabsItem.getValue();
  if (spaceId in all) {
    delete all[spaceId];
    await keptTabsItem.setValue(all);
  }
}

export function nextFolderColor(existingFolders: Folder[]): GroupColor {
  return GROUP_COLORS[existingFolders.length % GROUP_COLORS.length] ?? 'grey';
}
