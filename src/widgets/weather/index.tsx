import { defineWidget } from "../../sdk/types";
import { useFetchJson } from "../../sdk/hooks";
import { Icon } from "../../sdk/icons";
import { CitySearch } from "./CitySearch";
import "./weather.css";

interface Settings {
  city: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteo {
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] };
}

/** Codes WMO → icône + libellé. */
function describe(code: number, day = true): [string, string] {
  if (code === 0) return [day ? "sun" : "moon", "Ciel dégagé"];
  if (code <= 2) return [day ? "partly" : "cloud", "Peu nuageux"];
  if (code === 3) return ["cloud", "Couvert"];
  if (code <= 48) return ["fog", "Brouillard"];
  if (code <= 57) return ["rain", "Bruine"];
  if (code <= 65) return ["rain", code <= 61 ? "Pluie faible" : "Pluie"];
  if (code <= 67) return ["rain", "Pluie verglaçante"];
  if (code <= 77) return ["snow", "Neige"];
  if (code <= 82) return ["rain", "Averses"];
  if (code <= 86) return ["snow", "Averses de neige"];
  return ["storm", "Orage"];
}

export default defineWidget<Settings>({
  type: "weather",
  name: "Météo",
  description: "Conditions actuelles et prochaines heures (Open-Meteo, sans clé).",
  icon: "partly",
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 2, h: 1 },
  settings: [
    { key: "city", label: "Ville", type: "custom", default: "Paris", editor: CitySearch },
    { key: "latitude", label: "Latitude", type: "number", default: 48.8566, step: 0.0001, help: "Remplie par la recherche de ville." },
    { key: "longitude", label: "Longitude", type: "number", default: 2.3522, step: 0.0001 },
  ],
  component: ({ settings, size }) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${settings.latitude}&longitude=${settings.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&hourly=temperature_2m,weather_code&forecast_hours=12&timezone=auto`;
    const { value: data, error } = useFetchJson<OpenMeteo>(url, 15 * 60_000);
    if (!data) return <div className="wx wx-empty">{error ? "Météo indisponible" : ""}</div>;
    const c = data.current;
    const [icon, label] = describe(c.weather_code, c.is_day === 1);
    const hours = Math.max(0, Math.min(6, size.w + 1));
    return (
      <div className="wx">
        <div className="wx-now">
          <Icon name={icon} className="wx-icon" />
          <div className="wx-temp">{Math.round(c.temperature_2m)}°</div>
          <div className="wx-label">
            {label}
            <br />
            ressenti {Math.round(c.apparent_temperature)}° · vent {Math.round(c.wind_speed_10m)} km/h
          </div>
        </div>
        <div className="wx-hours">
          {data.hourly.time.slice(1, hours + 1).map((t, i) => (
            <div key={t} className="wx-hour">
              {Number(t.slice(11, 13))}h<b>{Math.round(data.hourly.temperature_2m[i + 1])}°</b>
            </div>
          ))}
        </div>
      </div>
    );
  },
});
