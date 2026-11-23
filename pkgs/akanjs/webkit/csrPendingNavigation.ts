"use client";
import type { Location } from "akanjs/client";
import { PendingNavigation, type PendingNavigationEntry } from "../client/pendingNavigation";

const urlOf = (href: string) => new URL(href, document.baseURI).href;

export class CsrPendingNavigation {
  static #begun: { entry: PendingNavigationEntry; to: Location } | null = null;

  static begin(href: string, from: Location, to: Location, waits: boolean) {
    const entry = PendingNavigation.begin(urlOf(href), { from: urlOf(from.href) });
    if (waits) PendingNavigation.wait(entry);
    CsrPendingNavigation.#begun = { entry, to };
  }

  static drawn(location: Location) {
    if (CsrPendingNavigation.#begun?.to === location) CsrPendingNavigation.end();
  }

  static end() {
    if (CsrPendingNavigation.#begun) PendingNavigation.end(CsrPendingNavigation.#begun.entry);
    CsrPendingNavigation.#begun = null;
  }
}
