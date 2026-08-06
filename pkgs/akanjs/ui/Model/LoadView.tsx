"use client";
import type { ClientView } from "akanjs/fetch";

import { Load } from "../Load";

interface LoadViewProps<T extends string, Model extends { id: string }> {
  view: ClientView<T, Model>;
}
export default function LoadView<T extends string, Light extends { id: string }>({ view }: LoadViewProps<T, Light>) {
  return <Load.View view={view} renderView={() => null} loading={null} />;
}
