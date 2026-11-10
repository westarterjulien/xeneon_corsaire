import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { bridge, isTauri } from "../bridge";
import { Grid } from "../core/Grid";
import { createInstance, findFreeSpot, GRID, isFree, type Page, type PageAuto, type Rect, type WidgetInstance } from "../core/layout";
import { AppearanceForm, SettingsForm, SizeControls } from "../core/Panels";
import { useAppConfig } from "../core/store";
import { publish, subscribe } from "../core/sync";
import { PAGE_TEMPLATES } from "../core/templates";
import { useUserWidgetsLoader } from "../core/userWidgets";
import { Icon } from "../sdk/icons";
import { PageContext } from "../sdk/page";
import { isUserWidget, useRegistryVersion, useUserWidgetsInfo, widgetRegistry } from "../sdk/registry";
import { ThemeContext } from "../sdk/theme";
import type { WidgetDefinition } from "../sdk/types";

// ---------- Catégories de la bibliothèque ----------
const CATEGORIES: { id: string; name: string; color: string; types: string[] }[] = [
  { id: "essentials", name: "Essentiels", color: "#7aa2ff", types: ["clock", "weather", "web"] },
  { id: "system", name: "Système", color: "#34d399", types: ["system", "network", "batteries"] },
  { id: "audio", name: "Audio & jeu", color: "#f472b6", types: ["media", "sound", "discord"] },
  { id: "work", name: "Travail", color: "#a78bfa", types: ["agenda", "teams", "clipboard"] },
  { id: "launch", name: "Lanceurs", color: "#fbbf24", types: ["deck", "apps", "shortcuts"] },
  { id: "home", name: "Maison", color: "#22d3ee", types: ["homeassistant"] },
];
const MINE = { id: "mine", name: "Mes widgets", color: "#fb923c" };

function categoryOf(type: string) {
  if (isUserWidget(type)) return MINE;
  return CATEGORIES.find((c) => c.types.includes(type)) ?? CATEGORIES[0];
}

const GUIDE_URL = "https://github.com/westarterjulien/xeneon_corsaire/blob/main/docs/widgets-perso.md";
const DRAG_TYPE = "application/x-edge-widget";

// ---------- Petits composants ----------
function Tile({ type, size = 36 }: { type: string; size?: number }) {
  const def = widgetRegistry.get(type);
  const c = categoryOf(type).color;
  return (
    <span className="sx-tile" style={{ "--c": c, width: size, height: size, fontSize: size * 0.48 } as CSSProperties}>
      <Icon name={def?.icon ?? "zap"} />
    </span>
  );
}

function Card({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="sx-card">
      {(title || action) && (
        <header className="sx-card-head">
          {title && <h3>{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sx-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sx-modal" role="dialog" aria-label={title}>
        <header className="sx-modal-head">
          <h2>{title}</h2>
          <button className="sx-icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </header>
        <div className="sx-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- Bibliothèque ----------
function Library({ onAdd, onReload }: { onAdd: (type: string) => void; onReload: () => void }) {
  useRegistryVersion();
  const info = useUserWidgetsInfo();
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const all = [...widgetRegistry.values()];
  const match = (d: WidgetDefinition) => !q.trim() || `${d.name} ${d.description}`.toLowerCase().includes(q.trim().toLowerCase());
  const groups = [
    ...CATEGORIES.map((c) => ({ ...c, items: all.filter((d) => c.types.includes(d.type) && match(d)) })),
    { ...MINE, items: all.filter((d) => isUserWidget(d.type) && match(d)) },
  ];
  const orphan = all.filter((d) => !isUserWidget(d.type) && !CATEGORIES.some((c) => c.types.includes(d.type)) && match(d));
  if (orphan.length) groups[0].items.push(...orphan);

  const create = async () => {
    const name = window.prompt("Nom du nouveau widget", "Mon widget");
    if (!name?.trim()) return;
    try {
      const id = await bridge.createUserWidget(name);
      onReload();
      if (info.dir) await bridge.runAction({ kind: "open", target: `${info.dir}\\${id}` });
      setNote(`« ${name} » créé : modifie son index.html, il se recharge tout seul.`);
    } catch (e) {
      setNote(String(e));
    }
  };

  return (
    <aside className="sx-lib">
      <div className="sx-search">
        <Icon name="search" className="sx-search-icon" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un widget" />
      </div>
      <p className="sx-lib-hint">Glisse un widget sur l'aperçu, ou clique pour l'ajouter.</p>
      <div className="sx-lib-scroll">
        {groups.map((g) =>
          g.items.length || g.id === "mine" ? (
            <div key={g.id} className="sx-group">
              <div className="sx-group-title">
                <span className="sx-dot" style={{ background: g.color }} />
                {g.name}
              </div>
              <div className="sx-items">
                {g.items.map((d) => (
                  <button
                    key={d.type}
                    className="sx-item"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, d.type);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onAdd(d.type)}
                    title={d.description}
                  >
                    <Tile type={d.type} />
                    <span className="sx-item-text">
                      <span className="sx-item-name">{d.name}</span>
                      <span className="sx-item-size">{d.defaultSize.w} × {d.defaultSize.h}</span>
                    </span>
                  </button>
                ))}
              </div>
              {g.id === "mine" && (
                <div className="sx-mine">
                  {!g.items.length && <p className="sx-muted">Crée tes propres widgets en HTML, sans recompiler.</p>}
                  <div className="sx-row">
                    <button className="sx-btn" onClick={create}><Icon name="plus" /> Créer</button>
                    {isTauri && info.dir && (
                      <button className="sx-btn" onClick={() => bridge.runAction({ kind: "open", target: info.dir! })}><Icon name="folder" /> Dossier</button>
                    )}
                    <button className="sx-btn" onClick={() => (isTauri ? bridge.runAction({ kind: "open", target: GUIDE_URL }) : window.open(GUIDE_URL, "_blank", "noopener"))}>
                      <Icon name="link" /> Guide
                    </button>
                  </div>
                  {info.errors.map((e) => <p key={e.id} className="sx-error">{e.id} : {e.error}</p>)}
                  {note && <p className="sx-muted">{note}</p>}
                </div>
              )}
            </div>
          ) : null,
        )}
      </div>
    </aside>
  );
}

// ---------- Aperçu de l'Edge (glisser-déposer, sélection) ----------
const PAD_X = 32;
const PAD_Y = 40;
const GAP = 12;
const CELL_W = (2560 - PAD_X * 2 - GAP * (GRID.cols - 1)) / GRID.cols;
const CELL_H = (720 - PAD_Y * 2 - GAP * (GRID.rows - 1)) / GRID.rows;

function EdgePreview({
  page,
  selectedId,
  onSelect,
  onChange,
  onDropWidget,
}: {
  page: Page;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (w: WidgetInstance[]) => void;
  onDropWidget: (type: string, rect: Rect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [ghost, setGhost] = useState<(Rect & { ok: boolean }) | null>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const fit = () => setScale(el.clientWidth / 2560);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cellAt = (e: DragEvent, w: number, h: number): Rect => {
    const r = ref.current!.getBoundingClientRect();
    const cx = (e.clientX - r.left) / scale;
    const cy = (e.clientY - r.top) / scale;
    const col = Math.floor((cx - PAD_X + GAP / 2) / (CELL_W + GAP));
    const row = Math.floor((cy - PAD_Y + GAP / 2) / (CELL_H + GAP));
    return { x: Math.max(0, Math.min(GRID.cols - w, col)), y: Math.max(0, Math.min(GRID.rows - h, row)), w, h };
  };
  const draggedType = (e: DragEvent) => (e.dataTransfer.types.includes(DRAG_TYPE) ? true : false);

  return (
    <div
      className="sx-screen"
      ref={ref}
      onDragOver={(e) => {
        if (!draggedType(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        // Le type n'est lisible qu'au dépôt : l'ombre utilise une taille 4 × 2 indicative.
        const r = cellAt(e, 4, 2);
        setGhost({ ...r, ok: isFree(page, r) });
      }}
      onDragLeave={() => setGhost(null)}
      onDrop={(e) => {
        e.preventDefault();
        setGhost(null);
        const type = e.dataTransfer.getData(DRAG_TYPE);
        const def = widgetRegistry.get(type);
        if (def) onDropWidget(type, cellAt(e, def.defaultSize.w, def.defaultSize.h));
      }}
    >
      <div className="sx-canvas app" style={{ transform: `scale(${scale})`, "--inv": 1 / scale } as CSSProperties}>
        <Grid page={page} editing onChange={onChange} onOpenSettings={onSelect} onLongPressEmpty={() => {}} selectedId={selectedId} onSelect={onSelect} />
        {ghost && (
          <div
            className={`sx-ghost ${ghost.ok ? "" : "is-bad"}`}
            style={{ left: PAD_X + ghost.x * (CELL_W + GAP), top: PAD_Y + ghost.y * (CELL_H + GAP), width: ghost.w * CELL_W + (ghost.w - 1) * GAP, height: ghost.h * CELL_H + (ghost.h - 1) * GAP }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Miniatures des pages ----------
function PageThumb({ page, active, onClick }: { page: Page; active: boolean; onClick: () => void }) {
  const auto = page.auto && (page.auto.apps.length || page.auto.fullscreen);
  return (
    <button className={`sx-thumb ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className="sx-thumb-screen">
        {page.widgets.map((w) => (
          <span
            key={w.id}
            className="sx-thumb-w"
            style={{ "--c": categoryOf(w.type).color, left: `${(w.x / GRID.cols) * 100}%`, top: `${(w.y / GRID.rows) * 100}%`, width: `${(w.w / GRID.cols) * 100}%`, height: `${(w.h / GRID.rows) * 100}%` } as CSSProperties}
          />
        ))}
      </span>
      <span className="sx-thumb-name">
        {page.name}
        {auto && <Icon name={page.auto?.fullscreen ? "gamepad" : "zap"} className="sx-thumb-auto" />}
      </span>
    </button>
  );
}

// ---------- Règles d'affichage automatique ----------
function AutoRules({ page, onChange }: { page: Page; onChange: (auto: PageAuto) => void }) {
  const auto = page.auto ?? { apps: [], fullscreen: false };
  const [name, setName] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const add = (exe: string) => {
    const e = exe.trim().toLowerCase().replace(/\.exe$/, "");
    if (e && !auto.apps.includes(e)) onChange({ ...auto, apps: [...auto.apps, e] });
  };
  // Laisse 5 s pour basculer sur l'appli voulue, puis lit l'appli au premier plan.
  const capture = () => {
    let n = 5;
    setCount(n);
    const id = window.setInterval(async () => {
      n -= 1;
      setCount(n);
      if (n > 0) return;
      window.clearInterval(id);
      setCount(null);
      const fg = await bridge.foregroundApp().catch(() => null);
      if (fg?.exe) add(fg.exe);
    }, 1000);
  };
  return (
    <div className="sx-auto">
      <label className="sx-switch">
        <input type="checkbox" checked={auto.fullscreen} onChange={(e) => onChange({ ...auto, fullscreen: e.target.checked })} />
        <span className="sx-switch-ui" />
        <span>
          <b>Jeux et applis en plein écran</b>
          <small>La page s'affiche dès qu'une fenêtre occupe tout son écran.</small>
        </span>
      </label>
      <div className="sx-field-label">Ou quand ces applis sont au premier plan</div>
      <div className="sx-chips">
        {auto.apps.map((a) => (
          <span key={a} className="sx-chip">
            {a}
            <button onClick={() => onChange({ ...auto, apps: auto.apps.filter((x) => x !== a) })} aria-label={`Retirer ${a}`}><Icon name="close" /></button>
          </span>
        ))}
        {!auto.apps.length && <span className="sx-muted">Aucune appli</span>}
      </div>
      <div className="sx-row">
        <input
          className="sx-input"
          value={name}
          placeholder="Nom du programme (cs2, teams…)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              add(name);
              setName("");
            }
          }}
        />
        <button className="sx-btn" onClick={() => { add(name); setName(""); }} disabled={!name.trim()}>Ajouter</button>
      </div>
      {isTauri && (
        <button className="sx-btn sx-btn-wide" onClick={capture} disabled={count !== null}>
          <Icon name="zap" /> {count !== null ? `Bascule sur l'appli… ${count}` : "Capturer l'appli active"}
        </button>
      )}
    </div>
  );
}

// ---------- Studio ----------
export default function Studio() {
  const { config, setConfig, saveError } = useAppConfig();
  useRegistryVersion();
  const reloadUserWidgets = useUserWidgetsLoader();
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [menu, setMenu] = useState(false);
  const [appearance, setAppearance] = useState(false);

  useEffect(
    () =>
      subscribe((m) => {
        setSynced(true);
        if (m.type === "page") {
          setPageIndex(m.index);
          setSelected(null);
        }
      }),
    [],
  );
  useEffect(() => void (saveError && setNotice(saveError)), [saveError]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const pages = config?.pages ?? [];
  const index = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[index];

  const goTo = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(pages.length - 1, i));
      setPageIndex(n);
      setSelected(null);
      publish({ type: "page", index: n });
    },
    [pages.length],
  );

  const pageNames = pages.map((p) => p.name).join("\u0000");
  const pageApi = useMemo(() => ({ index, count: pages.length, names: pageNames.split("\u0000"), goTo }), [index, pages.length, pageNames, goTo]);
  const theme = useMemo(() => config?.theme ?? { accent: "#a9c4ff", background: "#07090c" }, [config?.theme]);

  // Suppr. retire le widget sélectionné, Échap désélectionne (hors champs de saisie).
  const selRef = useRef<{ selected: string | null; remove: () => void }>({ selected: null, remove: () => {} });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") setSelected(null);
      if ((e.key === "Delete" || e.key === "Backspace") && selRef.current.selected) selRef.current.remove();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (!config || !page) return <div className="boot">Edge Studio</div>;

  // Mises à jour fonctionnelles : plusieurs modifications rapprochées ne s'écrasent pas.
  const updatePages = (fn: (pages: Page[]) => Page[]) => setConfig((c) => (c ? { ...c, pages: fn(c.pages) } : c));
  const updatePage = (widgets: WidgetInstance[]) => updatePages((ps) => ps.map((p) => (p.id === page.id ? { ...p, widgets } : p)));

  const place = (type: string, preferred?: Rect, settings?: Record<string, unknown>) => {
    const def = widgetRegistry.get(type);
    if (!def) return;
    const pageId = page.id;
    const inst = createInstance(type, { x: 0, y: 0, ...def.defaultSize });
    if (settings) inst.settings = structuredClone(settings);
    let placed = false;
    updatePages((ps) =>
      ps.map((p) => {
        if (p.id !== pageId) return p;
        const spot =
          (preferred && isFree(p, preferred) ? preferred : null) ??
          findFreeSpot(p, def.defaultSize.w, def.defaultSize.h) ??
          (def.minSize ? findFreeSpot(p, def.minSize.w, def.minSize.h) : null) ??
          findFreeSpot(p, 1, 1);
        placed = !!spot;
        return spot ? { ...p, widgets: [...p.widgets, { ...inst, ...spot }] } : p;
      }),
    );
    window.setTimeout(() => (placed ? setSelected(inst.id) : setNotice("Plus de place sur cette page : réduis un widget ou ajoute une page.")), 0);
  };

  const addPage = (templateId: string) => {
    const n = pages.length;
    const t = PAGE_TEMPLATES.find((x) => x.id === templateId) ?? PAGE_TEMPLATES[0];
    const p = t.build();
    if (templateId === "empty") p.name = `Page ${n + 1}`;
    setMenu(false);
    updatePages((ps) => [...ps, p]);
    setPageIndex(n);
    setSelected(null);
    publish({ type: "page", index: n });
  };
  const movePage = (d: number) => {
    const j = index + d;
    if (j < 0 || j >= pages.length) return;
    updatePages((ps) => {
      const next = [...ps];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    goTo(j);
  };
  const deletePage = () => {
    if (pages.length <= 1) return;
    if (page.widgets.length && !window.confirm(`Supprimer la page « ${page.name} » et ses ${page.widgets.length} widgets ?`)) return;
    updatePages((ps) => ps.filter((p) => p.id !== page.id));
    goTo(Math.max(0, index - 1));
  };

  const sel = page.widgets.find((w) => w.id === selected);
  const selDef = sel ? widgetRegistry.get(sel.type) : undefined;
  const removeSel = () => {
    if (!sel) return;
    updatePage(page.widgets.filter((w) => w.id !== sel.id));
    setSelected(null);
  };
  selRef.current = { selected: sel ? sel.id : null, remove: removeSel };
  const autoOn = !!page.auto && (page.auto.apps.length > 0 || page.auto.fullscreen);

  return (
    <ThemeContext.Provider value={theme}>
      <PageContext.Provider value={pageApi}>
        <div className="sx" style={{ "--accent": theme.accent, "--bg": theme.background } as CSSProperties}>
          {/* ---------- Barre du haut ---------- */}
          <header className="sx-top">
            <div className="sx-brand">
              <span className="sx-logo"><span /></span>
              <span>
                <b>Edge Studio</b>
                <small>Corsair Xeneon Edge · 2560 × 720</small>
              </span>
            </div>
            <div className="sx-top-spacer" />
            <span className={`sx-status ${synced ? "is-on" : ""}`}>
              <span className="sx-status-dot" />
              {synced ? "Edge connecté" : "Enregistré automatiquement"}
            </span>
            <button className="sx-btn" onClick={() => setAppearance(true)}><Icon name="sliders" /> Apparence</button>
          </header>

          <Library onAdd={(t) => place(t)} onReload={() => void reloadUserWidgets(true)} />

          {/* ---------- Scène ---------- */}
          <main className="sx-stage">
            <div className="sx-stage-head">
              <input
                className="sx-title"
                value={page.name}
                aria-label="Nom de la page"
                onChange={(e) => updatePages((ps) => ps.map((p) => (p.id === page.id ? { ...p, name: e.target.value } : p)))}
              />
              <span className="sx-meta">{page.widgets.length} widget{page.widgets.length > 1 ? "s" : ""}</span>
              {autoOn && (
                <span className="sx-meta sx-meta-auto">
                  <Icon name={page.auto?.fullscreen ? "gamepad" : "zap"} /> Automatique
                </span>
              )}
            </div>

            <div className="sx-device">
              <div className="sx-bezel">
                <EdgePreview page={page} selectedId={selected} onSelect={setSelected} onChange={updatePage} onDropWidget={(t, r) => place(t, r)} />
              </div>
              <div className="sx-stand" />
            </div>

            <div className="sx-keys">
              <span><kbd>Glisser</kbd> déplacer</span>
              <span><kbd>Coin</kbd> redimensionner</span>
              <span><kbd>Clic</kbd> régler</span>
              <span><kbd>Suppr</kbd> retirer</span>
              <span><kbd>Échap</kbd> désélectionner</span>
            </div>

            <div className="sx-dock">
              <div className="sx-dock-title">Pages</div>
              <div className="sx-dock-row">
                {pages.map((p, i) => (
                  <PageThumb key={p.id} page={p} active={i === index} onClick={() => goTo(i)} />
                ))}
                <div className="sx-add-wrap">
                  <button className={`sx-thumb sx-thumb-add ${menu ? "is-active" : ""}`} onClick={() => setMenu(!menu)}>
                    <span className="sx-thumb-screen"><Icon name="plus" /></span>
                    <span className="sx-thumb-name">Nouvelle page</span>
                  </button>
                  {menu && (
                    <>
                      <div className="sx-pop-backdrop" onClick={() => setMenu(false)} />
                      <div className="sx-pop">
                        {PAGE_TEMPLATES.map((t) => (
                          <button key={t.id} className="sx-pop-item" onClick={() => addPage(t.id)}>
                            <span className="sx-tile" style={{ "--c": t.id === "game" ? "#f472b6" : t.id === "work" ? "#a78bfa" : "#7aa2ff", width: 38, height: 38, fontSize: 18 } as CSSProperties}>
                              <Icon name={t.icon} />
                            </span>
                            <span>
                              <b>{t.name}</b>
                              <small>{t.description}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </main>

          {/* ---------- Inspecteur ---------- */}
          <aside className="sx-inspector">
            {sel && selDef ? (
              <>
                <div className="sx-insp-head">
                  <Tile type={sel.type} size={48} />
                  <div className="sx-insp-title">
                    <b>{selDef.name}</b>
                    <small>
                      <span className="sx-dot" style={{ background: categoryOf(sel.type).color }} /> {categoryOf(sel.type).name}
                      {isUserWidget(sel.type) ? " · perso" : ""}
                    </small>
                  </div>
                  <button className="sx-icon-btn" onClick={() => setSelected(null)} aria-label="Fermer"><Icon name="close" /></button>
                </div>
                <div className="sx-row sx-insp-actions">
                  <button className="sx-btn" onClick={() => place(sel.type, undefined, sel.settings)}><Icon name="layers" /> Dupliquer</button>
                  <button className="sx-btn sx-btn-danger" onClick={removeSel}><Icon name="close" /> Retirer</button>
                </div>
                <Card title="Taille et position">
                  <SizeControls page={page} instance={sel} onLayout={updatePage} />
                </Card>
                <Card title="Réglages">
                  <SettingsForm key={sel.id} def={selDef} settings={sel.settings} onChange={(settings) => updatePage(page.widgets.map((w) => (w.id === sel.id ? { ...w, settings } : w)))} />
                </Card>
              </>
            ) : (
              <>
                <div className="sx-insp-head">
                  <span className="sx-tile" style={{ "--c": "#7aa2ff", width: 48, height: 48, fontSize: 22 } as CSSProperties}><Icon name="grid" /></span>
                  <div className="sx-insp-title">
                    <b>{page.name}</b>
                    <small>Page {index + 1} sur {pages.length}</small>
                  </div>
                </div>
                <Card title="Affichage automatique">
                  <AutoRules page={page} onChange={(auto) => updatePages((ps) => ps.map((p) => (p.id === page.id ? { ...p, auto } : p)))} />
                </Card>
                <Card title="Organisation">
                  <div className="sx-row">
                    <button className="sx-btn" onClick={() => movePage(-1)} disabled={index === 0}><Icon name="chevronLeft" /> Avant</button>
                    <button className="sx-btn" onClick={() => movePage(1)} disabled={index === pages.length - 1}>Après <Icon name="chevronRight" /></button>
                  </div>
                  <button className="sx-btn sx-btn-danger sx-btn-wide" onClick={deletePage} disabled={pages.length <= 1}><Icon name="close" /> Supprimer la page</button>
                </Card>
                <p className="sx-tip">Sélectionne un widget dans l'aperçu pour régler sa taille et ses options.</p>
              </>
            )}
          </aside>

          {appearance && (
            <Modal title="Apparence et écran" onClose={() => setAppearance(false)}>
              <AppearanceForm config={config} onChange={setConfig} />
            </Modal>
          )}
          {notice && <div className="sx-toast">{notice}</div>}
        </div>
      </PageContext.Provider>
    </ThemeContext.Provider>
  );
}
