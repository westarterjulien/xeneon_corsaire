import { createInstance, uid, type Page, type WidgetInstance } from "./layout";

function w(type: string, x: number, y: number, wd: number, h: number, settings: Record<string, unknown> = {}): WidgetInstance {
  const i = createInstance(type, { x, y, w: wd, h });
  return { ...i, settings: { ...i.settings, ...settings } };
}

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  build: () => Page;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "empty",
    name: "Page vide",
    description: "Une page sans widget.",
    icon: "plus",
    build: () => ({ id: uid(), name: "Nouvelle page", widgets: [] }),
  },
  {
    id: "game",
    name: "Jeu",
    description: "S'affiche dès qu'un jeu est en plein écran : performances, ping, musique, volumes, Discord, batteries.",
    icon: "gamepad",
    build: () => ({
      id: uid(),
      name: "Jeu",
      auto: { apps: [], fullscreen: true },
      widgets: [
        w("system", 0, 0, 4, 4, { showCores: false }),
        w("network", 4, 0, 4, 2, { showIp: false }),
        w("media", 4, 2, 4, 2),
        w("sound", 8, 0, 4, 4, { showInput: false }),
        w("discord", 12, 0, 4, 2),
        w("batteries", 12, 2, 4, 2),
      ],
    }),
  },
  {
    id: "work",
    name: "Travail",
    description: "S'affiche avec Teams ou Outlook : agenda, statut Teams, presse-papiers, boutons.",
    icon: "clock",
    build: () => ({
      id: uid(),
      name: "Travail",
      auto: { apps: ["ms-teams", "teams", "olk", "outlook"], fullscreen: false },
      widgets: [
        w("clock", 0, 0, 3, 2, { label: "" }),
        w("weather", 0, 2, 3, 2),
        w("agenda", 3, 0, 5, 4),
        w("teams", 8, 0, 4, 2),
        w("clipboard", 8, 2, 4, 2),
        w("deck", 12, 0, 4, 4, { title: "Raccourcis" }),
      ],
    }),
  },
];
