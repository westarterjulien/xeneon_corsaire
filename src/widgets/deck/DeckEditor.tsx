import { useMemo, useState } from "react";
import { bridge, type InstalledApp } from "../../bridge";
import { IconPicker } from "../../core/IconPicker";
import { useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import type { SettingEditorProps } from "../../sdk/types";
import { AppIcon } from "../apps/AppIcon";
import { ActionForm, defaultAction, summary } from "../shortcuts/ShortcutsEditor";
import { FaceVisual } from "./face";
import { atPath, COLORS, newId, onColor, setAtPath, type ButtonFace, type ButtonImage, type DeckButton, type Step } from "./model";

function stepSummary(s: Step): string {
  if (s.kind === "delay") return `Pause ${(s.ms / 1000).toLocaleString("fr-FR")} s`;
  if (s.kind === "audio") return s.target === "input" ? "Micro : couper / réactiver" : "Son : couper / réactiver";
  return summary(s);
}

/** Choix d'une appli installée pour son icône. */
function AppChooser({ value, onChange }: { value?: InstalledApp; onChange: (a?: InstalledApp) => void }) {
  const { value: installed } = useShared<InstalledApp[]>("installed-apps", bridge.installedApps, 300_000);
  const [q, setQ] = useState("");
  const res = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? (installed ?? []).filter((a) => a.name.toLowerCase().includes(t)).slice(0, 12) : [];
  }, [installed, q]);
  return (
    <div className="dke-app">
      {value && (
        <div className="dke-app-current">
          <AppIcon app={value} size={28} /> {value.name}
          <button type="button" className="chip" onClick={() => onChange(undefined)}>Retirer</button>
        </div>
      )}
      <input type="text" value={q} placeholder="Icône d'un logiciel installé : chercher…" onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <div className="apk-results">
          {res.map((a) => (
            <button key={a.id} type="button" className="apk-result" onClick={() => { onChange(a); setQ(""); }}>
              <AppIcon app={a} size={24} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Logos de marque (Simple Icons, licence CC0) ----------
const SI_URL = (slug: string) => `https://cdn.jsdelivr.net/npm/simple-icons@13/icons/${slug}.svg`;
const BRANDS = [
  "discord", "spotify", "steam", "obsstudio", "twitch", "youtube", "netflix", "epicgames", "battledotnet", "ubisoft",
  "playstation", "xbox", "nvidia", "amd", "riotgames", "valorant", "leagueoflegends", "x", "whatsapp", "telegram",
  "github", "notion", "slack", "figma", "googlechrome", "firefoxbrowser", "vlcmediaplayer", "plex", "deezer", "applemusic",
];
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");

/** Télécharge le SVG du logo et le garde dans la configuration (fonctionne ensuite hors ligne). */
async function brandImage(slug: string): Promise<ButtonImage> {
  const r = await fetch(SI_URL(slug));
  if (!r.ok) throw new Error(`logo « ${slug} » introuvable`);
  const svg = await r.text();
  if (!svg.trim().startsWith("<svg")) throw new Error("fichier inattendu");
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, mono: true };
}

/** Image perso : SVG gardé tel quel (si léger), sinon redimensionnée en PNG 160 px. */
function fileImage(file: File): Promise<ButtonImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("lecture impossible"));
    if (file.type === "image/svg+xml" && file.size < 150_000) {
      reader.onload = () => resolve({ src: String(reader.result), mono: false });
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image illisible"));
      img.onload = () => {
        const size = 160;
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const k = Math.min(size / img.width, size / img.height);
        const w = img.width * k;
        const h = img.height * k;
        c.getContext("2d")!.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve({ src: c.toDataURL("image/png"), mono: false });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

type Source = "icon" | "app" | "brand" | "image";

/** Libellé, couleur et visuel (icône, logiciel, logo de marque ou image perso). */
function FaceForm({ face, onChange }: { face: ButtonFace; onChange: (f: Partial<ButtonFace>) => void }) {
  const initial: Source = face.image ? (face.image.mono ? "brand" : "image") : face.app ? "app" : "icon";
  const [source, setSource] = useState<Source>(initial);
  const [brand, setBrand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const custom = face.color && !COLORS.includes(face.color);
  const useBrand = async (slug: string) => {
    setError(null);
    try {
      onChange({ image: await brandImage(slug), app: undefined });
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };
  return (
    <>
      <div className="dke-preview">
        <span className="dke-preview-box" style={face.color ? { background: face.color, color: onColor(face.color), borderColor: "transparent" } : undefined}>
          <FaceVisual face={face} size="34px" />
        </span>
        <input type="text" className="sce-label" value={face.label} placeholder="Libellé" onChange={(e) => onChange({ label: e.target.value })} />
      </div>

      <span className="form-label">Couleur</span>
      <div className="dke-colors">
        {COLORS.map((c) => (
          <button key={c || "none"} type="button" className={`dke-color ${(face.color ?? "") === c ? "is-active" : ""}`} style={c ? { background: c } : undefined} onClick={() => onChange({ color: c || undefined })} aria-label={c || "Sans couleur"}>
            {!c && "—"}
          </button>
        ))}
        <label className={`dke-color dke-custom ${custom ? "is-active" : ""}`} title="Autre couleur">
          <input type="color" value={face.color ?? "#2563eb"} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
      </div>

      <span className="form-label">Visuel</span>
      <div className="dke-tabs">
        {([["icon", "Icône"], ["app", "Logiciel"], ["brand", "Logo"], ["image", "Image"]] as [Source, string][]).map(([k, l]) => (
          <button key={k} type="button" className={source === k ? "is-active" : ""} onClick={() => setSource(k)}>{l}</button>
        ))}
      </div>
      {source === "icon" && <IconPicker value={face.icon} onChange={(icon) => onChange({ icon, app: undefined, image: undefined })} />}
      {source === "app" && <AppChooser value={face.app} onChange={(app) => onChange({ app, image: undefined })} />}
      {source === "brand" && (
        <>
          <div className="dke-brands">
            {BRANDS.map((b) => (
              <button key={b} type="button" className="dke-brand" title={b} onClick={() => useBrand(b)}>
                <span style={{ WebkitMaskImage: `url(${SI_URL(b)})`, maskImage: `url(${SI_URL(b)})` }} />
              </button>
            ))}
          </div>
          <div className="apk-path">
            <input type="text" value={brand} placeholder="Autre marque : ex. Ubisoft Connect, Battle.net, Elgato…" onChange={(e) => setBrand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && useBrand(slugify(brand))} />
            <button type="button" className="chip" onClick={() => useBrand(slugify(brand))} disabled={!brand.trim()}>Chercher</button>
          </div>
          {error && <span className="field-error">{error}</span>}
          <span className="form-help">Logos Simple Icons (libres de droits), téléchargés une fois puis gardés dans le bouton.</span>
        </>
      )}
      {source === "image" && (
        <>
          <label className="chip dke-file">
            <Icon name="plus" /> Choisir une image (PNG, JPG, SVG…)
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setError(null);
                try {
                  onChange({ image: await fileImage(f), app: undefined });
                } catch (err) {
                  setError(String((err as Error).message ?? err));
                }
              }}
            />
          </label>
          {error && <span className="field-error">{error}</span>}
        </>
      )}
      {face.image && (
        <label className="dke-inline dke-toggle">
          <input type="checkbox" checked={face.image.mono} onChange={(e) => onChange({ image: { ...face.image!, mono: e.target.checked } })} />
          Teinter l'image comme une icône (blanc, ou noir sur couleur claire)
        </label>
      )}
      {face.image && (
        <button type="button" className="chip" onClick={() => onChange({ image: undefined })}>Retirer l'image</button>
      )}
    </>
  );
}

/** Liste d'étapes exécutées dans l'ordre. */
function StepsForm({ steps, onChange }: { steps: Step[]; onChange: (s: Step[]) => void }) {
  const [open, setOpen] = useState<number | null>(steps.length ? null : null);
  const set = (i: number, s: Step) => onChange(steps.map((x, j) => (j === i ? s : x)));
  return (
    <div className="dke-steps">
      {steps.map((s, i) => (
        <div key={i} className={`dke-step ${open === i ? "is-open" : ""}`}>
          <div className="dke-step-head">
            <span className="dke-step-n">{i + 1}</span>
            <button type="button" className="dke-step-sum" onClick={() => setOpen(open === i ? null : i)}>{stepSummary(s)}</button>
            <button type="button" className="apk-btn" disabled={i === 0} onClick={() => { const n = [...steps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }} aria-label="Monter"><Icon name="chevronLeft" style={{ transform: "rotate(90deg)" }} /></button>
            <button type="button" className="apk-btn danger" onClick={() => { onChange(steps.filter((_, j) => j !== i)); setOpen(null); }} aria-label="Supprimer"><Icon name="close" /></button>
          </div>
          {open === i && (
            <div className="dke-step-body">
              {s.kind === "delay" ? (
                <label className="dke-inline">
                  Attendre
                  <input type="number" min={0} max={60} step={0.5} value={s.ms / 1000} onChange={(e) => set(i, { kind: "delay", ms: Math.round(Number(e.target.value) * 1000) })} />
                  secondes
                </label>
              ) : s.kind === "audio" ? (
                <select value={s.target} onChange={(e) => set(i, { kind: "audio", target: e.target.value as "input" | "output" })}>
                  <option value="input">Couper / réactiver le micro</option>
                  <option value="output">Couper / réactiver le son</option>
                </select>
              ) : (
                <ActionForm action={s} onChange={(a) => set(i, a)} />
              )}
            </div>
          )}
        </div>
      ))}
      <div className="dke-add">
        <button type="button" className="chip" onClick={() => { onChange([...steps, defaultAction("open")]); setOpen(steps.length); }}><Icon name="plus" /> Action</button>
        <button type="button" className="chip" onClick={() => onChange([...steps, { kind: "delay", ms: 1000 }])}><Icon name="clock" /> Pause</button>
        <button type="button" className="chip" onClick={() => onChange([...steps, { kind: "audio", target: "input" }])}><Icon name="mic" /> Micro</button>
      </div>
    </div>
  );
}

export function DeckEditor({ value, onChange }: SettingEditorProps) {
  const root = (Array.isArray(value) ? value : []) as DeckButton[];
  const [path, setPath] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(root[0]?.id ?? null);
  const list = atPath(root, path);
  const current = list.find((b) => b.id === sel);
  const setList = (next: DeckButton[]) => onChange(setAtPath(root, path, next));
  const update = (patch: Partial<DeckButton>) => current && setList(list.map((b) => (b.id === current.id ? { ...b, ...patch } : b)));

  const add = (folder: boolean) => {
    const b: DeckButton = folder ? { id: newId(), label: "Dossier", icon: "folder", steps: [], children: [] } : { id: newId(), label: "Nouveau", icon: "zap", steps: [] };
    setList([...list, b]);
    setSel(b.id);
  };

  return (
    <div className="sce">
      <div className="sce-list">
        {path.length > 0 && (
          <button type="button" className="sce-item dke-crumb" onClick={() => { setPath(path.slice(0, -1)); setSel(null); }}>
            <span className="sce-ico"><Icon name="chevronLeft" /></span>
            <span className="sce-text"><span className="sce-name">Retour</span><span className="sce-sum">{path.length} niveau{path.length > 1 ? "x" : ""} de dossier</span></span>
          </button>
        )}
        {list.map((b, i) => (
          <button key={b.id} type="button" className={`sce-item ${sel === b.id ? "is-active" : ""}`} onClick={() => setSel(b.id)}>
            <span className="sce-ico" style={b.color ? { background: b.color, color: onColor(b.color), borderColor: "transparent" } : undefined}>
              <FaceVisual face={b.icon || b.app || b.image ? b : { ...b, icon: "zap" }} size="20px" />
            </span>
            <span className="sce-text">
              <span className="sce-name">{b.label || "Sans nom"}</span>
              <span className="sce-sum">
                {b.children ? `Dossier · ${b.children.length} bouton${b.children.length > 1 ? "s" : ""}` : b.steps.length ? b.steps.map(stepSummary).join(" → ") : "Aucune action"}
                {b.alt ? " · 2 états" : ""}
              </span>
            </span>
            {i > 0 && (
              <span className="apk-btn" role="button" onClick={(e) => { e.stopPropagation(); const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setList(n); }} aria-label="Monter">
                <Icon name="chevronLeft" style={{ transform: "rotate(90deg)" }} />
              </span>
            )}
          </button>
        ))}
        <button type="button" className="sce-add" onClick={() => add(false)}><Icon name="plus" /> Bouton</button>
        <button type="button" className="sce-add" onClick={() => add(true)}><Icon name="folder" /> Dossier</button>
      </div>

      {current && (
        <div className="sce-form">
          <FaceForm face={current} onChange={update} />
          {current.children ? (
            <>
              <span className="form-label">Dossier</span>
              <button type="button" className="chip" onClick={() => { setPath([...path, current.id]); setSel(current.children?.[0]?.id ?? null); }}>Ouvrir le dossier pour le remplir</button>
            </>
          ) : (
            <>
              <span className="form-label">Actions, dans l'ordre</span>
              <StepsForm steps={current.steps} onChange={(steps) => update({ steps })} />
              <label className="dke-inline dke-toggle">
                <input type="checkbox" checked={!!current.alt} onChange={(e) => update({ alt: e.target.checked ? { label: `${current.label} (actif)`, icon: current.icon, color: "#7ee0a1", steps: [...current.steps] } : undefined })} />
                Bouton à deux états (un appui sur deux fait autre chose)
              </label>
              {current.alt && (
                <div className="dke-alt">
                  <span className="form-label">Second état</span>
                  <FaceForm face={current.alt} onChange={(p) => update({ alt: { ...current.alt!, ...p } })} />
                  <span className="form-label">Actions du second appui</span>
                  <StepsForm steps={current.alt.steps} onChange={(steps) => update({ alt: { ...current.alt!, steps } })} />
                </div>
              )}
            </>
          )}
          <button type="button" className="chip dke-delete" onClick={() => { setList(list.filter((b) => b.id !== current.id)); setSel(null); }}><Icon name="close" /> Supprimer ce bouton</button>
        </div>
      )}
    </div>
  );
}
