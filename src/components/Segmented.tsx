interface Props<T extends string> {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}

/** Grupo de botões em que só um fica carregado. */
export function Segmented<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => value !== v && onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export const SIDE_OPTIONS = [['beginner', 'A · Iniciante'], ['expert', 'B · Experiente'], ['off', 'Sem categoria']] as const;
