import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { Link } from "akanjs/ui";
import type { ReactNode } from "react";

import { Code } from "../Code";
import { CodeText } from "./CodeText";

export interface IntroItem {
  name: ReactNode | string[];
  /** 같은 페이지 슬라이드는 `#id`, 다른 페이지는 `/path#id` — 이름이 그 표제로 가는 링크가 된다. */
  href?: string | string[];
  desc: ReactNode;
  example?: string | null;
}

interface IntroTableProps {
  className?: string;
  type: string;
  descLabel?: string;
  items: IntroItem[];
}

const hrefAt = (href: IntroItem["href"], idx: number): string | undefined => {
  if (Array.isArray(href)) return href[idx];
  return idx === 0 ? href : undefined;
};

const NameText = ({ href, children }: { href?: string; children: ReactNode }) => {
  if (!href) return <span>{children}</span>;
  return (
    <Link
      href={href}
      className="underline decoration-primary/30 underline-offset-4 hover:text-primary hover:decoration-primary"
    >
      {children}
    </Link>
  );
};

export const IntroTable = ({ className, type, descLabel, items }: IntroTableProps) => {
  const { l } = usePage();
  return (
    <div
      className={cn(
        "studio-lift my-5 grid rounded-2xl border border-foreground/8 bg-card/80 px-4 text-sm md:grid-cols-[fit-content(16rem)_minmax(0,1fr)] md:gap-x-6 md:px-5",
        className,
      )}
    >
      <div className="hidden border-foreground/8 border-b py-2.5 font-bold text-foreground/45 text-xs uppercase tracking-[0.12em] md:col-span-2 md:grid md:grid-cols-subgrid">
        <span>{type}</span>
        <span>{descLabel ?? l.trans({ en: "Description", ko: "설명" })}</span>
      </div>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="grid gap-y-1 border-foreground/6 border-b py-3 last:border-b-0 md:col-span-2 md:grid-cols-subgrid"
        >
          {Array.isArray(item.name) ? (
            <div className="flex flex-wrap content-start gap-x-3 font-mono font-semibold text-foreground">
              {item.name.map((name, nameIdx) => (
                <NameText key={name} href={hrefAt(item.href, nameIdx)}>
                  {name}
                </NameText>
              ))}
            </div>
          ) : (
            <div className="wrap-anywhere font-mono font-semibold text-foreground">
              <NameText href={hrefAt(item.href, 0)}>{item.name}</NameText>
            </div>
          )}
          <div className="min-w-0 space-y-1.5 text-foreground/80 leading-relaxed">
            <div className="whitespace-pre-line">
              <CodeText>{item.desc}</CodeText>
            </div>
            {item.example ? (
              <div className="overflow-x-auto rounded-xl bg-foreground/4 px-3 py-1.5 text-xs">
                <Code.Raw showLineNumbers={false} code={item.example} />
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};
