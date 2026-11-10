import type { ComponentType } from "react";

/** Champ de réglage d'un widget : le panneau de réglages est généré à partir de cette liste. */
export type SettingField =
  | { key: string; label: string; type: "text"; default?: string; placeholder?: string; help?: string }
  | { key: string; label: string; type: "number"; default?: number; min?: number; max?: number; step?: number; help?: string }
  | { key: string; label: string; type: "boolean"; default?: boolean; help?: string }
  | { key: string; label: string; type: "select"; default?: string; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: "color"; default?: string; help?: string }
  | { key: string; label: string; type: "json"; default?: unknown; help?: string }
  /** Sélecteur d'icône (noms de src/sdk/icons.tsx). */
  | { key: string; label: string; type: "icon"; default?: string; help?: string }
  /** Éditeur sur mesure fourni par le widget (ex. éditeur de raccourcis, recherche de ville). */
  | { key: string; label: string; type: "custom"; default?: unknown; help?: string; editor: ComponentType<SettingEditorProps> };

export interface SettingEditorProps {
  value: unknown;
  /** Tous les réglages du widget. */
  settings: Record<string, unknown>;
  onChange: (value: unknown) => void;
  /** Modifie plusieurs réglages d'un coup (ex. ville + latitude + longitude). */
  onPatch: (patch: Record<string, unknown>) => void;
}

export interface GridSize {
  w: number;
  h: number;
}

export interface WidgetProps<S = Record<string, unknown>> {
  /** Identifiant unique de l'instance (un même widget peut être posé plusieurs fois). */
  id: string;
  settings: S;
  /** Taille courante en cellules de grille. */
  size: GridSize;
  /** Vrai quand l'écran est en mode édition (désactiver les interactions destructrices). */
  editing: boolean;
  updateSettings: (patch: Partial<S>) => void;
}

export interface WidgetDefinition<S = any> {
  /** Identifiant stable, utilisé dans la configuration sauvegardée. */
  type: string;
  name: string;
  description: string;
  /** Nom d'icône de src/sdk/icons.tsx (ou court texte) affiché dans la palette. */
  icon: string;
  defaultSize: GridSize;
  minSize?: GridSize;
  maxSize?: GridSize;
  settings?: SettingField[];
  component: ComponentType<WidgetProps<S>>;
}

/** Aide au typage : `export default defineWidget<MesReglages>({ ... })`. */
export function defineWidget<S>(def: WidgetDefinition<S>): WidgetDefinition<S> {
  return def;
}
