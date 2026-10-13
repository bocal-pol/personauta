import './style.css';
import { browser } from '#imports';
import { spacesItem, MAX_SPACES, type Space } from '@/lib/spaces-storage';
import { canAddSpace } from '@/lib/space-rules';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Personauta — Réglages</h1>
  <p class="hint">Jusqu'à ${MAX_SPACES} espaces. Chaque espace ouvre sa propre fenêtre Chrome ; les
  URLs d'accueil se rouvrent automatiquement si cette fenêtre a été fermée.</p>
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
  // Chrome n'a pas d'équivalent à commands.openShortcutSettings() (Firefox) — tabs.create vers
  // cette page chrome:// interne est l'approche standard pour les extensions.
  browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

function flashSaved(): void {
  saveStatus.textContent = 'Enregistré.';
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 1500);
}

let spaces: Space[] = [];

function swapSpaces(i: number, j: number): void {
  const a = spaces[i];
  const b = spaces[j];
  if (a == null || b == null) return;
  spaces[i] = b;
  spaces[j] = a;
}

async function persist(): Promise<void> {
  await spacesItem.setValue(spaces);
  flashSaved();
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
      void persist();
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'name-input';
    nameInput.value = space.name;
    nameInput.addEventListener('change', () => {
      space.name = nameInput.value.trim() || 'Espace';
      void persist();
    });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = space.color;
    colorInput.addEventListener('change', () => {
      space.color = colorInput.value;
      void persist();
    });

    topRow.append(emojiInput, nameInput, colorInput);

    const urlsLabel = document.createElement('label');
    urlsLabel.className = 'hint';
    urlsLabel.textContent = "URLs d'accueil (une par ligne, optionnel) :";

    const urlsTextarea = document.createElement('textarea');
    urlsTextarea.value = space.homeUrls.join('\n');
    urlsTextarea.addEventListener('change', () => {
      space.homeUrls = urlsTextarea.value
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);
      void persist();
    });

    const actions = document.createElement('div');
    actions.className = 'actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      swapSpaces(index, index - 1);
      render();
      void persist();
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.textContent = '↓';
    downBtn.disabled = index === spaces.length - 1;
    downBtn.addEventListener('click', () => {
      swapSpaces(index, index + 1);
      render();
      void persist();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.addEventListener('click', () => {
      spaces.splice(index, 1);
      render();
      void persist();
    });

    actions.append(upBtn, downBtn, deleteBtn);
    card.append(topRow, urlsLabel, urlsTextarea, actions);
    cardsEl.append(card);
  });

  addBtn.disabled = !canAddSpace(spaces);
  addBtn.title = addBtn.disabled ? `Maximum de ${MAX_SPACES} espaces atteint.` : '';
}

addBtn.addEventListener('click', () => {
  if (!canAddSpace(spaces)) return;
  spaces.push({
    id: crypto.randomUUID(),
    name: 'Nouvel espace',
    emoji: '📁',
    color: '#64748b',
    homeUrls: [],
  });
  render();
  void persist();
});

void (async () => {
  spaces = await spacesItem.getValue();
  render();
})();
