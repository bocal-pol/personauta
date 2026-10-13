import './style.css';
import { browser } from '#imports';
import { spacesItem, MAX_SPACES, type Space } from '@/lib/spaces-storage';
import { canAddSpace } from '@/lib/space-rules';
import { GROUP_COLORS } from '@/lib/folders-storage';
import type { ExtensionMessage, SpaceContentOverview } from '@/lib/messages';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Personauta — Réglages</h1>
  <p class="hint">
    Jusqu'à ${MAX_SPACES} espaces. Chaque espace ouvre sa propre fenêtre Chrome, avec ses propres
    onglets épinglés (max 9) et ses propres dossiers d'onglets à garder — indépendants des autres
    espaces. Épingler un onglet ou l'ajouter à un dossier se fait par clic droit sur la page, ou
    depuis le popup.
  </p>
  <div id="space-cards"></div>
  <button id="add-space-btn" type="button">+ Ajouter un espace</button>
  <p id="save-status" aria-live="polite"></p>

  <section class="shortcuts-section">
    <h2>Raccourcis clavier</h2>
    <p class="hint">
      Chrome ne permet que 4 raccourcis proposés automatiquement (espaces 1 à 4, Ctrl+Shift+1..4).
      Les espaces 5 et 6 se configurent manuellement sur la page des raccourcis.
    </p>
    <button id="open-shortcuts-btn" type="button">Configurer les raccourcis clavier</button>
  </section>
`;

const cardsEl = document.querySelector<HTMLDivElement>('#space-cards')!;
const addBtn = document.querySelector<HTMLButtonElement>('#add-space-btn')!;
const saveStatus = document.querySelector<HTMLParagraphElement>('#save-status')!;

document.querySelector<HTMLButtonElement>('#open-shortcuts-btn')!.addEventListener('click', () => {
  browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

function flashSaved(): void {
  saveStatus.textContent = 'Enregistré.';
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 1500);
}

async function send(message: ExtensionMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

let spaces: Space[] = [];

function swapSpaces(i: number, j: number): void {
  const a = spaces[i];
  const b = spaces[j];
  if (a == null || b == null) return;
  spaces[i] = b;
  spaces[j] = a;
}

async function persistSpaces(): Promise<void> {
  await spacesItem.setValue(spaces);
  flashSaved();
}

function renderSpaceContent(container: HTMLElement, content: SpaceContentOverview): void {
  container.innerHTML = '';
  container.className = 'space-content';

  const pinnedTitle = document.createElement('h4');
  pinnedTitle.textContent = `Épinglés (${content.pinnedCount}/${content.maxPinned})`;
  container.append(pinnedTitle);

  if (content.pinned.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Aucun.';
    container.append(p);
  } else {
    for (const entry of content.pinned) {
      const row = document.createElement('div');
      row.className = 'pinned-row';
      const span = document.createElement('span');
      span.textContent = `${entry.isOpen ? '🟢' : '⚪'} ${entry.title}`;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'danger';
      removeBtn.type = 'button';
      removeBtn.textContent = 'Retirer';
      removeBtn.addEventListener('click', async () => {
        await send({ type: 'remove-entry', spaceId: content.spaceId, entryId: entry.id });
        await refreshSpaceContent(content.spaceId, container);
      });
      row.append(span, removeBtn);
      container.append(row);
    }
  }

  const foldersTitle = document.createElement('h4');
  foldersTitle.textContent = 'Dossiers';
  container.append(foldersTitle);

  for (const folder of content.folders) {
    const card = document.createElement('div');
    card.className = 'folder-card';

    const row = document.createElement('div');
    row.className = 'row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = folder.name;
    nameInput.addEventListener('change', async () => {
      await send({ type: 'rename-folder', spaceId: content.spaceId, folderId: folder.id, name: nameInput.value });
      flashSaved();
    });

    const colorSelect = document.createElement('select');
    for (const color of GROUP_COLORS) {
      const option = document.createElement('option');
      option.value = color;
      option.textContent = color;
      option.selected = color === folder.color;
      colorSelect.append(option);
    }
    colorSelect.addEventListener('change', async () => {
      await send({ type: 'recolor-folder', spaceId: content.spaceId, folderId: folder.id, color: colorSelect.value });
      flashSaved();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.addEventListener('click', async () => {
      const count = folder.tabs.length;
      const ok = window.confirm(
        count > 0
          ? `Supprimer « ${folder.name} » retirera ${count} onglet(s) de la liste à garder (les onglets ouverts resteront ouverts). Continuer ?`
          : `Supprimer le dossier « ${folder.name} » ?`,
      );
      if (!ok) return;
      await send({ type: 'delete-folder', spaceId: content.spaceId, folderId: folder.id });
      await refreshSpaceContent(content.spaceId, container);
    });

    row.append(nameInput, colorSelect, deleteBtn);

    const tabsList = document.createElement('div');
    tabsList.className = 'folder-tabs';
    tabsList.textContent =
      folder.tabs.length === 0 ? 'Aucun onglet dans ce dossier.' : folder.tabs.map((t) => t.title).join(' · ');

    card.append(row, tabsList);
    container.append(card);
  }

  const addFolderBtn = document.createElement('button');
  addFolderBtn.type = 'button';
  addFolderBtn.textContent = '+ Nouveau dossier';
  addFolderBtn.addEventListener('click', async () => {
    await send({ type: 'create-folder', spaceId: content.spaceId });
    await refreshSpaceContent(content.spaceId, container);
  });
  container.append(addFolderBtn);
}

async function refreshSpaceContent(spaceId: string, container: HTMLElement): Promise<void> {
  const content = (await send({ type: 'get-space-content', spaceId })) as SpaceContentOverview;
  renderSpaceContent(container, content);
}

function render(): void {
  cardsEl.innerHTML = '';

  spaces.forEach((space, index) => {
    const card = document.createElement('div');
    card.className = 'space-card';

    const topRow = document.createElement('div');
    topRow.className = 'row';

    const emojiInput = document.createElement('input');
    emojiInput.type = 'text';
    emojiInput.className = 'emoji-input';
    emojiInput.value = space.emoji;
    emojiInput.maxLength = 4;
    emojiInput.addEventListener('change', () => {
      space.emoji = emojiInput.value || '📁';
      void persistSpaces();
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'name-input';
    nameInput.value = space.name;
    nameInput.addEventListener('change', () => {
      space.name = nameInput.value.trim() || 'Espace';
      void persistSpaces();
    });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = space.color;
    colorInput.addEventListener('change', () => {
      space.color = colorInput.value;
      void persistSpaces();
    });

    topRow.append(emojiInput, nameInput, colorInput);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      swapSpaces(index, index - 1);
      render();
      void persistSpaces();
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.textContent = '↓';
    downBtn.disabled = index === spaces.length - 1;
    downBtn.addEventListener('click', () => {
      swapSpaces(index, index + 1);
      render();
      void persistSpaces();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.addEventListener('click', async () => {
      const ok = window.confirm(
        `Supprimer l'espace « ${space.name} » ? Ses épinglés et dossiers seront perdus (sa fenêtre, si ouverte, ne sera pas fermée).`,
      );
      if (!ok) return;
      await send({ type: 'delete-space', spaceId: space.id });
      spaces = spaces.filter((s) => s.id !== space.id);
      render();
      flashSaved();
    });

    actions.append(upBtn, downBtn, deleteBtn);

    const contentContainer = document.createElement('div');

    card.append(topRow, actions, contentContainer);
    cardsEl.append(card);

    void refreshSpaceContent(space.id, contentContainer);
  });

  addBtn.disabled = !canAddSpace(spaces);
  addBtn.title = addBtn.disabled ? `Maximum de ${MAX_SPACES} espaces atteint.` : '';
}

addBtn.addEventListener('click', () => {
  if (!canAddSpace(spaces)) return;
  spaces.push({ id: crypto.randomUUID(), name: 'Nouvel espace', emoji: '📁', color: '#64748b' });
  render();
  void persistSpaces();
});

void (async () => {
  spaces = await spacesItem.getValue();
  render();
})();
