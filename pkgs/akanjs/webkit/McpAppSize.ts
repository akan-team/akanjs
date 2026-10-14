"use client";
import type { McpAppBridge } from "./McpAppBridge";

export class McpAppSize {
  static readonly contentGap = 24;
  static readonly styleSettleMs = 120;

  readonly #bridge: McpAppBridge;
  #lastHeight = 0;
  #unwatch: () => void = () => undefined;

  constructor(bridge: McpAppBridge) {
    this.#bridge = bridge;
  }

  // The CSR frame is one viewport tall and scrolls the page inside it, so the document is always as tall as the iframe
  // the host sized from the last report. The current page's content height is what the host must size to instead.
  watch() {
    let scheduled = false;
    let watching = true;
    const report = () => {
      if (scheduled || !watching) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (!watching) return;
        observeContent();
        const height = McpAppSize.#contentHeight();
        if (height === this.#lastHeight) return;
        this.#lastHeight = height;
        this.#bridge.notify("ui/notifications/size-changed", { height });
      });
    };
    const resized = new ResizeObserver(report);
    resized.observe(document.documentElement);
    const observeContent = () => {
      for (const content of document.querySelectorAll(".akan-page-content"))
        for (const child of content.children) resized.observe(child);
    };
    let settling: ReturnType<typeof setTimeout> | undefined;
    //? A spring rewrites `style` every frame; measured once it stops, the view still gets the size it ends at.
    const mutated = new MutationObserver((records) => {
      clearTimeout(settling);
      if (records.some((record) => record.attributeName !== "style")) report();
      else settling = setTimeout(report, McpAppSize.styleSettleMs);
    });
    mutated.observe(document.body, { childList: true, subtree: true, attributes: true });
    //? An image or a font settling resizes boxes without a mutation or a document resize.
    document.addEventListener("load", report, true);
    void document.fonts.ready.then(report);
    this.#unwatch = () => {
      watching = false;
      clearTimeout(settling);
      resized.disconnect();
      mutated.disconnect();
      document.removeEventListener("load", report, true);
    };
    report();
  }

  unwatch() {
    this.#unwatch();
  }

  // A screen built for a phone fills it (`min-h-screen`), so a box tied to the viewport says nothing about the content:
  // one as tall as the viewport, or ending at its bottom edge, is walked into, and a fixed one is left out, or each
  // report would grow the next. A zero-height box is walked into too: `display: contents` reports one.
  static #contentHeight() {
    const content = document.querySelector<HTMLElement>('[id^="pageContainer-"]:not([inert]) .akan-page-content');
    if (!content) return Math.ceil(document.documentElement.scrollHeight);
    const viewport = window.innerHeight;
    const style = getComputedStyle(content);
    const top = content.getBoundingClientRect().top - content.scrollTop;
    let bottom = top + Number.parseFloat(style.paddingTop || "0");
    const pending: Element[] = [content];
    for (let box = pending.pop(); box; box = pending.pop())
      for (const child of box.children) {
        const rect = child.getBoundingClientRect();
        if (getComputedStyle(child).position === "fixed") continue;
        if (rect.height === 0 || rect.height >= viewport - 1 || Math.abs(rect.bottom - viewport) <= 1)
          pending.push(child);
        else bottom = Math.max(bottom, rect.bottom);
      }
    const height = bottom - top + Number.parseFloat(style.paddingBottom || "0") + McpAppSize.contentGap;
    return Math.ceil(Math.max(height + McpAppSize.#overlayHeight(), McpAppSize.#dialogHeight()));
  }

  // A card the view pins over its own bottom edge (an approval) must not cover the screen it asks about.
  static #overlayHeight() {
    let height = 0;
    for (const overlay of document.querySelectorAll<HTMLElement>("[data-akan-embed-overlay]"))
      height += overlay.getBoundingClientRect().height;
    return height;
  }

  // A modal is portaled out of the page and clamped to the viewport, so the frame must grow to the panel's own height.
  static #dialogHeight() {
    let height = 0;
    for (const dialog of document.querySelectorAll<HTMLElement>('[aria-modal="true"]')) {
      if (!dialog.getClientRects().length) continue;
      let natural = 0;
      for (const child of dialog.children)
        if (!["absolute", "fixed"].includes(getComputedStyle(child).position)) natural += child.scrollHeight;
      height = Math.max(height, natural + McpAppSize.contentGap * 2);
    }
    return height;
  }
}
