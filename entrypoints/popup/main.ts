import './style.css';
import { browser } from '#imports';
import type { ExtensionMessage, SpaceOverviewEntry } from '@/lib/messages';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Espaces</h1>
  <ul class="space-list" id="space-list"></ul>
  <p class="settings-link"><a href="#" id="open-options">Gérer les espaces</a></p>
`;

const listEl = document.querySelector<HTMLUListElement>('#space-list')!;

document.querySelector<HTMLAnchorElement>('#open-options')!.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

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
      const message: ExtensionMessage = { type: 'switch-space', spaceId: space.id };
      await browser.runtime.sendMessage(message);
      window.close();
    });

    li.append(button);
    listEl.append(li);
  }
}

async function loadSpaces(): Promise<void> {
  const message: ExtensionMessage = { type: 'get-spaces-overview' };
  const spaces = (await browser.runtime.sendMessage(message)) as SpaceOverviewEntry[];
  renderSpaces(spaces ?? []);
}

void loadSpaces();
