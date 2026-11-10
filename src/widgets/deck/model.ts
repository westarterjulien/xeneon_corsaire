import { bridge, type Action, type InstalledApp } from "../../bridge";

/** Étape d'un bouton : une action, une pause, ou basculer la sourdine du micro / du son. */
export type Step = Action | { kind: "delay"; ms: number } | { kind: "audio"; target: "input" | "output" };

export interface ButtonFace {
  label: string;
  /** Nom d'icône de la bibliothèque. */
  icon?: string;
  /** Vraie icône d'un logiciel installé (prioritaire sur `icon`). */
  app?: InstalledApp;
  /** Teinte du bouton (#rrggbb). */
  color?: string;
}

export interface DeckButton extends ButtonFace {
  id: string;
  steps: Step[];
  /** Bouton à deux états : second visuel et secondes étapes, exécutées un appui sur deux. */
  alt?: ButtonFace & { steps: Step[] };
  /** Dossier : sous-grille de boutons. */
  children?: DeckButton[];
}

export const newId = () => Math.random().toString(36).slice(2, 9);

export const COLORS = ["", "#a9c4ff", "#7ee0a1", "#ffd98a", "#ff8a8a", "#c4a8ff", "#7bdff2"];

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Exécute les étapes dans l'ordre ; s'arrête à la première erreur. */
export async function runSteps(steps: Step[], goTo: (page: number) => void) {
  for (const s of steps) {
    if (s.kind === "delay") await sleep(Math.max(0, Math.min(60_000, Number(s.ms) || 0)));
    else if (s.kind === "page") goTo(s.page);
    else if (s.kind === "audio") {
      const st = await bridge.audioState();
      const cur = s.target === "input" ? st.input : st.output;
      await bridge.audioSet(s.target, { muted: !cur?.muted });
    } else await bridge.runAction(s);
  }
}

/** Retrouve la liste de boutons au bout d'un chemin de dossiers. */
export function atPath(buttons: DeckButton[], path: string[]): DeckButton[] {
  let list = buttons;
  for (const id of path) list = list.find((b) => b.id === id)?.children ?? [];
  return list;
}

/** Remplace la liste au bout du chemin (immuable). */
export function setAtPath(buttons: DeckButton[], path: string[], next: DeckButton[]): DeckButton[] {
  if (!path.length) return next;
  const [head, ...rest] = path;
  return buttons.map((b) => (b.id === head ? { ...b, children: setAtPath(b.children ?? [], rest, next) } : b));
}

export const DEFAULT_DECK: DeckButton[] = [
  { id: "cap", label: "Capture", icon: "camera", steps: [{ kind: "keys", keys: "win+shift+s" }] },
  {
    id: "mic",
    label: "Micro",
    icon: "mic",
    steps: [{ kind: "audio", target: "input" }],
    alt: { label: "Micro coupé", icon: "mic-off", color: "#ff8a8a", steps: [{ kind: "audio", target: "input" }] },
  },
  { id: "lock", label: "Verrouiller", icon: "lock", steps: [{ kind: "command", command: "rundll32.exe user32.dll,LockWorkStation" }] },
  {
    id: "tools",
    label: "Outils",
    icon: "folder",
    steps: [],
    children: [
      { id: "calc", label: "Calculatrice", icon: "calculator", steps: [{ kind: "command", command: "calc.exe" }] },
      { id: "files", label: "Fichiers", icon: "folder", steps: [{ kind: "keys", keys: "win+e" }] },
      { id: "task", label: "Gestionnaire", icon: "activity", steps: [{ kind: "keys", keys: "ctrl+shift+esc" }] },
      { id: "set", label: "Paramètres", icon: "settings", steps: [{ kind: "open", target: "ms-settings:" }] },
    ],
  },
  { id: "pp", label: "Lecture", icon: "play", steps: [{ kind: "media", command: "play_pause" }] },
  { id: "next", label: "Suivant", icon: "next", steps: [{ kind: "media", command: "next" }] },
];
