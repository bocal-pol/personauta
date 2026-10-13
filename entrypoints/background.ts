import { browser } from '#imports';
import type { Browser } from '#imports';
import { spacesItem } from '@/lib/spaces-storage';
import { getWindowMapping, setWindowForSpace, clearWindow } from '@/lib/space-session';
import { decideSwitch, spaceIdForCommand } from '@/lib/space-rules';
import {
  getPinnedForSpace,
  setPinnedForSpace,
  removePinnedForSpace,
  canPin,
  type PinnedTab,
} from '@/lib/pinned-storage';
import {
  foldersItem,
  getFoldersForSpace,
  setFoldersForSpace,
  removeFoldersForSpace,
  getKeptForSpace,
  setKeptForSpace,
  removeKeptForSpace,
  nextFolderColor,
  type Folder,
  type GroupColor,
  type KeptTab,
} from '@/lib/folders-storage';
import {
  getEntryTabMap,
  setTabForEntry,
  clearTabId,
  clearEntry,
  getFolderGroupMap,
  setFolderGroupId,
  clearGroupId,
} from '@/lib/entry-session';
import { planReconciliation, type KeepEntry } from '@/lib/keeper-rules';
import type {
  ExtensionMessage,
  SpaceOverviewEntry,
  SpaceContentOverview,
  FolderOverview,
} from '@/lib/messages';

type BrowserTab = Browser.tabs.Tab;

const MENU_PIN = 'personauta-toggle-pin';
const MENU_ADD_FOLDER_PARENT = 'personauta-add-folder-parent';
const MENU_FOLDER_PREFIX = 'personauta-folder-';
const MENU_NEW_FOLDER = 'personauta-new-folder';
const MENU_REMOVE = 'personauta-remove';

function toEntries(pinned: PinnedTab[], kept: KeptTab[]): KeepEntry[] {
  return [
    ...pinned.map((p) => ({ id: p.id, url: p.url, pinned: true })),
    ...kept.map((k) => ({ id: k.id, url: k.url, pinned: false, folderId: k.folderId })),
  ];
}

async function getAllOpenTabIds(): Promise<Set<number>> {
  const tabs = await browser.tabs.query({});
  return new Set(tabs.filter((t): t is BrowserTab & { id: number } => t.id != null).map((t) => t.id));
}

async function getOpenWindowIds(): Promise<Set<number>> {
  const windows = await browser.windows.getAll();
  return new Set(windows.filter((w): w is typeof w & { id: number } => w.id != null).map((w) => w.id));
}

/** spaceId dont la fenêtre correspond à windowId, ou null si cette fenêtre n'appartient à aucun espace reconnu. */
async function getSpaceIdForWindow(windowId: number | undefined): Promise<string | null> {
  if (windowId == null) return null;
  const mapping = await getWindowMapping();
  for (const [spaceId, mappedWindowId] of Object.entries(mapping)) {
    if (mappedWindowId === windowId) return spaceId;
  }
  return null;
}

async function addTabToFolderGroup(tabId: number, folder: Folder): Promise<void> {
  const groups = await getFolderGroupMap();
  const existingGroupId = groups[folder.id];
  if (existingGroupId != null) {
    const stillExists = await browser.tabGroups.get(existingGroupId).catch(() => null);
    if (stillExists) {
      await browser.tabs.group({ tabIds: [tabId], groupId: existingGroupId }).catch(() => {});
      return;
    }
  }
  const newGroupId = await browser.tabs.group({ tabIds: [tabId] });
  await browser.tabGroups.update(newGroupId, { title: folder.name, color: folder.color });
  await setFolderGroupId(folder.id, newGroupId);
}

async function openEntryInWindow(entry: KeepEntry, windowId: number, spaceId: string): Promise<void> {
  const newTab = await browser.tabs.create({
    windowId,
    url: entry.url || undefined,
    pinned: entry.pinned,
    active: false,
  });
  if (newTab.id == null) return;
  await setTabForEntry(entry.id, newTab.id);

  if (!entry.pinned && entry.folderId) {
    const folders = await getFoldersForSpace(spaceId);
    const folder = folders.find((f) => f.id === entry.folderId);
    if (folder) await addTabToFolderGroup(newTab.id, folder);
  }
}

/** Focus la fenêtre de l'espace si elle existe déjà, sinon en crée une neuve (vide, pas encore peuplée). */
async function ensureSpaceWindow(spaceId: string): Promise<{ windowId: number; justCreated: boolean } | null> {
  const [spaces, windowMapping, openWindowIds] = await Promise.all([
    spacesItem.getValue(),
    getWindowMapping(),
    getOpenWindowIds(),
  ]);
  const decision = decideSwitch(spaceId, spaces, windowMapping, openWindowIds);

  if (decision.action === 'not-found') return null;
  if (decision.action === 'focus') {
    await browser.windows.update(decision.windowId, { focused: true });
    return { windowId: decision.windowId, justCreated: false };
  }

  const newWindow = await browser.windows.create({ focused: true });
  if (newWindow?.id == null) return null;
  await setWindowForSpace(spaceId, newWindow.id);
  return { windowId: newWindow.id, justCreated: true };
}

/** Bascule vers un espace ; si sa fenêtre vient d'être créée, la peuple avec ses épinglés + dossiers. */
async function switchToSpace(spaceId: string): Promise<void> {
  const result = await ensureSpaceWindow(spaceId);
  if (!result || !result.justCreated) return;

  const [pinned, kept] = await Promise.all([getPinnedForSpace(spaceId), getKeptForSpace(spaceId)]);
  const entries = toEntries(pinned, kept);
  const win = await browser.windows.get(result.windowId, { populate: true }).catch(() => null);
  const placeholderTabId = win?.tabs?.[0]?.id;

  for (const entry of entries) {
    await openEntryInWindow(entry, result.windowId, spaceId);
  }
  if (placeholderTabId != null && entries.length > 0) {
    await browser.tabs.remove(placeholderTabId).catch(() => {});
  }
}

/** « Nettoyer cet espace » : ferme dans SA fenêtre tout ce qui n'est ni épinglé ni gardé pour cet espace, sans la fermer elle-même. */
async function cleanSpace(spaceId: string): Promise<void> {
  const windowMapping = await getWindowMapping();
  const windowId = windowMapping[spaceId];
  if (windowId == null) return;

  const [pinned, kept, entryTabMap, tabsInWindow] = await Promise.all([
    getPinnedForSpace(spaceId),
    getKeptForSpace(spaceId),
    getEntryTabMap(),
    browser.tabs.query({ windowId }),
  ]);
  const entries = toEntries(pinned, kept);
  const openTabIds = new Set(
    tabsInWindow.filter((t): t is BrowserTab & { id: number } => t.id != null).map((t) => t.id),
  );
  const plan = planReconciliation(entries, entryTabMap, openTabIds);

  // Garde-fou : si on s'apprête à tout fermer sans rien rouvrir, ne pas vider la fenêtre entièrement.
  if (plan.toOpen.length === 0 && openTabIds.size > 0 && plan.toClose.length === openTabIds.size) {
    await browser.tabs.create({ windowId });
  }
  for (const entry of plan.toOpen) {
    await openEntryInWindow(entry, windowId, spaceId);
  }
  for (const tabId of plan.toClose) {
    await browser.tabs.remove(tabId).catch(() => {});
  }
}

async function findEntryIdForTab(tabId: number): Promise<string | null> {
  const map = await getEntryTabMap();
  for (const [entryId, mappedTabId] of Object.entries(map)) {
    if (mappedTabId === tabId) return entryId;
  }
  return null;
}

async function togglePinForTab(tab: BrowserTab, spaceId: string): Promise<void> {
  if (tab.id == null) return;
  const existingEntryId = await findEntryIdForTab(tab.id);
  const pinned = await getPinnedForSpace(spaceId);

  if (existingEntryId && pinned.some((p) => p.id === existingEntryId)) {
    await setPinnedForSpace(spaceId, pinned.filter((p) => p.id !== existingEntryId));
    await clearEntry(existingEntryId);
    await browser.tabs.update(tab.id, { pinned: false }).catch(() => {});
    return;
  }

  if (!canPin(pinned)) return;

  const entry: PinnedTab = { id: crypto.randomUUID(), url: tab.url ?? '', title: tab.title ?? tab.url ?? 'Onglet' };
  await setPinnedForSpace(spaceId, [...pinned, entry]);
  await setTabForEntry(entry.id, tab.id);
  await browser.tabs.update(tab.id, { pinned: true }).catch(() => {});
}

async function addTabToFolder(tab: BrowserTab, spaceId: string, folderId: string): Promise<void> {
  if (tab.id == null) return;
  const kept = await getKeptForSpace(spaceId);
  const existingEntryId = await findEntryIdForTab(tab.id);
  const existing = kept.find((k) => k.id === existingEntryId);

  if (existing) {
    await setKeptForSpace(spaceId, kept.map((k) => (k.id === existing.id ? { ...k, folderId } : k)));
  } else {
    const entry: KeptTab = {
      id: crypto.randomUUID(),
      url: tab.url ?? '',
      title: tab.title ?? tab.url ?? 'Onglet',
      folderId,
    };
    await setKeptForSpace(spaceId, [...kept, entry]);
    await setTabForEntry(entry.id, tab.id);
  }

  const folders = await getFoldersForSpace(spaceId);
  const folder = folders.find((f) => f.id === folderId);
  if (folder) await addTabToFolderGroup(tab.id, folder);
}

async function createFolderAndAddTab(tab: BrowserTab, spaceId: string): Promise<void> {
  const folders = await getFoldersForSpace(spaceId);
  const folder: Folder = {
    id: crypto.randomUUID(),
    name: `Dossier ${folders.length + 1}`,
    color: nextFolderColor(folders),
  };
  await setFoldersForSpace(spaceId, [...folders, folder]);
  await addTabToFolder(tab, spaceId, folder.id);
}

/** Retire une entrée (épinglée ou gardée) de son espace — n'efface jamais l'onglet lui-même. */
async function removeEntry(spaceId: string, entryId: string): Promise<void> {
  const [pinned, kept, entryTabMap] = await Promise.all([
    getPinnedForSpace(spaceId),
    getKeptForSpace(spaceId),
    getEntryTabMap(),
  ]);
  const tabId = entryTabMap[entryId];

  if (pinned.some((p) => p.id === entryId)) {
    await setPinnedForSpace(spaceId, pinned.filter((p) => p.id !== entryId));
    if (tabId != null) await browser.tabs.update(tabId, { pinned: false }).catch(() => {});
  } else if (kept.some((k) => k.id === entryId)) {
    await setKeptForSpace(spaceId, kept.filter((k) => k.id !== entryId));
  }
  await clearEntry(entryId);
}

/** Ouvre/active une entrée, où qu'elle vive — recrée au besoin la fenêtre de SON espace. */
async function openOrFocusEntry(entryId: string): Promise<void> {
  const entryTabMap = await getEntryTabMap();
  const tabId = entryTabMap[entryId];
  if (tabId != null) {
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (tab) {
      await browser.tabs.update(tabId, { active: true });
      if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
      return;
    }
  }

  const spaces = await spacesItem.getValue();
  for (const space of spaces) {
    const [pinned, kept] = await Promise.all([getPinnedForSpace(space.id), getKeptForSpace(space.id)]);
    const pinnedEntry = pinned.find((p) => p.id === entryId);
    const keptEntry = kept.find((k) => k.id === entryId);
    const found: KeepEntry | null = pinnedEntry
      ? { id: pinnedEntry.id, url: pinnedEntry.url, pinned: true }
      : keptEntry
        ? { id: keptEntry.id, url: keptEntry.url, pinned: false, folderId: keptEntry.folderId }
        : null;
    if (!found) continue;

    const result = await ensureSpaceWindow(space.id);
    if (!result) return;
    await openEntryInWindow(found, result.windowId, space.id);
    return;
  }
}

async function getSpacesOverview(): Promise<SpaceOverviewEntry[]> {
  const [spaces, windowMapping, openWindowIds] = await Promise.all([
    spacesItem.getValue(),
    getWindowMapping(),
    getOpenWindowIds(),
  ]);
  return spaces.map((space) => {
    const windowId = windowMapping[space.id];
    return {
      id: space.id,
      name: space.name,
      emoji: space.emoji,
      color: space.color,
      isOpen: windowId != null && openWindowIds.has(windowId),
    };
  });
}

async function getSpaceContent(spaceId: string): Promise<SpaceContentOverview> {
  const [spaces, pinned, kept, folders, entryTabMap, allOpenTabIds] = await Promise.all([
    spacesItem.getValue(),
    getPinnedForSpace(spaceId),
    getKeptForSpace(spaceId),
    getFoldersForSpace(spaceId),
    getEntryTabMap(),
    getAllOpenTabIds(),
  ]);
  const space = spaces.find((s) => s.id === spaceId);
  const isOpen = (id: string) => {
    const tabId = entryTabMap[id];
    return tabId != null && allOpenTabIds.has(tabId);
  };

  const folderOverview: FolderOverview[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    tabs: kept
      .filter((k) => k.folderId === folder.id)
      .map((k) => ({ id: k.id, title: k.title, url: k.url, isOpen: isOpen(k.id) })),
  }));

  return {
    spaceId,
    spaceName: space?.name ?? 'Espace',
    spaceEmoji: space?.emoji ?? '📁',
    pinned: pinned.map((p) => ({ id: p.id, title: p.title, url: p.url, isOpen: isOpen(p.id) })),
    pinnedCount: pinned.length,
    maxPinned: 9,
    folders: folderOverview,
  };
}

async function getCurrentSpaceContent(): Promise<SpaceContentOverview | null> {
  const [activeTab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const spaceId = await getSpaceIdForWindow(activeTab?.windowId);
  if (!spaceId) return null;
  return getSpaceContent(spaceId);
}

async function createFolder(spaceId: string): Promise<void> {
  const folders = await getFoldersForSpace(spaceId);
  const folder: Folder = {
    id: crypto.randomUUID(),
    name: `Dossier ${folders.length + 1}`,
    color: nextFolderColor(folders),
  };
  await setFoldersForSpace(spaceId, [...folders, folder]);
}

async function renameFolder(spaceId: string, folderId: string, name: string): Promise<void> {
  const folders = await getFoldersForSpace(spaceId);
  const trimmed = name.trim();
  await setFoldersForSpace(
    spaceId,
    folders.map((f) => (f.id === folderId ? { ...f, name: trimmed || f.name } : f)),
  );
}

async function recolorFolder(spaceId: string, folderId: string, color: GroupColor): Promise<void> {
  const folders = await getFoldersForSpace(spaceId);
  await setFoldersForSpace(
    spaceId,
    folders.map((f) => (f.id === folderId ? { ...f, color } : f)),
  );
}

/** Supprime le dossier et retire ses onglets de la liste à garder — les onglets restent ouverts, redeviennent normaux. */
async function deleteFolder(spaceId: string, folderId: string): Promise<void> {
  const [folders, kept] = await Promise.all([getFoldersForSpace(spaceId), getKeptForSpace(spaceId)]);
  for (const entry of kept.filter((k) => k.folderId === folderId)) {
    await removeEntry(spaceId, entry.id);
  }
  await setFoldersForSpace(spaceId, folders.filter((f) => f.id !== folderId));
}

/** Suppression complète d'un espace : son entrée + tous ses épinglés/dossiers/gardés. Ne ferme pas sa fenêtre si elle est ouverte. */
async function deleteSpace(spaceId: string): Promise<void> {
  const spaces = await spacesItem.getValue();
  await spacesItem.setValue(spaces.filter((s) => s.id !== spaceId));
  await Promise.all([removePinnedForSpace(spaceId), removeFoldersForSpace(spaceId), removeKeptForSpace(spaceId)]);
}

/** Répercute un renommage/changement de couleur de dossier sur son groupe d'onglets déjà ouvert, s'il existe. */
async function syncAllFolderGroups(allFolders: Record<string, Folder[]>): Promise<void> {
  const groupMap = await getFolderGroupMap();
  for (const folders of Object.values(allFolders)) {
    for (const folder of folders) {
      const groupId = groupMap[folder.id];
      if (groupId == null) continue;
      await browser.tabGroups.update(groupId, { title: folder.name, color: folder.color }).catch(() => {});
    }
  }
}

/** Reconstruit entièrement le menu contextuel pour refléter les dossiers de l'espace propriétaire de l'onglet courant. */
async function rebuildContextMenusForSpace(spaceId: string | null): Promise<void> {
  await browser.contextMenus.removeAll();
  if (spaceId == null) return; // onglet hors de tout espace reconnu : pas de menu à proposer

  browser.contextMenus.create({ id: MENU_PIN, title: 'Épingler cet onglet', contexts: ['page'] });
  browser.contextMenus.create({ id: MENU_ADD_FOLDER_PARENT, title: 'Ajouter à un dossier', contexts: ['page'] });
  const folders = await getFoldersForSpace(spaceId);
  for (const folder of folders) {
    browser.contextMenus.create({
      id: MENU_FOLDER_PREFIX + folder.id,
      parentId: MENU_ADD_FOLDER_PARENT,
      title: folder.name,
      contexts: ['page'],
    });
  }
  browser.contextMenus.create({
    id: MENU_NEW_FOLDER,
    parentId: MENU_ADD_FOLDER_PARENT,
    title: 'Nouveau dossier…',
    contexts: ['page'],
  });
  browser.contextMenus.create({ id: MENU_REMOVE, title: 'Retirer de la liste', contexts: ['page'], visible: false });
}

async function updateMenuForTab(tab: BrowserTab | undefined): Promise<void> {
  if (tab?.id == null) return;
  const spaceId = await getSpaceIdForWindow(tab.windowId);
  await rebuildContextMenusForSpace(spaceId);
  if (spaceId == null) return;

  const entryId = await findEntryIdForTab(tab.id);
  const [pinned, kept] = await Promise.all([getPinnedForSpace(spaceId), getKeptForSpace(spaceId)]);
  const isPinned = entryId != null && pinned.some((p) => p.id === entryId);
  const isKept = entryId != null && kept.some((k) => k.id === entryId);

  await browser.contextMenus
    .update(MENU_PIN, { title: isPinned ? 'Désépingler cet onglet' : 'Épingler cet onglet' })
    .catch(() => {});
  await browser.contextMenus
    .update(MENU_REMOVE, { visible: isPinned || isKept, title: isPinned ? 'Retirer des épinglés' : 'Retirer du dossier' })
    .catch(() => {});
}

async function updateMenuForActiveTab(): Promise<void> {
  const [activeTab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  await updateMenuForTab(activeTab);
}

export default defineBackground(() => {
  browser.windows.onRemoved.addListener((windowId) => {
    void clearWindow(windowId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void clearTabId(tabId);
  });

  browser.tabGroups.onRemoved.addListener((group) => {
    void clearGroupId(group.id);
  });

  browser.commands.onCommand.addListener((command) => {
    void (async () => {
      const spaces = await spacesItem.getValue();
      const spaceId = spaceIdForCommand(command, spaces);
      if (spaceId) await switchToSpace(spaceId);
    })();
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs.get(tabId).then(updateMenuForTab).catch(() => {});
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
      void updateMenuForTab(tab);
    }
  });

  browser.windows.onFocusChanged.addListener(() => {
    void updateMenuForActiveTab();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab) return;
    void (async () => {
      const spaceId = await getSpaceIdForWindow(tab.windowId);
      if (!spaceId) return;

      if (info.menuItemId === MENU_PIN) {
        await togglePinForTab(tab, spaceId);
      } else if (info.menuItemId === MENU_NEW_FOLDER) {
        await createFolderAndAddTab(tab, spaceId);
      } else if (info.menuItemId === MENU_REMOVE) {
        const entryId = tab.id != null ? await findEntryIdForTab(tab.id) : null;
        if (entryId) await removeEntry(spaceId, entryId);
      } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_FOLDER_PREFIX)) {
        await addTabToFolder(tab, spaceId, info.menuItemId.slice(MENU_FOLDER_PREFIX.length));
      }
      await updateMenuForTab(tab);
    })();
  });

  // Resynchronise les groupes déjà ouverts et reconstruit le menu dès que des dossiers changent.
  foldersItem.watch((allFolders) => {
    void syncAllFolderGroups(allFolders);
    void updateMenuForActiveTab();
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
    switch (message?.type) {
      case 'switch-space':
        return switchToSpace(message.spaceId).then(() => true);
      case 'get-spaces-overview':
        return getSpacesOverview();
      case 'delete-space':
        return deleteSpace(message.spaceId).then(() => true);
      case 'get-current-space-content':
        return getCurrentSpaceContent();
      case 'get-space-content':
        return getSpaceContent(message.spaceId);
      case 'clean-space':
        return cleanSpace(message.spaceId).then(() => true);
      case 'open-or-focus-entry':
        return openOrFocusEntry(message.entryId).then(() => true);
      case 'remove-entry':
        return removeEntry(message.spaceId, message.entryId).then(() => true);
      case 'create-folder':
        return createFolder(message.spaceId).then(() => true);
      case 'rename-folder':
        return renameFolder(message.spaceId, message.folderId, message.name).then(() => true);
      case 'recolor-folder':
        return recolorFolder(message.spaceId, message.folderId, message.color as GroupColor).then(() => true);
      case 'delete-folder':
        return deleteFolder(message.spaceId, message.folderId).then(() => true);
      default:
        return undefined;
    }
  });
});
