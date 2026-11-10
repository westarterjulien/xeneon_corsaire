import { defineWidget } from "../../sdk/types";
import { findSensor, useGpu, useSensors, useSystemStats } from "../../sdk/hooks";
import { Kicker, RingGauge, Sparkline } from "../../sdk/components";
import "./system.css";

interface Settings {
  showGpu: boolean;
  useLhm: boolean;
  lhmUrl: string;
  showCores: boolean;
}

const isGpu = (p: string) => /nvidia|radeon|amd.*(rx|graphics)|intel.*arc|gpu/i.test(p.split(" / ")[0] ?? "");
const fmtGo = (b: number) => (b / 1024 ** 3).toFixed(1).replace(".", ",");

export default defineWidget<Settings>({
  type: "system",
  name: "Système",
  description: "CPU, GPU, RAM et températures en direct.",
  icon: "activity",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 2 },
  settings: [
    { key: "showGpu", label: "Afficher le GPU", type: "boolean", default: true, help: "Lu directement : charge, température et mémoire sur NVIDIA ; charge sur AMD / Intel." },
    { key: "useLhm", label: "Capteurs avancés (LibreHardwareMonitor)", type: "boolean", default: false, help: "Facultatif : ajoute la température du CPU (et du GPU AMD / Intel). LibreHardwareMonitor doit tourner avec Options → Remote Web Server activé." },
    { key: "lhmUrl", label: "Adresse LibreHardwareMonitor", type: "text", default: "http://localhost:8085/data.json" },
    { key: "showCores", label: "Charge par cœur", type: "boolean", default: false },
  ],
  component: ({ settings, size }) => {
    const { value: s, history } = useSystemStats();
    const sensors = useSensors(settings.useLhm ? settings.lhmUrl : "");
    const { value: gpu } = useGpu();
    const list = settings.useLhm ? sensors.value : undefined;
    // Priorité aux capteurs LibreHardwareMonitor s'ils sont activés et joignables, sinon lecture directe.
    const gpuLoad = findSensor(list, (x) => isGpu(x.path) && /\/ Load \//.test(x.path) && /GPU Core/i.test(x.name)) ?? gpu?.load ?? null;
    const gpuTemp = findSensor(list, (x) => isGpu(x.path) && x.unit === "°C" && /GPU Core|GPU Temperature|Edge/i.test(x.name)) ?? gpu?.temp ?? null;
    const cpuTemp = findSensor(list, (x) => !isGpu(x.path) && x.unit === "°C" && /Tctl|Package|CPU|Core \(/i.test(x.name));
    const vram = gpu?.vramUsed != null && gpu.vramTotal ? `${fmtGo(gpu.vramUsed)} / ${Math.round(gpu.vramTotal / 1024 ** 3)} Go` : null;
    const mem = s ? (s.memUsed / s.memTotal) * 100 : null;
    const cpuHist = history.map((h) => h.cpu);
    const avg = cpuHist.length ? Math.round(cpuHist.reduce((a, b) => a + b, 0) / cpuHist.length) : null;
    const temp = (t: number | null) => (t == null ? " " : `${Math.round(t)} °C`);

    return (
      <div className="sys">
        <Kicker>Système</Kicker>
        <div className="sys-rings">
          <RingGauge value={s?.cpu ?? null} label="CPU" sub={temp(cpuTemp)} />
          {settings.showGpu && <RingGauge value={gpuLoad} label="GPU" sub={gpuTemp != null ? temp(gpuTemp) : vram ?? " "} />}
          <RingGauge value={mem} label="RAM" sub={s ? `${fmtGo(s.memUsed)} / ${Math.round(s.memTotal / 1024 ** 3)} Go` : " "} />
        </div>
        {size.h >= 3 && (
          <div className="sys-spark">
            <div className="sys-spark-l">
              <span>CPU · 60 s</span>
              {avg != null && <span>moy. {avg} %</span>}
            </div>
            <Sparkline values={cpuHist} height="min(17cqh, 120px)" />
          </div>
        )}
        {settings.showCores && size.h >= 4 && s && (
          <div className="sys-cores">
            {s.cpuPerCore.map((c, i) => <i key={i} style={{ height: `${Math.max(4, c)}%` }} />)}
          </div>
        )}
      </div>
    );
  },
});
