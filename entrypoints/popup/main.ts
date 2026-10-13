import './style.css';
import { browser } from '#imports';
import type { ExtensionMessage, SpaceOverviewEntry, SpaceContentOverview, EntryOverview } from '@/lib/messages';

/** Correspondance avec les 9 couleurs natives chrome.tabGroups, pour l'affichage uniquement. */
const COLOR_HEX: Record<string, string> = {
  grey: '#80868b',
  blue: '#2563eb',
  red: '#dc2626',
  yellow: '#ca8a04',
  green: '#16a34a',
  pink: '#db2777',
  purple: '#9333ea',
  cyan: '#0891b2',
  orange: '#ea580c',
};

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Espaces</h1>
  <ul class="space-list" id="space-list"></ul>
  <div id="current-space-section"></div>
  <p class="settings-link"><a href="#" id="open-options">Gérer les espaces</a></p>
`;

const listEl = document.querySelector<HTMLUListElement>('#space-list')!;
const currentSectionEl = document.querySelector<HTMLDivElement>('#current-space-section')!;

document.querySelector<HTMLAnchorElement>('#open-options')!.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

async function send(message: ExtensionMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

function renderSpaces(spaces: SpaceOverviewEntry[]): void {
  listEl.innerHTML = '';
  for (const space of spaces) {
    const li = document.createElement('li');
    li.className = 'space-row';

    const button = document.createElement('button');
    button.style.setProperty('--space-color', space.color);

    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = space.emoji;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = space.name;

    const dot = document.createElement('span');
    dot.className = `status-dot${space.isOpen ? ' open' : ''}`;
    dot.title = space.isOpen ? 'Fenêtre ouverte' : 'Fermé';

    button.append(emoji, name, dot);
    button.addEventListener('click', async () => {
      await send({ type: 'switch-space', spaceId: space.id });
      window.close();
    });

    li.append(button);
    listEl.append(li);
  }
}

function renderEntryRow(entry: EntryOverview, spaceId: string, list: HTMLUListElement): void {
  const li = document.createElement('li');
  li.className = 'entry-row';

  const dot = document.createElement('span');
  dot.className = `dot${entry.isOpen ? ' open' : ''}`;
  dot.title = entry.isOpen ? 'Ouvert' : 'Fermé';

  const titleBtn = document.createElement('button');
  titleBtn.className = 'entry-title';
  titleBtn.textContent = entry.title;
  titleBtn.title = entry.url;
  titleBtn.addEventListener('click', async () => {
    await send({ type: 'open-or-focus-entry', entryId: entry.id });
    window.close();
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Retirer définitivement';
  removeBtn.addEventListener('click', async () => {
    await send({ type: 'remove-entry', spaceId, entryId: entry.id });
    await loadCurrentSpaceContent();
  });

  li.append(dot, titleBtn, removeBtn);
  list.append(li);
}

function renderCurrentSpaceContent(content: SpaceContentOverview | null): void {
  currentSectionEl.innerHTML = '';
  if (!content) return; // onglet courant hors de tout espace reconnu

  const sep = document.createElement('hr');
  sep.className = 'sep';

  const h2 = document.createElement('h2');
  h2.textContent = `${content.spaceEmoji} ${content.spaceName}`;

  const pinnedTitle = document.createElement('h3');
  pinnedTitle.textContent = `Épinglés (${content.pinnedCount}/${content.maxPinned})`;

  const pinnedList = document.createElement('ul');
  pinnedList.className = 'entry-list';
  if (content.pinned.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Aucun — clic droit sur une page de cet espace pour en ajouter un.';
    currentSectionEl.append(sep, h2, pinnedTitle, p);
  } else {
    for (const entry of content.pinned) renderEntryRow(entry, content.spaceId, pinnedList);
    currentSectionEl.append(sep, h2, pinnedTitle, pinnedList);
  }

  for (const folder of content.folders) {
    const folderTitle = document.createElement('h3');
    const swatch = document.createElement('span');
    swatch.className = 'folder-swatch';
    swatch.style.background = COLOR_HEX[folder.color] ?? '#80868b';
    folderTitle.append(swatch, document.createTextNode(` ${folder.name}`));
    currentSectionEl.append(folderTitle);

    if (folder.tabs.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'Dossier vide.';
      currentSectionEl.append(p);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'entry-list';
      for (const entry of folder.tabs) renderEntryRow(entry, content.spaceId, ul);
      currentSectionEl.append(ul);
    }
  }

  const cleanBtn = document.createElement('button');
  cleanBtn.id = 'clean-space-btn';
  cleanBtn.type = 'button';
  cleanBtn.textContent = 'Nettoyer cet espace (fermer les autres onglets)';
  cleanBtn.addEventListener('click', async () => {
    await send({ type: 'clean-space', spaceId: content.spaceId });
    window.close();
  });
  currentSectionEl.append(cleanBtn);
}

async function loadSpaces(): Promise<void> {
  const spaces = (await send({ type: 'get-spaces-overview' })) as SpaceOverviewEntry[];
  renderSpaces(spaces ?? []);
}

async function loadCurrentSpaceContent(): Promise<void> {
  const content = (await send({ type: 'get-current-space-content' })) as SpaceContentOverview | null;
  renderCurrentSpaceContent(content);
}

void loadSpaces();
void loadCurrentSpaceContent();
