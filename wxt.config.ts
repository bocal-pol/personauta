import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Personauta',
    description:
      "Espaces d'onglets façon Arc (perso/pro/loisir, jusqu'à 6) : une fenêtre Chrome dédiée par espace, bascule via le popup ou des raccourcis clavier.",
    permissions: ['storage'],
    commands: {
      'switch-space-1': {
        suggested_key: { default: 'Ctrl+Shift+1' },
        description: "Basculer vers l'espace 1",
      },
      'switch-space-2': {
        suggested_key: { default: 'Ctrl+Shift+2' },
        description: "Basculer vers l'espace 2",
      },
      'switch-space-3': {
        suggested_key: { default: 'Ctrl+Shift+3' },
        description: "Basculer vers l'espace 3",
      },
      'switch-space-4': {
        suggested_key: { default: 'Ctrl+Shift+4' },
        description: "Basculer vers l'espace 4",
      },
      // Chrome ne permet que 4 raccourcis auto-suggérés dans le manifest — les espaces 5 et 6
      // restent non assignés, configurables manuellement via chrome://extensions/shortcuts
      // (bouton prévu à cet effet dans la page d'options).
      'switch-space-5': { description: "Basculer vers l'espace 5" },
      'switch-space-6': { description: "Basculer vers l'espace 6" },
    },
  },
});
