import { useEffect, useState } from "react";
import type { SettingEditorProps } from "../../sdk/types";

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/** Recherche de ville (géocodage Open-Meteo, sans clé) : remplit nom, latitude et longitude. */
export function CitySearch({ settings, onPatch }: SettingEditorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setState("idle");
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setState("loading");
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`, { signal: ctrl.signal });
        const data = (await r.json()) as { results?: GeoResult[] };
        setResults(data.results ?? []);
        setState("idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState("error");
      }
    }, 350);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const lat = Number(settings.latitude);
  const lon = Number(settings.longitude);
  return (
    <div className="city">
      <div className="city-current">
        <b>{String(settings.city ?? "")}</b>
        {Number.isFinite(lat) && Number.isFinite(lon) && <span> · {lat.toFixed(2)}, {lon.toFixed(2)}</span>}
      </div>
      <input type="text" value={query} placeholder="Chercher une ville…" onChange={(e) => setQuery(e.target.value)} />
      {state === "loading" && <div className="form-help">Recherche…</div>}
      {state === "error" && <div className="field-error">Recherche impossible (pas de connexion ?).</div>}
      {state === "idle" && query.trim().length >= 2 && results.length === 0 && <div className="form-help">Aucune ville trouvée.</div>}
      {results.length > 0 && (
        <div className="city-results">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="city-result"
              onClick={() => {
                onPatch({ city: r.name, latitude: Math.round(r.latitude * 10000) / 10000, longitude: Math.round(r.longitude * 10000) / 10000 });
                setQuery("");
                setResults([]);
              }}
            >
              <span>{r.name}</span>
              <span className="city-region">{[r.admin1, r.country].filter(Boolean).join(", ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
