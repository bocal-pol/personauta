import type { Space } from '@/lib/spaces-storage';
import { MAX_SPACES } from '@/lib/spaces-storage';

export type SwitchDecision =
  | { action: 'focus'; windowId: number }
  | { action: 'create' }
  | { action: 'not-found' };

/**
 * Décide quoi faire pour basculer vers un espace, sans jamais appeler l'API chrome.windows —
 * reste pure et testable. L'appelant (background.ts) exécute l'action retournée ; dans le cas
 * 'create', c'est lui qui peuple la nouvelle fenêtre avec les épinglés/dossiers de l'espace.
 */
export function decideSwitch(
  spaceId: string,
  spaces: Space[],
  windowMapping: Record<string, number>,
  openWindowIds: ReadonlySet<number>,
): SwitchDecision {
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return { action: 'not-found' };

  const existingWindowId = windowMapping[spaceId];
  if (existingWindowId != null && openWindowIds.has(existingWindowId)) {
    return { action: 'focus', windowId: existingWindowId };
  }

  return { action: 'create' };
}

const COMMAND_PATTERN = /^switch-space-([1-6])$/;

export function spaceIdForCommand(command: string, spaces: Space[]): string | null {
  const match = COMMAND_PATTERN.exec(command);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return spaces[index]?.id ?? null;
}

export function canAddSpace(spaces: Space[]): boolean {
  return spaces.length < MAX_SPACES;
}
