import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import type { CSSProperties, ReactNode } from "react";
import { KoyoScript } from "./koyoScript.util";

const ringClass = {
  size: "opacity-[var(--duet-ring-size)]",
  toppings: "opacity-[var(--duet-ring-top)]",
  serve: "opacity-[var(--duet-ring-serve)]",
  order: "opacity-[var(--duet-ring-order)]",
} as const;

const indicatorClass = {
  size: "translate-x-[calc(var(--duet-size)*5.125rem)]",
  serve: "translate-x-[calc(var(--duet-serve)*5.125rem)]",
} as const;

const stepClass = [
  "opacity-[clamp(0,var(--duet-tools),1)]",
  "opacity-[clamp(0,var(--duet-tools)_-_1,1)]",
  "opacity-[clamp(0,var(--duet-tools)_-_2,1)]",
] as const;

const place = (top: number, y: number) => ({ top: `${top}rem`, "--y": y }) as CSSProperties;

const Outline = () => {
  return (
    <span className="duet-reveal pointer-events-none absolute -inset-1 rounded-xl border border-primary/70 border-dashed duet-agent:opacity-100" />
  );
};

interface RingProps {
  className?: string;
}
const Ring = ({ className }: RingProps) => {
  return (
    <span
      className={cn(
        "pointer-events-none absolute -inset-1 rounded-xl bg-primary/15 outline-2 outline-primary",
        className,
      )}
    />
  );
};

interface LabelProps {
  top: number;
  human: string;
  tool: string;
}
const Label = ({ top, human, tool }: LabelProps) => {
  return (
    <div className="absolute inset-x-4 h-4 text-[0.6875rem]" style={place(top, top + 0.5)}>
      <span className="duet-hide absolute inset-0 font-semibold text-foreground/55 duet-agent:opacity-0">{human}</span>
      <span className="duet-reveal absolute inset-0 truncate font-mono text-[0.625rem] text-primary duet-agent:opacity-100">
        ◇ {tool}
      </span>
    </div>
  );
};

interface ChoiceProps {
  top: number;
  options: string[];
  indicator: keyof typeof indicatorClass;
}
const Choice = ({ top, options, indicator }: ChoiceProps) => {
  return (
    <div className="absolute inset-x-4 h-8" style={place(top, top + 1)}>
      <div className="duet-dim relative grid h-full grid-cols-3 gap-1.5 duet-agent:opacity-40">
        <span
          className={cn(
            "absolute top-0 left-0 h-full w-[4.75rem] rounded-lg bg-foreground/10 ring-2 ring-foreground/80",
            indicatorClass[indicator],
          )}
        />
        {options.map((option) => (
          <span
            key={option}
            className="relative flex items-center justify-center rounded-lg border border-foreground/10 font-medium text-[0.6875rem]"
          >
            {option}
          </span>
        ))}
      </div>
      <Outline />
      <Ring className={ringClass[indicator]} />
    </div>
  );
};

const Swirl = () => {
  return (
    <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-end">
      <span className="h-2.5 w-3 rounded-t-full bg-accent/90" />
      <span className="-mt-0.5 h-3 w-6 rounded-full bg-accent/75" />
      <span className="-mt-1 h-3.5 w-9 rounded-full bg-accent/60" />
      <span className="mt-0.5 h-3.5 w-8 rounded-b-xl bg-foreground/15" />
    </span>
  );
};

export const KoyoMark = () => {
  return (
    <span className="flex flex-col items-center">
      <span className="h-[0.3rem] w-[0.45rem] rounded-full bg-accent" />
      <span className="-mt-px h-[0.35rem] w-3 rounded-full bg-accent" />
      <span className="-mt-px h-[0.4rem] w-[1.05rem] rounded-full bg-accent" />
      <span className="mt-px h-[0.45rem] w-[0.85rem] rounded-b-[0.35rem] bg-accent/45" />
    </span>
  );
};

interface KoyoOrderProps {
  className?: string;
  children?: ReactNode;
}
export const KoyoOrder = ({ className, children }: KoyoOrderProps) => {
  const { l } = usePage();
  const { rows } = KoyoScript;
  const toppings = [
    { label: l.trans({ en: "Mango", ko: "망고" }), isPicked: true },
    { label: l.trans({ en: "Granola", ko: "그래놀라" }), isPicked: true },
    { label: l.trans({ en: "Strawberry", ko: "딸기" }), isPicked: false },
    { label: l.trans({ en: "Oreo", ko: "오레오" }), isPicked: false },
    { label: l.trans({ en: "Banana", ko: "바나나" }), isPicked: false },
    { label: l.trans({ en: "Fig", ko: "무화과" }), isPicked: false },
  ];
  return (
    <div
      className={cn(
        "relative h-[37rem] w-[17rem] select-none overflow-hidden bg-background text-left text-foreground",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between px-6 pt-1 font-semibold text-[0.6875rem]">
        <span>9:41</span>
        <span className="flex items-center gap-1.5">
          <span className="flex items-end gap-px">
            <span className="h-1 w-[0.1875rem] rounded-sm bg-foreground" />
            <span className="h-1.5 w-[0.1875rem] rounded-sm bg-foreground" />
            <span className="h-2 w-[0.1875rem] rounded-sm bg-foreground" />
            <span className="h-2.5 w-[0.1875rem] rounded-sm bg-foreground/40" />
          </span>
          <span className="h-2.5 w-5 rounded-[0.2rem] border border-foreground/50 p-px">
            <span className="block h-full w-3/4 rounded-[0.1rem] bg-foreground" />
          </span>
        </span>
      </div>
      <div className="absolute inset-x-4 top-7 flex h-10 items-center justify-between">
        <span className="flex items-center gap-2">
          <KoyoMark />
          <span className="font-black text-[1.0625rem] tracking-tight">koyo</span>
        </span>
        <span className="flex h-6 items-center gap-1.5 rounded-full border border-foreground/10 bg-muted px-2.5 font-medium text-[0.625rem] opacity-[var(--duet-placed)]">
          <span className="font-mono text-foreground/50">#1043</span>
          <span className="grid">
            <span className="text-warning opacity-[calc(1_-_var(--duet-served))] [grid-area:1/1]">
              ● {l.trans({ en: "Preparing", ko: "준비 중" })}
            </span>
            <span className="text-open opacity-[var(--duet-served)] [grid-area:1/1]">
              ● {l.trans({ en: "Served", ko: "서빙 완료" })}
            </span>
          </span>
        </span>
      </div>
      <div
        className="absolute inset-x-4 flex h-20 items-center gap-3 rounded-2xl bg-accent/10 px-3 ring-1 ring-accent/25"
        style={place(4.5, 5)}
      >
        <Swirl />
        <div className="duet-dim min-w-0 duet-agent:opacity-40">
          <p className="font-bold text-[0.8125rem] leading-tight">
            {l.trans({ en: "Greek yogurt soft serve", ko: "그릭 요거트 아이스크림" })}
          </p>
          <p className="mt-0.5 text-[0.625rem] text-foreground/55">
            {l.trans({ en: "Fresh fruit, crunchy granola", ko: "생과일과 바삭한 그래놀라" })}
          </p>
          <p className="mt-1 font-semibold text-[0.6875rem] text-accent">
            {l.trans({ en: "from ₩4,500", ko: "₩4,500부터" })}
          </p>
        </div>
        <span className="duet-reveal absolute right-2.5 bottom-1.5 font-mono text-[0.5625rem] text-primary duet-agent:opacity-100">
          ◇ fillIcecreamOrderForm
        </span>
      </div>
      <Label top={rows.size.label} human={l.trans({ en: "Size", ko: "용량" })} tool="setSizeOnIcecreamOrder" />
      <Choice top={rows.size.top} options={["100g", "150g", "200g"]} indicator="size" />
      <Label
        top={rows.toppings.label}
        human={l.trans({ en: "Toppings", ko: "토핑" })}
        tool="setToppingsOnIcecreamOrder"
      />
      <div className="absolute inset-x-4" style={place(rows.toppings.top, rows.toppings.top + 2)}>
        <div className="duet-dim grid grid-cols-3 gap-1.5 duet-agent:opacity-40">
          {toppings.map(({ label, isPicked }) => (
            <span
              key={label}
              className="relative flex h-7 items-center justify-center rounded-full border border-foreground/12 text-[0.6875rem]"
            >
              {isPicked ? (
                <span className="absolute inset-0 rounded-full bg-accent/20 opacity-[var(--duet-top)] ring-1 ring-accent" />
              ) : null}
              <span className="relative">{label}</span>
            </span>
          ))}
        </div>
        <Outline />
        <Ring className={ringClass.toppings} />
      </div>
      <Label
        top={rows.serve.label}
        human={l.trans({ en: "How", ko: "받는 방법" })}
        tool="setServeTypeOnIcecreamOrder"
      />
      <Choice
        top={rows.serve.top}
        options={[
          l.trans({ en: "For here", ko: "매장" }),
          l.trans({ en: "Take out", ko: "포장" }),
          l.trans({ en: "Delivery", ko: "배달" }),
        ]}
        indicator="serve"
      />
      <div className="absolute inset-x-4 h-10" style={place(rows.order.top, rows.order.top + 1.25)}>
        <div className="duet-hide absolute inset-y-0 left-0 flex flex-col justify-center duet-agent:opacity-0">
          <span className="text-[0.625rem] text-foreground/50">{l.trans({ en: "Total", ko: "합계" })}</span>
          <span className="grid font-bold text-[0.9375rem]">
            <span className="opacity-[calc(1_-_var(--duet-top))] [grid-area:1/1]">₩4,500</span>
            <span className="opacity-[var(--duet-top)] [grid-area:1/1]">₩6,500</span>
          </span>
        </div>
        <span className="duet-reveal absolute top-1/2 left-0 -translate-y-1/2 font-mono text-[0.5625rem] text-primary leading-snug duet-agent:opacity-100">
          ◆ createIcecreamOrder()
          <span className="block pl-3 text-primary/70">confirm</span>
        </span>
        <div className="absolute inset-y-0 right-0 w-28">
          <span className="duet-dim flex h-full items-center justify-center rounded-xl bg-accent font-bold text-[0.8125rem] text-accent-foreground duet-agent:opacity-40">
            {l.trans({ en: "Order", ko: "주문하기" })}
          </span>
          <Outline />
          <Ring className={ringClass.order} />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 h-[10.25rem] translate-y-[calc((1_-_var(--duet-sheet))*100%)] rounded-t-[1.25rem] border-foreground/10 border-t bg-card shadow-2xl">
        <span className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-foreground/20" />
        <div className="absolute inset-x-4 top-4 flex h-4 items-center justify-between text-[0.625rem]">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="size-1.5 rounded-full bg-primary" />
            {l.trans({ en: "koyo assistant", ko: "koyo 도우미" })}
          </span>
          <span className="text-foreground/40">✕</span>
        </div>
        <p className="absolute top-[2.375rem] right-4 max-w-[12.5rem] rounded-2xl rounded-br-md bg-foreground/10 px-3 py-1.5 text-[0.6875rem] leading-snug opacity-[var(--duet-msg)]">
          {l.trans({ en: "150g, mango and granola — to go.", ko: "150g에 망고랑 그래놀라, 포장으로요." })}
        </p>
        <div className="absolute inset-x-4 top-[4.5rem] flex h-5 items-center gap-2.5 font-mono text-[0.5625rem] text-foreground/60">
          {["size", "toppings", "serveType"].map((name, idx) => (
            <span key={name} className={cn("flex items-center gap-1", stepClass[idx])}>
              <span className="text-success">✓</span>
              {name}
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[4.25rem] border-warning/30 border-t bg-warning/10 px-4 pt-1.5 opacity-[var(--duet-ask)]">
          <p className="text-[0.6875rem]">
            {l.trans({ en: "Place this order? · ₩6,500", ko: "이 주문을 넣을까요? · ₩6,500" })}
          </p>
          <pre className="mt-1 truncate rounded-[0.3rem] bg-background/60 px-1.5 py-0.5 font-mono text-[0.5rem]">
            {'{"size":150,"toppings":["mango","granola"],"serveType":"takeOut"}'}
          </pre>
          <div className="absolute right-4 bottom-1 flex gap-1.5">
            <span className="flex h-5 w-14 items-center justify-center rounded-md text-[0.625rem] text-foreground/70">
              {l.trans({ en: "Decline", ko: "거절" })}
            </span>
            <span className="jelly tint-primary flex h-5 w-14 items-center justify-center rounded-full font-semibold text-[0.625rem] text-primary-foreground">
              {l.trans({ en: "Approve", ko: "승인" })}
            </span>
          </div>
        </div>
        <p className="absolute inset-x-4 top-[6.5rem] flex items-center gap-1.5 text-[0.6875rem] opacity-[var(--duet-ok)]">
          <span className="text-success">✓</span>
          {l.trans({ en: "Approved · order #1043 placed", ko: "승인됨 · 주문 #1043 접수" })}
        </p>
      </div>
      {children}
      <span className="pointer-events-none absolute inset-0 z-40 bg-background opacity-[var(--duet-veil)]" />
    </div>
  );
};
