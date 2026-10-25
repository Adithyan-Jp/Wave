interface Props {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

export function Slider({ label, hint, value, min, max, step, unit, onChange }: Props) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[13px] text-white/90">{label}</span>
          {hint && <span className="ml-2 text-[11px] text-white/35">{hint}</span>}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-lime-300">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="range-lime"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--p" as any]: `${p}%` }}
      />
    </div>
  );
}
