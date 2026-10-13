import { storage } from '#imports';

export interface Space {
  /** Identité stable de l'espace — n'est jamais recalculée depuis la position dans le tableau. */
  id: string;
  name: string;
  /** Un seul emoji, affiché dans le popup/les options. Purement visuel : Chrome n'expose aucune API pour colorer une fenêtre. */
  emoji: string;
  color: string;
}

export const MAX_SPACES = 6;

function defaultSpaces(): Space[] {
  return [
    { id: crypto.randomUUID(), name: 'Perso', emoji: '🏠', color: '#2563eb' },
    { id: crypto.randomUUID(), name: 'Pro', emoji: '💼', color: '#059669' },
    { id: crypto.randomUUID(), name: 'Loisir', emoji: '🎮', color: '#d97706' },
  ];
}

export const spacesItem = storage.defineItem<Space[]>('sync:spaces', {
  // S'exécute une seule fois, à la première lecture si rien n'existe encore en storage —
  // préremplit les 3 espaces demandés sans dépendre de l'ordre de démarrage des entrypoints.
  init: defaultSpaces,
  fallback: [],
});

export async function saveSpaces(spaces: Space[]): Promise<void> {
  await spacesItem.setValue(spaces.slice(0, MAX_SPACES));
}
