"use client";
import type { ClientInit } from "@akanjs/signal";

import { Load } from "../Load";

interface LoadInitProps<T extends string, Light extends { id: string }> {
  init: ClientInit<T, Light>;
}
export default function LoadInit<T extends string, Light extends { id: string }>({ init }: LoadInitProps<T, Light>) {
  return <Load.Units init={init} renderList={() => null} loading={null} renderEmpty={null} />;
}
