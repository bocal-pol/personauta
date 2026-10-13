import { browser } from '#imports';
import { spacesItem } from '@/lib/spaces-storage';
import { getWindowMapping, setWindowForSpace, clearWindow } from '@/lib/space-session';
import { decideSwitch, spaceIdForCommand } from '@/lib/space-rules';
import type { ExtensionMessage, SpaceOverviewEntry } from '@/lib/messages';

async function getOpenWindowIds(): Promise<Set<number>> {
  const windows = await browser.windows.getAll();
  return new Set(windows.filter((w): w is typeof w & { id: number } => w.id != null).map((w) => w.id));
}

async function switchToSpace(spaceId: string): Promise<void> {
  const [spaces, windowMapping, openWindowIds] = await Promise.all([
    spacesItem.getValue(),
    getWindowMapping(),
    getOpenWindowIds(),
  ]);
  const decision = decideSwitch(spaceId, spaces, windowMapping, openWindowIds);

  switch (decision.action) {
    case 'focus':
      await browser.windows.update(decision.windowId, { focused: true });
      return;
    case 'create': {
      const newWindow = decision.urls
        ? await browser.windows.create({ url: decision.urls, focused: true })
        : await browser.windows.create({ focused: true });
      if (newWindow?.id != null) {
        await setWindowForSpace(spaceId, newWindow.id);
      }
      return;
    }
    case 'not-found':
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

export default defineBackground(() => {
  browser.windows.onRemoved.addListener((windowId) => {
    void clearWindow(windowId);
  });

  browser.commands.onCommand.addListener((command) => {
    void (async () => {
      const spaces = await spacesItem.getValue();
      const spaceId = spaceIdForCommand(command, spaces);
      if (spaceId) await switchToSpace(spaceId);
    })();
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
    switch (message?.type) {
      case 'switch-space':
        return switchToSpace(message.spaceId).then(() => true);
      case 'get-spaces-overview':
        return getSpacesOverview();
      default:
        return undefined;
    }
  });
});
