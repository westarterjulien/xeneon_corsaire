import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Grid } from "../core/Grid";
import { createInstance, findFreeSpot, type Page, type PageAuto, type WidgetInstance } from "../core/layout";
import { PAGE_TEMPLATES } from "../core/templates";
import { bridge, isTauri } from "../bridge";
import { AppearanceForm, SettingsForm, SizeControls, WidgetLibrary } from "../core/Panels";
import { useAppConfig } from "../core/store";
import { publish, subscribe } from "../core/sync";
import { useUserWidgetsLoader } from "../core/userWidgets";
import { Icon } from "../sdk/icons";
import { PageContext } from "../sdk/page";
import { isUserWidget, useRegistryVersion, widgetRegistry } from "../sdk/registry";
import { ThemeContext } from "../sdk/theme";

/** Règles d'affichage automatique d'une page selon l'appli au premier plan. */
function AutoRules({ page, onChange }: { page: Page; onChange: (auto: PageAuto) => void }) {
  const auto = page.auto ?? { apps: [], fullscreen: false };
  const [name, setName] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const add = (exe: string) => {
    const e = exe.trim().toLowerCase().replace(/\.exe$/, "");
    if (e && !auto.apps.includes(e)) onChange({ ...auto, apps: [...auto.apps, e] });
  };
  // Capture : laisse 5 s pour basculer sur l'appli voulue, puis lit l'appli au premier plan.
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
    <div className="st-auto">
      <span className="st-auto-label">Afficher automatiquement quand</span>
      {auto.apps.map((a) => (
        <span key={a} className="st-auto-chip">
          {a}
          <button onClick={() => onChange({ ...auto, apps: auto.apps.filter((x) => x !== a) })} aria-label={`Retirer ${a}`}><Icon name="close" /></button>
        </span>
      ))}
      <input
        className="st-auto-input"
        value={name}
        placeholder="nom du programme (ex. cs2, teams)"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            add(name);
            setName("");
          }
        }}
      />
      {isTauri && (
        <button className="st-btn" onClick={capture} disabled={count !== null}>
          {count !== null ? `Bascule sur l'appli… ${count}` : "Capturer l'appli active"}
        </button>
      )}
      <label className="st-auto-check">
        <input type="checkbox" checked={auto.fullscreen} onChange={(e) => onChange({ ...auto, fullscreen: e.target.checked })} />
        une appli est en plein écran (jeux)
      </label>
    </div>
  );
}

/** Aperçu de l'Edge à l'échelle, éditable à la souris. */
function EdgePreview({ page, selectedId, onSelect, onChange, onOpenSettings }: { page: Page; selectedId: string | null; onSelect: (id: string | null) => void; onChange: (w: WidgetInstance[]) => void; onOpenSettings: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = ref.current!;
    const fit = () => setScale(el.clientWidth / 2560);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="st-screen" ref={ref}>
      <div className="st-canvas app" style={{ transform: `scale(${scale})`, "--inv": 1 / scale } as CSSProperties}>
        <Grid page={page} editing onChange={onChange} onOpenSettings={onOpenSettings} onLongPressEmpty={() => {}} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  );
}

export default function Studio() {
  const { config, setConfig, saveError } = useAppConfig();
  useRegistryVersion();
  const reloadUserWidgets = useUserWidgetsLoader();
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [menu, setMenu] = useState(false);

  // Suit la page affichée sur l'Edge.
  useEffect(() => subscribe((m) => {
    setSynced(true);
    if (m.type === "page") {
      setPageIndex(m.index);
      setSelected(null);
    }
  }), []);
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

  if (!config || !page) return <div className="boot">Edge Studio</div>;

  // Mises à jour fonctionnelles : plusieurs modifications rapprochées ne s'écrasent pas.
  const updatePages = (fn: (pages: Page[]) => Page[]) => setConfig((c) => (c ? { ...c, pages: fn(c.pages) } : c));
  const updatePage = (widgets: WidgetInstance[]) => updatePages((ps) => ps.map((p) => (p.id === page.id ? { ...p, widgets } : p)));

  const addWidget = (type: string, settings?: Record<string, unknown>) => {
    const def = widgetRegistry.get(type);
    if (!def) return;
    const pageId = page.id;
    // Instance créée une seule fois (identifiant stable) ; seule sa place est calculée dans la mise à jour.
    const inst = createInstance(type, { x: 0, y: 0, ...def.defaultSize });
    if (settings) inst.settings = structuredClone(settings);
    let placed = false;
    updatePages((ps) =>
      ps.map((p) => {
        if (p.id !== pageId) return p;
        const spot = findFreeSpot(p, def.defaultSize.w, def.defaultSize.h) ?? (def.minSize ? findFreeSpot(p, def.minSize.w, def.minSize.h) : null) ?? findFreeSpot(p, 1, 1);
        placed = !!spot;
        return spot ? { ...p, widgets: [...p.widgets, { ...inst, ...spot }] } : p;
      }),
    );
    window.setTimeout(() => (placed ? setSelected(inst.id) : setNotice("Plus de place sur cette page : réduis un widget ou ajoute une page.")), 0);
  };

  const addPage = (templateId = "empty") => {
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

  return (
    <ThemeContext.Provider value={theme}>
      <PageContext.Provider value={pageApi}>
        <div className="studio" style={{ "--accent": theme.accent, "--bg": theme.background } as CSSProperties}>
          <header className="st-top">
            <div className="st-brand">
              <span className="st-logo" />
              Edge Studio
            </div>
            <nav className="st-tabs" aria-label="Pages">
              {pages.map((p, i) => (
                <button key={p.id} className={`st-tab ${i === index ? "is-active" : ""}`} onClick={() => goTo(i)}>{p.name}</button>
              ))}
              <button className="st-tab st-tab-add" onClick={() => setMenu(!menu)} aria-label="Ajouter une page"><Icon name="plus" /></button>
            </nav>
            <div className="st-status" title="Les modifications sont enregistrées et appliquées à l'Edge en direct.">
              <span className={`st-dot ${synced ? "is-on" : ""}`} />
              {synced ? "Edge connecté" : "Enregistrement automatique"}
            </div>
          </header>

          {menu && (
            <div className="st-menu-backdrop" onClick={() => setMenu(false)}>
              <div className="st-menu" onClick={(e) => e.stopPropagation()}>
                <div className="kicker">Nouvelle page</div>
                {PAGE_TEMPLATES.map((t) => (
                  <button key={t.id} className="st-menu-item" onClick={() => addPage(t.id)}>
                    <span className="st-panel-icon"><Icon name={t.icon} /></span>
                    <span>
                      <span className="st-menu-name">{t.name}</span>
                      <span className="st-menu-desc">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <aside className="st-left">
            <div className="kicker">Bibliothèque</div>
            <p className="st-help">Clique sur un widget pour l'ajouter à la page.</p>
            <WidgetLibrary compact onPick={(t) => addWidget(t)} onReload={() => void reloadUserWidgets(true)} />
          </aside>

          <main className="st-center">
            <div className="st-pagebar">
              <input
                className="st-pagename"
                value={page.name}
                aria-label="Nom de la page"
                onChange={(e) => updatePages((ps) => ps.map((p) => (p.id === page.id ? { ...p, name: e.target.value } : p)))}
              />
              <span className="st-pagecount">{page.widgets.length} widget{page.widgets.length > 1 ? "s" : ""}</span>
              <span className="st-spacer" />
              <button className="st-btn" onClick={() => movePage(-1)} disabled={index === 0}><Icon name="chevronLeft" /> Avancer</button>
              <button className="st-btn" onClick={() => movePage(1)} disabled={index === pages.length - 1}>Reculer <Icon name="chevronRight" /></button>
              <button className="st-btn danger" onClick={deletePage} disabled={pages.length <= 1}><Icon name="close" /> Supprimer la page</button>
            </div>
            <AutoRules page={page} onChange={(auto) => updatePages((ps) => ps.map((p) => (p.id === page.id ? { ...p, auto } : p)))} />
            <EdgePreview page={page} selectedId={selected} onSelect={setSelected} onChange={updatePage} onOpenSettings={setSelected} />
            <p className="st-hint">Glisse un widget pour le déplacer, tire son coin pour le redimensionner, clique pour le régler. Tout est appliqué à l'Edge en direct.</p>
          </main>

          <aside className="st-right">
            {sel && selDef ? (
              <>
                <div className="st-panel-head">
                  <span className="st-panel-icon"><Icon name={selDef.icon} /></span>
                  <div className="st-panel-title">
                    <div>{selDef.name}</div>
                    <div className="st-panel-sub">{isUserWidget(sel.type) ? "Widget perso" : "Widget intégré"} · {sel.w}×{sel.h}</div>
                  </div>
                </div>
                <div className="st-panel-actions">
                  <button className="st-btn" onClick={() => addWidget(sel.type, sel.settings)}><Icon name="layers" /> Dupliquer</button>
                  <button className="st-btn danger" onClick={() => { updatePage(page.widgets.filter((w) => w.id !== sel.id)); setSelected(null); }}><Icon name="close" /> Retirer</button>
                  <button className="st-btn" onClick={() => setSelected(null)}>Fermer</button>
                </div>
                <div className="kicker st-section">Taille et position</div>
                <SizeControls page={page} instance={sel} onLayout={updatePage} />
                <div className="kicker st-section">Réglages</div>
                <SettingsForm
                  key={sel.id}
                  def={selDef}
                  settings={sel.settings}
                  onChange={(settings) => updatePage(page.widgets.map((w) => (w.id === sel.id ? { ...w, settings } : w)))}
                />
              </>
            ) : (
              <>
                <div className="kicker">Apparence</div>
                <p className="st-help">Sélectionne un widget dans l'aperçu pour le régler.</p>
                <AppearanceForm config={config} onChange={setConfig} />
              </>
            )}
          </aside>
          {notice && <div className="toast">{notice}</div>}
        </div>
      </PageContext.Provider>
    </ThemeContext.Provider>
  );
}
