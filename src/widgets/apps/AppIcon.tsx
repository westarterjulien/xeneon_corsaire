import { bridge, type InstalledApp } from "../../bridge";
import { useShared } from "../../sdk/hooks";

/** Vraie icône Windows de l'appli (mise en cache), ou initiale dans un cercle. */
export function AppIcon({ app, size }: { app: InstalledApp; size: number | string }) {
  const { value: icon } = useShared<string | null>(`app-icon:${app.id}`, () => bridge.appIcon(app.id), 86_400_000);
  const s = typeof size === "number" ? `${size}px` : size;
  if (icon) return <img className="app-icon" src={icon} alt="" style={{ width: s, height: s }} draggable={false} />;
  return (
    <span className="app-icon app-icon-letter" style={{ width: s, height: s, fontSize: `calc(${s} * .42)` }}>
      {app.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
