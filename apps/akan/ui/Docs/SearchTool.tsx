"use client";
import { fetch, st, usePage } from "@apps/akan/client";
import { useEffect, useState } from "react";
import { type DocsSearchItem, isDocsSearchIndex, scoreDocs } from "./Search";

/**
 * Publishes the docs search to the in-page agent as a `searchDocs` tool. Its own component rather than a flag on
 * `Search` because the layout mounts `Search` twice (mobile and desktop shells) and a tool registers once; the
 * index fetch repeats here but rides the browser cache.
 */
export const SearchTool = () => {
  const { lang } = usePage();
  const activeLang = lang === "ko" ? ("ko" as const) : ("en" as const);
  const [items, setItems] = useState<DocsSearchItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/docs-search-index.json", { signal: controller.signal });
        if (!response.ok) return;
        const json: unknown = await response.json();
        if (isDocsSearchIndex(json)) setItems(json.items);
      } catch {
        // The Search UI reports index failures to the user; the tool just answers with no matches.
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  st.tool("searchDocs")
    .desc("Search the documentation. Returns matching pages as { href, title, section }; open one with navigate.")
    .arg("query", String)
    .exec((query) =>
      scoreDocs(items, query, activeLang)
        .slice(0, 5)
        .map(({ item }) => ({
          href: item.href,
          title: item.title[activeLang] || item.title.en,
          section: item.section,
        })),
    );
  return null;
};
