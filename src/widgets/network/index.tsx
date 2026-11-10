import { bridge, type NetStats } from "../../bridge";
import { Kicker, Sparkline } from "../../sdk/components";
import { useFetchJson, useShared } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { defineWidget } from "../../sdk/types";
import "./network.css";

interface Settings {
  host: string;
  showIp: boolean;
}

/** Octets/s → débit lisible en bits/s (comme les box Internet). */
function rate(bytes: number): [string, string] {
  const bits = bytes * 8;
  if (bits >= 1e9) return [(bits / 1e9).toFixed(2).replace(".", ","), "Gb/s"];
  if (bits >= 1e6) return [(bits / 1e6).toFixed(bits >= 1e8 ? 0 : 1).replace(".", ","), "Mb/s"];
  return [Math.round(bits / 1e3).toString(), "kb/s"];
}

export default defineWidget<Settings>({
  type: "network",
  name: "Réseau",
  description: "Débit descendant / montant en direct, ping, adresses IP.",
  icon: "wifi",
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 3, h: 1 },
  settings: [
    { key: "host", label: "Ping vers", type: "text", default: "1.1.1.1", help: "Une adresse ou un nom (ex. 1.1.1.1, google.com, serveur de jeu)." },
    { key: "showIp", label: "Afficher les adresses IP", type: "boolean", default: true },
  ],
  component: ({ settings, size }) => {
    const { value: net, history } = useShared<NetStats>("net", bridge.networkStats, 1000, 60);
    const host = settings.host?.trim() || "1.1.1.1";
    const { value: ping, error: pingError } = useShared<number>(`ping:${host}`, () => bridge.ping(host), 5000);
    const { value: pub } = useFetchJson<{ ip: string }>(settings.showIp ? "https://api.ipify.org?format=json" : null, 30 * 60_000);
    const [down, downU] = rate(net?.down ?? 0);
    const [up, upU] = rate(net?.up ?? 0);
    const max = Math.max(1, ...history.map((h) => h.down));
    return (
      <div className="net">
        {size.h > 1 && <Kicker>Réseau</Kicker>}
        <div className="net-rates">
          <div className="net-rate">
            <Icon name="down" className="net-arrow" />
            <span className="net-val">{down}</span>
            <span className="net-unit">{downU}</span>
          </div>
          <div className="net-rate is-up">
            <Icon name="up" className="net-arrow" />
            <span className="net-val">{up}</span>
            <span className="net-unit">{upU}</span>
          </div>
          <div className="net-rate net-ping">
            <span className="net-val">{ping ?? (pingError ? "—" : "…")}</span>
            <span className="net-unit">ms · {host}</span>
          </div>
        </div>
        {size.h > 1 && <Sparkline values={history.map((h) => h.down)} max={max} height="min(16cqh, 70px)" />}
        {settings.showIp && size.h > 1 && (
          <div className="net-ips">
            {net?.localIp && <span>Local {net.localIp}</span>}
            {pub?.ip && <span>Public {pub.ip}</span>}
          </div>
        )}
      </div>
    );
  },
});
