import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "useDebounce.ts",
    content: `"use client";

import { useEffect, useState } from "react";

// ===== useDebounce.ts =====
// Convention: webkit/ folder — browser-only hooks; "use client" directive required.
// useEffect/useState are React client-side primitives that only work in the browser.
// Naming: camelCase .ts, file name = primary export name.
// Scanned by akan sync into webkit/index.ts barrel automatically.

export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ---- Expandable additional fields: ----
// useViewportWidth: detect browser window width
// export function useViewportWidth() {
//   const [width, setWidth] = useState(0);
//   useEffect(() => {
//     const handleResize = () => setWidth(window.innerWidth);
//     handleResize();
//     window.addEventListener("resize", handleResize);
//     return () => window.removeEventListener("resize", handleResize);
//   }, []);
//   return width;
// }
`,
  };
}
