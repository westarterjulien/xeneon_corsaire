import type { HaEntity } from "../../bridge";

export const TOGGLE = new Set(["light", "switch", "fan", "input_boolean"]);
export const RUN: Record<string, string> = { scene: "turn_on", script: "turn_on", button: "press" };

export function entityIcon(e: HaEntity): string {
  if (e.domain === "light") return "bulb";
  if (e.domain === "switch" || e.domain === "input_boolean" || e.domain === "fan") return "power";
  if (e.domain === "scene" || e.domain === "script" || e.domain === "button") return "play";
  if (e.deviceClass === "temperature" || e.domain === "climate") return "thermo";
  if (e.deviceClass === "humidity") return "drop";
  if (e.domain === "lock") return "lock";
  if (e.domain === "media_player") return "music";
  return "home";
}

const STATES: Record<string, string> = { on: "Allumé", off: "Éteint", unavailable: "Indisponible", unknown: "—", open: "Ouvert", closed: "Fermé", locked: "Verrouillé", unlocked: "Déverrouillé", playing: "Lecture", paused: "Pause", idle: "Inactif", home: "Présent", not_home: "Absent" };

export function stateLabel(e: HaEntity): string {
  if (e.domain in RUN) return "Lancer";
  const n = Number(e.state);
  if (e.state !== "" && !Number.isNaN(n)) return `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")}${e.unit ? ` ${e.unit}` : ""}`;
  return STATES[e.state] ?? e.state;
}
