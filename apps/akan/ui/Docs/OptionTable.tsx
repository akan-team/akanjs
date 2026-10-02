import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

import { Code } from "../Code";
import { CodeText } from "./CodeText";

export interface OptionItem {
  key: string;
  desc: ReactNode;
  example?: string;
  type?: string;
  default?: string;
  tags?: string[];
}

interface OptionTableProps {
  className?: string;
  items: OptionItem[];
}

export const OptionTable = ({ className, items }: OptionTableProps) => {
  const { l } = usePage();
  return (
    <div
      className={cn(
        "studio-lift my-5 rounded-2xl border border-foreground/8 bg-card/80 px-4 text-sm md:px-5",
        className,
      )}
    >
      {items.map((item, idx) => (
        <div key={idx} className="space-y-1 border-foreground/6 border-b py-3 last:border-b-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="wrap-anywhere font-mono font-semibold text-foreground">{item.key}</span>
            {item.type ? (
              <span className="wrap-anywhere rounded-full bg-accent/10 px-2 py-0.5 font-mono text-accent text-xs">
                {item.type}
              </span>
            ) : null}
            {item.default ? (
              <span className="text-foreground/50 text-xs">
                {l.trans({ en: "default", ko: "기본값" })}{" "}
                <span className="wrap-anywhere font-mono text-foreground/80">{item.default}</span>
              </span>
            ) : null}
            {item.tags?.map((tag) => (
              <span key={tag} className="wrap-anywhere font-mono text-foreground/50 text-xs">
                {tag}
              </span>
            ))}
          </div>
          <div className="text-foreground/80 leading-relaxed">
            <CodeText>{item.desc}</CodeText>
          </div>
          {item.example ? (
            <div className="overflow-x-auto rounded-xl bg-foreground/4 px-3 py-1.5 text-xs">
              <Code.Raw showLineNumbers={false} code={item.example} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};
