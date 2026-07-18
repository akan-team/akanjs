import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "QuantityControl.tsx",
    content: `"use client";

import { clsx } from "akanjs/client";

// ===== QuantityControl.tsx =====
// Convention: ui/ folder — reusable visual components. PascalCase .tsx, "use client" directive.
// File name = exported component name.
// Scanned by akan sync into ui/index.ts barrel automatically.

interface QuantityControlProps {
  className?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export const QuantityControl = ({
  className,
  value,
  onChange,
  min = 0,
  max = 99,
}: QuantityControlProps) => {
  return (
    <div className={clsx("inline-flex items-center gap-1", className)}>
      <button
        className="btn btn-circle btn-outline btn-xs"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="w-8 text-center font-medium tabular-nums">{value}</span>
      <button
        className="btn btn-circle btn-outline btn-xs"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
};
`,
  };
}
