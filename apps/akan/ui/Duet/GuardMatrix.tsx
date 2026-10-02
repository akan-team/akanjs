import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";

type Verdict = "yes" | "ask" | "off";

interface GuardRow {
  action: string;
  endpoint: string;
  guards: string;
  verdicts: Verdict[];
}

interface GuardMatrixProps {
  className?: string;
}
export const GuardMatrix = ({ className }: GuardMatrixProps) => {
  const { l } = usePage();
  const audiences = [
    { label: l.trans({ en: "Person", ko: "사람" }), short: l.trans({ en: "Person", ko: "사람" }) },
    {
      label: l.trans({ en: "In-page agent", ko: "인페이지 에이전트" }),
      short: l.trans({ en: "Agent", ko: "에이전트" }),
    },
    { label: l.trans({ en: "AI over MCP", ko: "MCP로 부르는 AI" }), short: "MCP" },
  ];
  const rows: GuardRow[] = [
    {
      action: l.trans({ en: "Place an order", ko: "주문하기" }),
      endpoint: "createIcecreamOrder",
      guards: "[Every]",
      verdicts: ["yes", "ask", "yes"],
    },
    {
      action: l.trans({ en: "Serve an order", ko: "서빙 처리" }),
      endpoint: "serveIcecreamOrder",
      guards: "[Admin]",
      verdicts: ["yes", "yes", "yes"],
    },
    {
      action: l.trans({ en: "See today's sales", ko: "오늘 매출 보기" }),
      endpoint: "icecreamOrderSummary",
      guards: "[Admin]",
      verdicts: ["yes", "yes", "yes"],
    },
    {
      action: l.trans({ en: "Refund an order", ko: "환불하기" }),
      endpoint: "refundIcecreamOrder",
      guards: "[Every, Person]",
      verdicts: ["yes", "yes", "off"],
    },
    {
      action: l.trans({ en: "Remove an order", ko: "주문 삭제" }),
      endpoint: "removeIcecreamOrder",
      guards: "[Admin]",
      verdicts: ["yes", "ask", "yes"],
    },
  ];
  const verdictView = {
    yes: <span className="font-semibold text-foreground">✓</span>,
    ask: (
      <span className="whitespace-nowrap rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning sm:text-xs">
        {l.trans({ en: "asks first", ko: "먼저 묻기" })}
      </span>
    ),
    off: (
      <span className="whitespace-nowrap text-[11px] text-foreground/40 sm:text-xs">
        —<span className="max-sm:sr-only"> {l.trans({ en: "not on the shelf", ko: "목록에 없음" })}</span>
      </span>
    ),
  };
  return (
    <div className={cn("jelly-glass overflow-hidden rounded-3xl", className)}>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-foreground/10 border-b font-mono text-[10px] text-foreground/50 uppercase tracking-[0.15em] sm:text-[11px]">
            <th className="py-3 pr-1 pl-4 font-normal sm:px-6">{l.trans({ en: "Action", ko: "동작" })}</th>
            {audiences.map(({ label, short }) => (
              <th key={label} className="px-1 py-3 text-center font-normal sm:px-4">
                <span className="sm:hidden">{short}</span>
                <span className="max-sm:hidden">{label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ action, endpoint, guards, verdicts }) => (
            <tr key={endpoint} className="border-foreground/5 border-b last:border-b-0">
              <td className="py-3.5 pr-1 pl-4 sm:px-6">
                <p className="font-semibold">{action}</p>
                <p className="mt-0.5 duet-agent:hidden font-mono text-[10px] text-foreground/45 sm:text-[11px]">
                  {endpoint}
                </p>
                <p className="mt-0.5 duet-agent:block hidden font-mono text-[10px] text-primary sm:text-[11px]">
                  guards: {guards}
                </p>
              </td>
              {verdicts.map((verdict, idx) => (
                <td key={audiences[idx].label} className="px-1 py-3.5 text-center sm:px-4">
                  {verdictView[verdict]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
