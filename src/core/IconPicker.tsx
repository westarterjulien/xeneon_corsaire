import { Icon, iconNames } from "../sdk/icons";

export function IconPicker({ value, onChange }: { value: string | undefined; onChange: (name: string) => void }) {
  return (
    <div className="icon-picker" role="listbox" aria-label="Icône">
      {iconNames.map((n) => (
        <button key={n} type="button" role="option" aria-selected={value === n} className={`icon-pick ${value === n ? "is-active" : ""}`} onClick={() => onChange(n)} title={n}>
          <Icon name={n} />
        </button>
      ))}
    </div>
  );
}
