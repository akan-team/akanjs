"use client";
import type { ClientInit, ClientView } from "akanjs/fetch";

import { Load } from "../Load";

interface LoadInitProps<T extends string, Light extends { id: string }> {
  init: ClientInit<T, Light>;
}
export function LoadInit<T extends string, Light extends { id: string }>({ init }: LoadInitProps<T, Light>) {
  return <Load.Units init={init} renderList={() => null} loading={null} renderEmpty={null} pagination={false} noDiv />;
}

interface LoadViewProps<T extends string, Model extends { id: string }> {
  view: ClientView<T, Model>;
}
export function LoadView<T extends string, Light extends { id: string }>({ view }: LoadViewProps<T, Light>) {
  return <Load.View view={view} renderView={() => null} loading={null} />;
}
