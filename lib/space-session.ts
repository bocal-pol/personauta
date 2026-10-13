import { storage } from '#imports';

/**
 * spaceId -> windowId. Volatile : un windowId n'a de sens que pour la session de navigateur en
 * cours, donc chrome.storage.session (et non sync/local) — perdu au redémarrage du navigateur,
 * ce qui est correct : au redémarrage, aucun espace n'a de fenêtre tant qu'on n'y bascule pas.
 */
const spaceWindowsItem = storage.defineItem<Record<string, number>>('session:spaceWindows', {
  fallback: {},
});

export async function getWindowMapping(): Promise<Record<string, number>> {
  return spaceWindowsItem.getValue();
}

export async function setWindowForSpace(spaceId: string, windowId: number): Promise<void> {
  const mapping = await spaceWindowsItem.getValue();
  mapping[spaceId] = windowId;
  await spaceWindowsItem.setValue(mapping);
}

/** À appeler depuis windows.onRemoved — retire la fenêtre quel que soit l'espace qui la référençait. */
export async function clearWindow(windowId: number): Promise<void> {
  const mapping = await spaceWindowsItem.getValue();
  let changed = false;
  for (const [spaceId, mappedWindowId] of Object.entries(mapping)) {
    if (mappedWindowId === windowId) {
      delete mapping[spaceId];
      changed = true;
    }
  }
  if (changed) await spaceWindowsItem.setValue(mapping);
}
