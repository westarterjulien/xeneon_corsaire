import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Grid } from "../core/Grid";
import { createInstance, findFreeSpot, uid, type Page, type WidgetInstance } from "../core/layout";
import { AppearanceForm, SettingsForm, SizeControls, WidgetLibrary } from "../core/Panels";
import { useAppConfig } from "../core/store";
import { publish, subscribe } from "../core/sync";
import { useUserWidgetsLoader } from "../core/userWidgets";
import { Icon } from "../sdk/icons";
import { PageContext } from "../sdk/page";
import { isUserWidget, useRegistryVersion, widgetRegistry } from "../sdk/registry";
import { ThemeContext } from "../sdk/theme";

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

  const updatePages = (fn: (pages: Page[]) => Page[]) => setConfig({ ...config, pages: fn(config.pages) });
  const updatePage = (widgets: WidgetInstance[]) => updatePages((ps) => ps.map((p) => (p.id === page.id ? { ...p, widgets } : p)));

  const addWidget = (type: string, settings?: Record<string, unknown>) => {
    const def = widgetRegistry.get(type);
    if (!def) return;
    const spot = findFreeSpot(page, def.defaultSize.w, def.defaultSize.h) ?? (def.minSize ? findFreeSpot(page, def.minSize.w, def.minSize.h) : null) ?? findFreeSpot(page, 1, 1);
    if (!spot) {
      setNotice("Plus de place sur cette page : réduis un widget ou ajoute une page.");
      return;
    }
    const inst = createInstance(type, spot);
    if (settings) inst.settings = structuredClone(settings);
    updatePage([...page.widgets, inst]);
    setSelected(inst.id);
  };

  const addPage = () => {
    const n = pages.length;
    updatePages((ps) => [...ps, { id: uid(), name: `Page ${ps.length + 1}`, widgets: [] }]);
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
              <button className="st-tab st-tab-add" onClick={addPage} aria-label="Ajouter une page"><Icon name="plus" /></button>
            </nav>
            <div className="st-status" title="Les modifications sont enregistrées et appliquées à l'Edge en direct.">
              <span className={`st-dot ${synced ? "is-on" : ""}`} />
              {synced ? "Edge connecté" : "Enregistrement automatique"}
            </div>
          </header>

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
