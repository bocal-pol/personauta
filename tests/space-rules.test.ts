import { describe, it, expect } from 'vitest';
import { decideSwitch, spaceIdForCommand, canAddSpace } from '@/lib/space-rules';
import type { Space } from '@/lib/spaces-storage';

function space(overrides: Partial<Space> = {}): Space {
  return { id: 's1', name: 'Test', emoji: '📁', color: '#000000', homeUrls: [], ...overrides };
}

describe('decideSwitch', () => {
  it('retourne not-found si l’espace n’existe pas', () => {
    expect(decideSwitch('missing', [], {}, new Set())).toEqual({ action: 'not-found' });
  });

  it('focus la fenêtre existante si elle est encore ouverte', () => {
    const spaces = [space({ id: 'a' })];
    const result = decideSwitch('a', spaces, { a: 42 }, new Set([42]));
    expect(result).toEqual({ action: 'focus', windowId: 42 });
  });

  it('recrée si la fenêtre mappée a été fermée entretemps', () => {
    const spaces = [space({ id: 'a', homeUrls: ['https://example.com'] })];
    const result = decideSwitch('a', spaces, { a: 42 }, new Set()); // 42 absent des fenêtres ouvertes
    expect(result).toEqual({ action: 'create', urls: ['https://example.com'] });
  });

  it('crée une fenêtre vierge (urls undefined) si aucune URL d’accueil', () => {
    const spaces = [space({ id: 'a', homeUrls: [] })];
    const result = decideSwitch('a', spaces, {}, new Set());
    expect(result).toEqual({ action: 'create', urls: undefined });
  });
});

describe('spaceIdForCommand', () => {
  const spaces = [space({ id: 'a' }), space({ id: 'b' }), space({ id: 'c' })];

  it('résout la commande vers le bon espace par position', () => {
    expect(spaceIdForCommand('switch-space-1', spaces)).toBe('a');
    expect(spaceIdForCommand('switch-space-3', spaces)).toBe('c');
  });

  it('retourne null si la position dépasse le nombre d’espaces définis', () => {
    expect(spaceIdForCommand('switch-space-6', spaces)).toBeNull();
  });

  it('retourne null pour une commande qui ne correspond pas au motif', () => {
    expect(spaceIdForCommand('some-other-command', spaces)).toBeNull();
  });
});

describe('canAddSpace', () => {
  it('autorise en dessous de la limite', () => {
    expect(canAddSpace([space(), space()])).toBe(true);
  });

  it('refuse à la limite de 6', () => {
    const spaces = Array.from({ length: 6 }, (_, i) => space({ id: String(i) }));
    expect(canAddSpace(spaces)).toBe(false);
  });
});
