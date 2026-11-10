import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Icon } from "../sdk/icons";
import { widgetRegistry } from "../sdk/registry";
import { GRID, isFree, type Page, type Rect, type WidgetInstance } from "./layout";

interface Props {
  page: Page;
  editing: boolean;
  onChange: (widgets: WidgetInstance[]) => void;
  onOpenSettings: (id: string) => void;
  onLongPressEmpty: () => void;
  /** Studio : widget sélectionné et sélection au clic. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

interface DragState {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origin: Rect;
  preview: Rect;
  valid: boolean;
}

export function Grid({ page, editing, onChange, onOpenSettings, onLongPressEmpty, selectedId, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const longPress = useRef<number>();

  const cellSize = () => {
    const el = ref.current!;
    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap) || 0;
    const r = el.getBoundingClientRect();
    // La grille peut être affichée réduite (aperçu du Studio) : on ramène tout à l'échelle de l'écran.
    const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const padX = (parseFloat(style.paddingLeft) || 0) * scale;
    const padY = (parseFloat(style.paddingTop) || 0) * scale;
    const rowGap = (parseFloat(style.rowGap) || 0) * scale;
    const colGap = gap * scale;
    return {
      cw: (r.width - padX * 2 - colGap * (GRID.cols - 1)) / GRID.cols + colGap,
      ch: (r.height - padY * 2 - rowGap * (GRID.rows - 1)) / GRID.rows + rowGap,
    };
  };

  const startDrag = (e: RPointerEvent, w: WidgetInstance, mode: DragState["mode"]) => {
    if (!editing) return;
    e.stopPropagation();
    onSelect?.(w.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const origin = { x: w.x, y: w.y, w: w.w, h: w.h };
    setDrag({ id: w.id, mode, startX: e.clientX, startY: e.clientY, origin, preview: origin, valid: true });
  };

  const moveDrag = (e: RPointerEvent) => {
    if (!drag) return;
    const { cw, ch } = cellSize();
    const dx = Math.round((e.clientX - drag.startX) / cw);
    const dy = Math.round((e.clientY - drag.startY) / ch);
    const o = drag.origin;
    const inst = page.widgets.find((w) => w.id === drag.id)!;
    const def = widgetRegistry.get(inst.type);
    const min = def?.minSize ?? { w: 1, h: 1 };
    const max = def?.maxSize ?? { w: GRID.cols, h: GRID.rows };
    const preview =
      drag.mode === "move"
        ? { ...o, x: Math.max(0, Math.min(GRID.cols - o.w, o.x + dx)), y: Math.max(0, Math.min(GRID.rows - o.h, o.y + dy)) }
        : {
            ...o,
            w: Math.max(min.w, Math.min(max.w, GRID.cols - o.x, o.w + dx)),
            h: Math.max(min.h, Math.min(max.h, GRID.rows - o.y, o.h + dy)),
          };
    if (preview.x !== drag.preview.x || preview.y !== drag.preview.y || preview.w !== drag.preview.w || preview.h !== drag.preview.h)
      setDrag({ ...drag, preview, valid: isFree(page, preview, drag.id) });
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.valid) onChange(page.widgets.map((w) => (w.id === drag.id ? { ...w, ...drag.preview } : w)));
    setDrag(null);
  };

  const remove = (id: string) => onChange(page.widgets.filter((w) => w.id !== id));

  // Appui long sur une zone vide → mode édition.
  const onGridPointerDown = (e: RPointerEvent) => {
    if (e.target !== ref.current) return;
    if (editing) {
      onSelect?.(null);
      return;
    }
    longPress.current = window.setTimeout(onLongPressEmpty, 600);
  };
  const cancelLongPress = () => window.clearTimeout(longPress.current);

  return (
    <div
      ref={ref}
      className={`grid ${editing ? "is-editing" : ""}`}
      style={{ gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`, gridTemplateRows: `repeat(${GRID.rows}, 1fr)` }}
      onPointerDown={onGridPointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerMove={(e) => (drag ? moveDrag(e) : cancelLongPress())}
    >
      {editing &&
        Array.from({ length: GRID.cols * GRID.rows }, (_, i) => (
          <div key={`c${i}`} className="grid-cell" style={{ gridColumn: (i % GRID.cols) + 1, gridRow: Math.floor(i / GRID.cols) + 1 }} />
        ))}

      {page.widgets.map((w) => {
        const def = widgetRegistry.get(w.type);
        const isDragged = drag?.id === w.id;
        const r = isDragged ? drag.preview : w;
        const Comp = def?.component;
        return (
          <div
            key={w.id}
            className={`widget ${r.x > 0 ? "has-left" : ""} ${selectedId === w.id ? "is-selected" : ""} ${isDragged ? "is-dragging" : ""} ${isDragged && !drag.valid ? "is-invalid" : ""}`}
            style={{ gridColumn: `${r.x + 1} / span ${r.w}`, gridRow: `${r.y + 1} / span ${r.h}` }}
          >
            <div className="widget-inner">
              {Comp ? (
                <Comp
                  id={w.id}
                  settings={w.settings}
                  size={{ w: r.w, h: r.h }}
                  editing={editing}
                  updateSettings={(patch) => onChange(page.widgets.map((x) => (x.id === w.id ? { ...x, settings: { ...x.settings, ...patch } } : x)))}
                />
              ) : (
                <div className="widget-missing">Widget inconnu : {w.type}</div>
              )}
            </div>
            {editing && (
              <div
                className="widget-edit"
                onPointerDown={(e) => startDrag(e, w, "move")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <div className="widget-edit-name">
                  {def?.name ?? w.type}
                </div>
                <div className="widget-edit-actions" onPointerDown={(e) => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => onOpenSettings(w.id)} aria-label="Réglages"><Icon name="settings" /></button>
                  <button className="icon-btn danger" onClick={() => remove(w.id)} aria-label="Supprimer"><Icon name="close" /></button>
                </div>
                <div
                  className="widget-resize"
                  onPointerDown={(e) => startDrag(e, w, "resize")}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  aria-label="Redimensionner"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
