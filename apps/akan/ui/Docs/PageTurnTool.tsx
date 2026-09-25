"use client";
import { st } from "@apps/akan/client";
import { Any } from "akanjs/base";
import { router } from "akanjs/client";

interface DocsPage {
  name: string;
  href: string;
}
interface PageTurnToolProps {
  prev: DocsPage | null;
  next: DocsPage | null;
}

/** Tool declarations are mount-static, so both stay published at either end of the reading order; the guard answers there instead. */
export const PageTurnTool = ({ prev, next }: PageTurnToolProps) => {
  st.expose("docsReadingOrder", Any)
    .desc("The neighboring pages in the docs reading order.")
    .value({
      prev: prev ? `${prev.name} (${prev.href})` : null,
      next: next ? `${next.name} (${next.href})` : null,
    });
  const openPage = (page: DocsPage | null) => {
    if (!page) return;
    router.push(page.href, { scrollToTop: true });
    return `Opening ${page.name} (${page.href}).`;
  };
  st.tool("openPrevDocsPage", { guard: () => (prev ? true : "Already at the first page of the docs.") })
    .desc("Open the previous page in the docs reading order.")
    .exec(() => openPage(prev));
  st.tool("openNextDocsPage", { guard: () => (next ? true : "Already at the last page of the docs.") })
    .desc("Open the next page in the docs reading order.")
    .exec(() => openPage(next));
  return null;
};
