"use client";
import { usePage } from "@apps/akan/client";
import { Link } from "akanjs/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AiOutlineSearch } from "react-icons/ai";

type Lang = "en" | "ko";
type LocalizedText = Record<Lang, string>;

interface DocsSearchHeading {
  id: string;
  title: LocalizedText;
}

interface DocsSearchItem {
  href: string;
  section: string;
  category: string;
  title: LocalizedText;
  headings: DocsSearchHeading[];
  body: LocalizedText;
}

interface DocsSearchIndex {
  generatedAt: string;
  items: DocsSearchItem[];
}

interface SearchResult {
  item: DocsSearchItem;
  score: number;
  headings: DocsSearchHeading[];
}

interface SearchProps {
  className?: string;
  onNavigate?: () => void;
}

const isLocalizedText = (value: unknown): value is LocalizedText => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.en === "string" && typeof record.ko === "string";
};

const isDocsSearchItem = (value: unknown): value is DocsSearchItem => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.href === "string" &&
    typeof record.section === "string" &&
    typeof record.category === "string" &&
    isLocalizedText(record.title) &&
    isLocalizedText(record.body) &&
    Array.isArray(record.headings) &&
    record.headings.every((heading) => {
      if (!heading || typeof heading !== "object") return false;
      const headingRecord = heading as Record<string, unknown>;
      return typeof headingRecord.id === "string" && isLocalizedText(headingRecord.title);
    })
  );
};

const isDocsSearchIndex = (value: unknown): value is DocsSearchIndex => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.generatedAt === "string" && Array.isArray(record.items) && record.items.every(isDocsSearchItem);
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const pickText = (text: LocalizedText, lang: Lang) => text[lang] || text.en || text.ko;

const includesAll = (target: string, tokens: string[]) => tokens.every((token) => target.includes(token));

const getScore = (item: DocsSearchItem, tokens: string[], lang: Lang) => {
  const title = normalize(pickText(item.title, lang));
  const otherTitle = normalize(pickText(item.title, lang === "ko" ? "en" : "ko"));
  const headings = item.headings.map((heading) => ({
    heading,
    text: normalize(`${pickText(heading.title, lang)} ${pickText(heading.title, lang === "ko" ? "en" : "ko")}`),
  }));
  const body = normalize(`${pickText(item.body, lang)} ${pickText(item.body, lang === "ko" ? "en" : "ko")}`);
  const href = normalize(item.href.replace(/\//g, " "));
  const matchedHeadings = headings.filter(({ text }) => includesAll(text, tokens)).map(({ heading }) => heading);

  let score = 0;
  if (includesAll(title, tokens)) score += 100;
  if (includesAll(otherTitle, tokens)) score += 80;
  if (matchedHeadings.length > 0) score += 60 + matchedHeadings.length * 5;
  if (includesAll(body, tokens)) score += 20;
  if (includesAll(href, tokens)) score += 15;

  return { score, headings: matchedHeadings };
};

export const Search = ({ className, onNavigate }: SearchProps) => {
  const { l, lang, path } = usePage();
  const activeLang: Lang = lang === "ko" ? "ko" : "en";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DocsSearchItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const open = () => {
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadIndex = async () => {
      try {
        const response = await fetch("/docs-search-index.json", { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to load docs search index: ${response.status}`);
        const json: unknown = await response.json();
        if (!isDocsSearchIndex(json)) throw new Error("Invalid docs search index");
        setItems(json.items);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn(error);
        setHasError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoaded(true);
      }
    };

    void loadIndex();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      open();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [path]);

  useEffect(() => {
    const closeOnNavigation = () => setIsOpen(false);

    window.addEventListener("hashchange", closeOnNavigation);
    window.addEventListener("popstate", closeOnNavigation);
    return () => {
      window.removeEventListener("hashchange", closeOnNavigation);
      window.removeEventListener("popstate", closeOnNavigation);
    };
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const tokens = normalize(query).split(" ").filter(Boolean);
    if (tokens.join("").length < 2) return [];

    return items
      .map((item) => {
        const { score, headings } = getScore(item, tokens, activeLang);
        return { item, score, headings };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.href.localeCompare(b.item.href))
      .slice(0, 8);
  }, [activeLang, items, query]);

  const hasQuery = normalize(query).length >= 2;
  const close = () => setIsOpen(false);
  const navigate = () => {
    close();
    onNavigate?.();
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={open}
        className="flex w-full items-center gap-2 rounded-2xl border border-base-content/10 bg-base-100/80 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
      >
        <AiOutlineSearch className="shrink-0 text-base-content/50 text-lg" />
        <span className="min-w-0 flex-1 text-sm">{l.trans({ en: "Search docs", ko: "문서 검색" })}</span>
        <span className="hidden rounded-lg bg-base-content/8 px-2 py-0.5 text-base-content/50 text-xs md:block">
          ⌘ K
        </span>
      </button>

      {isMounted &&
        isOpen &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-start justify-center bg-black/45 px-3 py-24 backdrop-blur-sm md:px-6">
            <button
              type="button"
              aria-label="Close search"
              className="absolute inset-0 cursor-default"
              onClick={close}
            />
            <div className="relative z-10 flex max-h-[min(720px,calc(100vh-8rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-base-content/10 bg-base-100 shadow-2xl">
              <div className="border-base-content/10 border-b p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-lg">{l.trans({ en: "Search Docs", ko: "문서 검색" })}</div>
                    <div className="text-base-content/50 text-sm">
                      {l.trans({
                        en: "Find pages and sections across Akan docs.",
                        ko: "Akan 문서의 페이지와 섹션을 찾습니다.",
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full border border-base-content/10 px-3 py-1.5 text-base-content/60 text-sm transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                  >
                    {l.trans({ en: "Close", ko: "닫기" })}
                  </button>
                </div>
                <label className="mt-4 flex items-center gap-2 rounded-2xl border border-base-content/10 bg-base-content/5 px-4 py-3 focus-within:border-primary/40 focus-within:bg-base-100">
                  <AiOutlineSearch className="shrink-0 text-base-content/50 text-xl" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder={l.trans({ en: "Search docs", ko: "문서 검색" })}
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-base-content/40"
                  />
                </label>
              </div>

              <div className="min-h-40 overflow-y-auto p-4">
                {!hasQuery && (
                  <div className="rounded-2xl border border-base-content/15 border-dashed px-4 py-8 text-center text-base-content/50 text-sm">
                    {l.trans({ en: "Type at least two characters to search.", ko: "두 글자 이상 입력해 검색하세요." })}
                  </div>
                )}
                {hasQuery && !isLoaded && (
                  <div className="px-2 py-3 text-base-content/50 text-sm">
                    {l.trans({ en: "Loading search index...", ko: "검색 인덱스를 불러오는 중..." })}
                  </div>
                )}
                {hasQuery && isLoaded && hasError && (
                  <div className="px-2 py-3 text-error text-sm">
                    {l.trans({ en: "Could not load search index.", ko: "검색 인덱스를 불러오지 못했습니다." })}
                  </div>
                )}
                {hasQuery && isLoaded && !hasError && results.length === 0 && (
                  <div className="px-2 py-3 text-base-content/50 text-sm">
                    {l.trans({ en: "No results found.", ko: "검색 결과가 없습니다." })}
                  </div>
                )}
                {results.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {results.map(({ item, headings }) => {
                      const mainHref = headings[0] ? `${item.href}#${headings[0].id}` : item.href;
                      return (
                        <div
                          key={item.href}
                          className="rounded-2xl border border-base-content/10 bg-base-content/4 p-3"
                        >
                          <Link
                            href={mainHref}
                            onClick={navigate}
                            className="block rounded-xl px-3 py-2 transition-colors hover:bg-primary/10 hover:text-primary"
                          >
                            <div className="text-base-content/50 text-xs">{item.category}</div>
                            <div className="font-bold text-base">{pickText(item.title, activeLang)}</div>
                            <div className="mt-1 line-clamp-2 text-base-content/60 text-sm">
                              {pickText(item.body, activeLang)}
                            </div>
                          </Link>
                          {headings.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1 px-3">
                              {headings.slice(0, 4).map((heading) => (
                                <Link
                                  key={heading.id}
                                  href={`${item.href}#${heading.id}`}
                                  onClick={navigate}
                                  className="rounded-full bg-base-content/8 px-2 py-0.5 text-base-content/60 text-xs transition-colors hover:bg-primary/10 hover:text-primary"
                                >
                                  # {pickText(heading.title, activeLang)}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
