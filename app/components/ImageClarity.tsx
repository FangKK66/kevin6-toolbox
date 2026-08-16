"use client";

export type ImageClarity = "maximum" | "high" | "standard";

const OPTIONS: Array<{ value: ImageClarity; label: string; quality: number }> = [
  { value: "maximum", label: "High", quality: 1 },
  { value: "high", label: "Mid", quality: 0.9 },
  { value: "standard", label: "Low", quality: 0.76 },
];

export function qualityForClarity(clarity: ImageClarity) {
  return OPTIONS.find((option) => option.value === clarity)?.quality ?? 1;
}

export function ImageClaritySelector({ value, onChange, disabled = false }: {
  value: ImageClarity;
  onChange: (value: ImageClarity) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label>Image quality</label>
      <div className="clarity-options">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`button ${value === option.value ? "active" : ""}`}
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >{option.label}</button>
        ))}
      </div>
    </div>
  );
}
