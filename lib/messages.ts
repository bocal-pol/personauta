export interface SpaceOverviewEntry {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isOpen: boolean;
}

export type ExtensionMessage =
  | { type: 'switch-space'; spaceId: string }
  | { type: 'get-spaces-overview' };
