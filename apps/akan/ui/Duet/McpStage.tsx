import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { KoyoMark } from "./KoyoOrder";
import { HumanPointer } from "./Pointer";

const callClass = [
  "opacity-[clamp(0,var(--duet-calls),1)]",
  "opacity-[clamp(0,var(--duet-calls)_-_1,1)]",
  "opacity-[clamp(0,var(--duet-calls)_-_2,1)]",
  "opacity-[clamp(0,var(--duet-calls)_-_3,1)]",
  "opacity-[clamp(0,var(--duet-calls)_-_4,1)]",
] as const;

const moveClass = [
  "translate-x-[calc(clamp(0,var(--duet-moved),1)*(100%_+_0.75rem))]",
  "translate-x-[calc(clamp(0,var(--duet-moved)_-_1,1)*(100%_+_0.75rem))]",
  "translate-x-[calc(clamp(0,var(--duet-moved)_-_2,1)*(100%_+_0.75rem))]",
] as const;

const servedClass = [
  "opacity-[clamp(0,var(--duet-moved),1)]",
  "opacity-[clamp(0,var(--duet-moved)_-_1,1)]",
  "opacity-[clamp(0,var(--duet-moved)_-_2,1)]",
] as const;

const refuseClass = [
  "opacity-[clamp(0,var(--duet-refuse),1)]",
  "opacity-[clamp(0,var(--duet-refuse)_-_1,1)]",
  "opacity-[clamp(0,var(--duet-refuse)_-_2,1)]",
] as const;

interface McpStageProps {
  className?: string;
}
export const McpStage = ({ className }: McpStageProps) => {
  const { l } = usePage();
  const calls = [
    { name: "listIcecreamOrders", args: '{ status: "processing" }', result: l.trans({ en: "3 orders", ko: "3건" }) },
    { name: "serveIcecreamOrder", args: '"1041"', result: "served" },
    { name: "serveIcecreamOrder", args: '"1042"', result: "served" },
    { name: "serveIcecreamOrder", args: '"1043"', result: "served" },
    {
      name: "icecreamOrderSummary",
      args: "",
      result: l.trans({ en: "42 orders · ₩273,000", ko: "42건 · ₩273,000" }),
    },
  ];
  const wire = [
    '{"name":"listIcecreamOrders","arguments":{"status":"processing"}}',
    '{"name":"serveIcecreamOrder","arguments":{"icecreamOrderId":"1041"}}',
    '{"name":"serveIcecreamOrder","arguments":{"icecreamOrderId":"1042"}}',
    '{"name":"serveIcecreamOrder","arguments":{"icecreamOrderId":"1043"}}',
    '{"name":"icecreamOrderSummary","arguments":{}}',
  ];
  const tools = [
    "listIcecreamOrders",
    "createIcecreamOrder",
    "serveIcecreamOrder",
    "icecreamOrderSummary",
    "removeIcecreamOrder",
  ];
  const orders = [
    { id: "1041", item: l.trans({ en: "150g · mango", ko: "150g · 망고" }) },
    { id: "1042", item: l.trans({ en: "100g · oreo", ko: "100g · 오레오" }) },
    { id: "1043", item: l.trans({ en: "150g · mango, granola", ko: "150g · 망고, 그래놀라" }) },
  ];
  return (
    <div aria-hidden="true" className={cn("relative w-full max-w-[32rem] select-none text-left", className)}>
      <div className="jelly-glass relative overflow-hidden rounded-3xl">
        <div className="flex h-10 items-center gap-1.5 border-foreground/10 border-b px-4">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="ml-3 font-semibold text-xs">Claude Code</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-open/10 px-2 py-0.5 font-mono text-[10px] text-open opacity-[var(--duet-linked)]">
            ● koyo · {l.trans({ en: "12 tools", ko: "툴 12개" })}
          </span>
        </div>
        <div className="relative h-[22.5rem] text-xs leading-relaxed">
          <div className="absolute inset-0 p-4 opacity-[calc(1_-_var(--duet-ask))]">
            <p className="font-mono text-[10px] text-foreground/45 uppercase tracking-[0.2em]">
              {l.trans({ en: "Add an MCP server", ko: "MCP 서버 추가" })}
            </p>
            <div className="mt-2 flex h-9 items-center rounded-lg border border-foreground/15 bg-background px-3 font-mono text-xs">
              <span className="w-[calc(var(--duet-url)*24ch)] overflow-hidden whitespace-nowrap">
                https://koyo.example/mcp
              </span>
              <span className="ml-px h-4 w-px animate-pulse bg-primary" />
            </div>
            <div className="mt-4 opacity-[var(--duet-linked)]">
              <p className="flex items-center gap-2">
                <span className="text-open">●</span>
                {l.trans({ en: "Connected — 12 tools from koyo", ko: "연결됨 — koyo의 툴 12개" })}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5 font-mono text-[10px]">
                {tools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-md border border-foreground/10 bg-background px-1.5 py-0.5 text-foreground/75"
                  >
                    {tool}
                  </span>
                ))}
                <span className="px-1 py-0.5 text-foreground/40">+7</span>
              </div>
            </div>
            <p className="absolute inset-x-4 bottom-4 font-mono text-[10px] text-foreground/40">
              {l.trans({
                en: "Also: claude.ai · Cursor · any MCP client",
                ko: "그 밖에: claude.ai · Cursor · 모든 MCP 클라이언트",
              })}
            </p>
          </div>
          <div className="absolute inset-0 flex flex-col gap-2 p-4 opacity-[var(--duet-ask)]">
            <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-foreground/10 px-3 py-1.5">
              {l.trans({
                en: "Serve every order that's ready, then tell me today's total.",
                ko: "준비된 주문은 전부 서빙하고, 오늘 매출 알려줘.",
              })}
            </p>
            <div className="flex duet-agent:hidden flex-col gap-1">
              {calls.map(({ name, args, result }, idx) => (
                <p
                  key={`${name}-${args}`}
                  className={cn(
                    "flex items-baseline gap-2 rounded-md bg-muted px-2 py-0.5 font-mono text-[10px]",
                    callClass[idx],
                  )}
                >
                  <span className="text-success">✓</span>
                  <span className="shrink-0">{name}</span>
                  <span className="truncate text-foreground/50">{args}</span>
                  <span className="ml-auto shrink-0 text-foreground/45">{result}</span>
                </p>
              ))}
            </div>
            <div className="duet-agent:flex hidden flex-col gap-1">
              {wire.map((line, idx) => (
                <p
                  key={line}
                  className={cn(
                    "truncate rounded-md bg-primary/5 px-2 py-0.5 font-mono text-[9px] text-primary",
                    callClass[idx],
                  )}
                >
                  tools/call {line}
                </p>
              ))}
            </div>
            <p className="opacity-[var(--duet-reply)]">
              {l.trans({
                en: "Served 3 orders. Today so far: 42 orders, ₩273,000.",
                ko: "3건 서빙했습니다. 오늘 지금까지 42건, ₩273,000입니다.",
              })}
            </p>
            <p
              className={cn(
                "max-w-[85%] self-end rounded-2xl rounded-br-md bg-foreground/10 px-3 py-1.5",
                refuseClass[0],
              )}
            >
              {l.trans({ en: "Refund #1042 too.", ko: "#1042는 환불도 해줘." })}
            </p>
            <p
              className={cn(
                "flex items-baseline gap-2 rounded-md bg-destructive/10 px-2 py-0.5 font-mono text-[10px]",
                refuseClass[1],
              )}
            >
              <span className="text-destructive">✕</span>
              refundIcecreamOrder
              <span className="ml-auto text-destructive">Unknown tool</span>
            </p>
            <p className={refuseClass[2]}>
              {l.trans({
                en: "I don't have a refund tool for koyo — you'll need to refund it in the app.",
                ko: "koyo에는 제가 쓸 수 있는 환불 툴이 없어요. 앱에서 직접 환불해 주세요.",
              })}
            </p>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-5 top-16 z-20 origin-top scale-[calc(0.96_+_0.04*var(--duet-consent))] rounded-2xl border border-foreground/15 bg-background p-5 opacity-[var(--duet-consent)] shadow-2xl sm:inset-x-10">
        <p className="flex items-center gap-2 font-black tracking-tight">
          <KoyoMark />
          koyo
        </p>
        <p className="mt-3 font-bold text-base">{l.trans({ en: "Authorize access", ko: "접근 허용" })}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-foreground/60">{l.trans({ en: "Application", ko: "애플리케이션" })}</dt>
          <dd>Claude Code</dd>
          <dt className="text-foreground/60">{l.trans({ en: "Returns to", ko: "돌아갈 주소" })}</dt>
          <dd className="font-mono">localhost:33418</dd>
        </dl>
        <p className="mt-3 rounded-md bg-warning/10 px-2.5 py-1.5 text-[10px] text-warning leading-relaxed">
          {l.trans({
            en: "This application runs on your own computer. Continue only if you started this request yourself.",
            ko: "이 애플리케이션은 내 컴퓨터에서 실행됩니다. 직접 시작한 요청일 때만 계속하세요.",
          })}
        </p>
        <p className="mt-3 text-foreground/70 text-xs leading-relaxed">
          {l.trans({
            en: "It will be able to do everything your account can do until you sign it out.",
            ko: "로그아웃시키기 전까지 내 계정이 할 수 있는 모든 일을 할 수 있습니다.",
          })}
        </p>
        <div className="mt-4 flex justify-end gap-2 text-xs">
          <span className="rounded-lg px-3 py-1.5 text-foreground/70">{l.trans({ en: "Deny", ko: "거부" })}</span>
          <span className="jelly tint-primary relative rounded-full px-3 py-1.5 font-semibold text-primary-foreground">
            <span className="absolute inset-0 rounded-full bg-background/25 opacity-[var(--duet-allow)]" />
            <span className="relative">{l.trans({ en: "Allow", ko: "허용" })}</span>
            <HumanPointer className="top-1/2 left-1/2" />
          </span>
        </div>
      </div>
      <div className="jelly-glass mt-4 rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-black tracking-tight">
            <KoyoMark />
            koyo
            <span className="font-mono font-normal text-[10px] text-foreground/45 uppercase tracking-[0.2em]">
              {l.trans({ en: "kitchen", ko: "주방" })}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-open uppercase tracking-[0.2em]">
            <span className="size-1.5 animate-pulse rounded-full bg-open" />
            live
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 font-mono text-[10px] text-foreground/45 uppercase tracking-[0.15em]">
          <span>{l.trans({ en: "Preparing", ko: "준비 중" })}</span>
          <span>{l.trans({ en: "Served", ko: "서빙 완료" })}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 text-[11px]">
          <div className="flex min-w-0 flex-col gap-1.5">
            {orders.map(({ id, item }, idx) => (
              <div
                key={id}
                className={cn(
                  "relative z-10 flex items-center gap-2 rounded-lg border border-foreground/10 bg-background px-2.5 py-1.5",
                  moveClass[idx],
                )}
              >
                <span className="font-mono text-foreground/45">#{id}</span>
                <span className="truncate">{item}</span>
                <span className={cn("ml-auto text-open", servedClass[idx])}>✓</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-foreground/10 border-dashed" />
        </div>
      </div>
    </div>
  );
};
