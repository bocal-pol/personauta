export interface SpaceOverviewEntry {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isOpen: boolean;
}

export interface EntryOverview {
  id: string;
  title: string;
  url: string;
  isOpen: boolean;
}

export interface FolderOverview {
  id: string;
  name: string;
  color: string;
  tabs: EntryOverview[];
}

export interface SpaceContentOverview {
  spaceId: string;
  spaceName: string;
  spaceEmoji: string;
  pinned: EntryOverview[];
  pinnedCount: number;
  maxPinned: number;
  folders: FolderOverview[];
}

export type ExtensionMessage =
  | { type: 'switch-space'; spaceId: string }
  | { type: 'get-spaces-overview' }
  | { type: 'delete-space'; spaceId: string }
  | { type: 'get-current-space-content' }
  | { type: 'get-space-content'; spaceId: string }
  | { type: 'clean-space'; spaceId: string }
  | { type: 'open-or-focus-entry'; entryId: string }
  | { type: 'remove-entry'; spaceId: string; entryId: string }
  | { type: 'create-folder'; spaceId: string }
  | { type: 'rename-folder'; spaceId: string; folderId: string; name: string }
  | { type: 'recolor-folder'; spaceId: string; folderId: string; color: string }
  | { type: 'delete-folder'; spaceId: string; folderId: string };
