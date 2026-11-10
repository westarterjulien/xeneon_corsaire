import { useEffect, useRef, useState } from "react";
import { bridge } from "../bridge";
import { defaultConfig, sanitizeConfig, type AppConfig } from "./layout";
import { publish, subscribe } from "./sync";

/**
 * Configuration partagée : chargée au démarrage, sauvegardée après chaque modification
 * et diffusée en direct aux autres fenêtres (Edge ↔ Studio).
 */
export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const skipSave = useRef(true); // pas de sauvegarde pour le chargement initial ni pour une config reçue
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    bridge
      .loadConfig<AppConfig>()
      .then((c) => setConfig(sanitizeConfig(c)))
      .catch(() => setConfig(defaultConfig()));
    return subscribe((m) => {
      if (m.type !== "config") return;
      skipSave.current = true;
      setConfig(sanitizeConfig(m.config));
    });
  }, []);

  useEffect(() => {
    if (!config) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      publish({ type: "config", config });
      bridge
        .saveConfig(config)
        .then(() => setSaveError(null))
        .catch((e) => setSaveError(`Sauvegarde impossible : ${e}`));
    }, 250);
    return () => window.clearTimeout(t);
  }, [config]);

  return { config, setConfig, saveError };
}
