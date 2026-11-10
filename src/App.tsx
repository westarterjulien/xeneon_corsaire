import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { bridge, isTauri } from "./bridge";
import { Grid } from "./core/Grid";
import { createInstance, findFreeSpot, uid, type WidgetInstance } from "./core/layout";
import { useAppConfig } from "./core/store";
import { publish, subscribe } from "./core/sync";
import { AppSettings, Palette, WidgetSettings } from "./core/Panels";
import { Icon } from "./sdk/icons";
import { useRegistryVersion, widgetRegistry } from "./sdk/registry";
import { ThemeContext } from "./sdk/theme";
import { useUserWidgetsLoader } from "./core/userWidgets";
import { PageContext } from "./sdk/page";

type Panel = { kind: "palette" } | { kind: "widget"; id: string } | { kind: "app" } | null;

export default function App() {
  const { config, setConfig, saveError } = useAppConfig();
  const [pageIndex, setPageIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useRegistryVersion();
  const reloadUserWidgets = useUserWidgetsLoader();

  useEffect(() => void (saveError && setNotice(saveError)), [saveError]);
  // Le Studio peut afficher une page sur l'Edge.
  useEffect(() => subscribe((m) => m.type === "page" && setPageIndex(m.index)), []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const pages = config?.pages ?? [];
  const page = pages[Math.min(pageIndex, pages.length - 1)];

  const goTo = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(pages.length - 1, i));
      setPageIndex(n);
      publish({ type: "page", index: n });
    },
    [pages.length],
  );

  const openStudio = () => {
    if (isTauri) void bridge.openStudio().catch((e) => setNotice(`Studio : ${e}`));
    else window.open(new URL("studio.html", document.baseURI).href, "_blank");
  };

  // Balayage horizontal pour changer de page (hors mode édition).
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
    if (!editing) swipe.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e: RPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 140 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - s.t < 800) goTo(pageIndex + (dx < 0 ? 1 : -1));
  };

  const updatePage = (widgets: WidgetInstance[]) => {
    if (!config || !page) return;
    setConfig({ ...config, pages: config.pages.map((p) => (p.id === page.id ? { ...p, widgets } : p)) });
  };

  const addWidget = (type: string) => {
    if (!config || !page) return;
    const def = widgetRegistry.get(type)!;
    const spot = findFreeSpot(page, def.defaultSize.w, def.defaultSize.h) ?? (def.minSize && findFreeSpot(page, def.minSize.w, def.minSize.h));
    if (!spot) {
      setNotice("Plus de place sur cette page : libère de l'espace ou ajoute une page.");
      return;
    }
    updatePage([...page.widgets, createInstance(type, spot)]);
    setPanel(null);
  };

  const addPage = () => {
    if (!config) return;
    const next = { ...config, pages: [...config.pages, { id: uid(), name: `Page ${config.pages.length + 1}`, widgets: [] }] };
    setConfig(next);
    setPageIndex(next.pages.length - 1);
  };

  const deletePage = () => {
    if (!config || config.pages.length <= 1 || !page) return;
    if (page.widgets.length && !window.confirm(`Supprimer la page « ${page.name} » et ses ${page.widgets.length} widgets ?`)) return;
    setConfig({ ...config, pages: config.pages.filter((p) => p.id !== page.id) });
    setPageIndex((i) => Math.max(0, i - 1));
  };

  const renamePage = () => {
    if (!config || !page) return;
    const name = window.prompt("Nom de la page", page.name);
    if (name?.trim()) setConfig({ ...config, pages: config.pages.map((p) => (p.id === page.id ? { ...p, name: name.trim() } : p)) });
  };

  const style = useMemo(
    () => (config ? ({ "--accent": config.theme.accent, "--bg": config.theme.background } as CSSProperties) : undefined),
    [config?.theme.accent, config?.theme.background],
  );

  const pageNames = pages.map((p) => p.name).join("\u0000");
  const pageApi = useMemo(() => ({ index: pageIndex, count: pages.length, names: pageNames.split("\u0000"), goTo }), [pageIndex, pages.length, pageNames, goTo]);
  const theme = useMemo(() => config?.theme ?? { accent: "#a9c4ff", background: "#07090c" }, [config?.theme]);

  if (!config || !page) return <div className="boot">Edge Studio</div>;

  const editedWidget = panel?.kind === "widget" ? page.widgets.find((w) => w.id === panel.id) : undefined;

  return (
    <ThemeContext.Provider value={theme}>
    <PageContext.Provider value={pageApi}>
      <div className="app" style={style} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className="pages" style={{ transform: `translateX(-${pageIndex * 100}%)` }}>
          {config.pages.map((p, i) => (
            <div className="page" key={p.id} aria-hidden={i !== pageIndex}>
              {Math.abs(i - pageIndex) <= 1 && (
                <Grid
                  page={p}
                  editing={editing && i === pageIndex}
                  onChange={updatePage}
                  onOpenSettings={(id) => setPanel({ kind: "widget", id })}
                  onLongPressEmpty={() => setEditing(true)}
                />
              )}
            </div>
          ))}
        </div>

        {pages.length > 1 && (
          <div className="dots">
            {pages.map((p, i) => (
              <button key={p.id} className={`dot ${i === pageIndex ? "is-active" : ""}`} onClick={() => goTo(i)} aria-label={p.name} />
            ))}
          </div>
        )}

        {editing ? (
          <div className="toolbar">
            <button className="tb-btn" onClick={() => goTo(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Page précédente"><Icon name="chevronLeft" /></button>
            <button className="tb-btn tb-name" onClick={renamePage}>{page.name}</button>
            <button className="tb-btn" onClick={() => goTo(pageIndex + 1)} disabled={pageIndex === pages.length - 1} aria-label="Page suivante"><Icon name="chevronRight" /></button>
            <span className="tb-sep" />
            <button className="tb-btn" onClick={() => setPanel({ kind: "palette" })}><Icon name="plus" /> Widget</button>
            <button className="tb-btn" onClick={addPage}><Icon name="plus" /> Page</button>
            <button className="tb-btn" onClick={deletePage} disabled={pages.length <= 1}>Supprimer la page</button>
            <button className="tb-btn" onClick={() => setPanel({ kind: "app" })}>Réglages</button>
            <button className="tb-btn" onClick={openStudio}><Icon name="layers" /> Studio</button>
            <span className="tb-sep" />
            <button className="tb-btn tb-primary" onClick={() => setEditing(false)}>Terminé</button>
          </div>
        ) : (
          <button className="edit-fab" onClick={() => setEditing(true)} aria-label="Modifier la disposition"><Icon name="edit" /></button>
        )}

        {panel?.kind === "palette" && <Palette onPick={addWidget} onClose={() => setPanel(null)} onReload={() => void reloadUserWidgets(true)} />}
        {editedWidget && (
          <WidgetSettings
            instance={editedWidget}
            onClose={() => setPanel(null)}
            onChange={(settings) => updatePage(page.widgets.map((w) => (w.id === editedWidget.id ? { ...w, settings } : w)))}
          />
        )}
        {panel?.kind === "app" && <AppSettings config={config} onChange={setConfig} onClose={() => setPanel(null)} />}
        {notice && <div className="toast">{notice}</div>}
      </div>
    </PageContext.Provider>
    </ThemeContext.Provider>
  );
}
