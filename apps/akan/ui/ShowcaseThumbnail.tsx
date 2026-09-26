import { cn } from "akanjs/client";
import type { ReactNode } from "react";

export type ShowcaseMotif = "arena" | "market" | "booking" | "agent" | "telemetry" | "docs" | "queue" | "board";
export type ShowcaseTone = "primary" | "accent" | "info" | "success" | "warning" | "secondary";

const toneClassName: { [key in ShowcaseTone]: string } = {
  primary: "from-primary/25 text-primary",
  accent: "from-accent/25 text-accent",
  info: "from-info/25 text-info",
  success: "from-success/25 text-success",
  warning: "from-warning/25 text-warning",
  secondary: "from-secondary/30 text-muted-foreground",
} as const;

interface BlockProps {
  className?: string;
  x: number;
  y: number;
  w: number;
  h?: number;
  r?: number;
  opacity?: number;
}
const Block = ({ className = "fill-foreground/20", x, y, w, h = 5, r, opacity }: BlockProps) => (
  <rect x={x} y={y} width={w} height={h} rx={r ?? h / 2} opacity={opacity} className={className} />
);

const gridPath = [
  ...[40, 80, 120, 160, 200, 240, 280].map((x) => `M${x} 0V200`),
  ...[40, 80, 120, 160].map((y) => `M0 ${y}H320`),
].join("");
const chartPoints = "44,138 68,124 92,130 116,102 140,110 164,82 188,90 204,66";
const frame = <Block x={28} y={20} w={264} h={160} r={14} className="fill-background/80 stroke-foreground/10" />;

const motifArt: { [key in ShowcaseMotif]: ReactNode } = {
  arena: (
    <g>
      <Block x={36} y={20} w={248} h={160} r={16} className="fill-background/70 stroke-foreground/10" />
      <Block x={64} y={48} w={44} h={26} r={6} className="fill-foreground/10" />
      <Block x={200} y={126} w={52} h={30} r={6} className="fill-foreground/10" />
      <circle cx={160} cy={100} r={62} strokeDasharray="6 6" className="fill-none stroke-current" opacity={0.5} />
      <path d="M70 160C90 150 96 132 112 124" strokeDasharray="3 5" className="fill-none stroke-current" />
      <circle cx={112} cy={124} r={16} className="fill-current" opacity={0.15} />
      <g className="fill-current">
        <circle cx={112} cy={124} r={6} />
        <circle cx={208} cy={78} r={6} />
        <circle cx={236} cy={110} r={6} />
      </g>
      <g className="fill-foreground/50">
        <circle cx={132} cy={48} r={5} />
        <circle cx={172} cy={150} r={5} />
      </g>
    </g>
  ),
  market: (
    <g>
      {frame}
      <Block x={44} y={34} w={120} h={14} className="fill-foreground/5 stroke-foreground/10" />
      <circle cx={54} cy={41} r={3.5} strokeWidth={1.5} className="fill-none stroke-current" />
      <Block x={232} y={34} w={44} h={14} className="fill-current" opacity={0.8} />
      {[44, 122, 200].flatMap((x, col) =>
        [60, 118].map((y, row) => (
          <g key={`${x}-${y}`}>
            <Block x={x} y={y} w={76} h={52} r={8} className="fill-foreground/5" />
            <Block x={x} y={y} w={76} h={30} r={8} className="fill-current" opacity={0.15 + ((col + row) % 3) * 0.12} />
            <Block x={x + 8} y={y + 37} w={36} className="fill-foreground/25" />
            <Block x={x + 52} y={y + 36} w={16} h={7} className="fill-current" opacity={0.8} />
          </g>
        )),
      )}
    </g>
  ),
  booking: (
    <g>
      <Block x={32} y={36} w={150} h={128} r={12} className="fill-background/70 stroke-foreground/10" />
      <Block x={44} y={48} w={126} h={10} className="fill-current" opacity={0.3} />
      <g strokeWidth={12} strokeDasharray="12 7" className="stroke-foreground/10">
        <path d="M44 76H170M44 98H170M44 120H170M44 142H170" />
      </g>
      <Block x={82} y={92} w={12} h={12} r={3} className="fill-current" />
      <Block x={120} y={114} w={12} h={12} r={3} className="fill-current" opacity={0.6} />
      <Block x={196} y={16} w={96} h={168} r={18} className="fill-background stroke-foreground/20" />
      <Block x={228} y={24} w={32} h={6} className="fill-foreground/15" />
      {[44, 108, 140].map((y) => (
        <Block key={y} x={208} y={y} w={72} h={24} r={7} className="fill-foreground/10" />
      ))}
      <Block x={208} y={76} w={72} h={24} r={7} className="fill-current" />
      <Block x={150} y={112} w={112} h={28} r={9} className="fill-background stroke-current" />
      <circle cx={165} cy={126} r={6} className="fill-current" />
      <Block x={178} y={120} w={60} h={4} className="fill-foreground/40" />
      <Block x={178} y={129} w={40} h={4} className="fill-foreground/20" />
    </g>
  ),
  agent: (
    <g>
      {frame}
      {[40, 78, 116].map((y) => (
        <Block key={y} x={44} y={y} w={48} className="fill-foreground/25" />
      ))}
      <Block x={44} y={50} w={120} h={18} r={6} className="fill-foreground/5 stroke-foreground/15" />
      <Block x={44} y={126} w={120} h={18} r={6} className="fill-foreground/5 stroke-foreground/15" />
      <Block x={44} y={88} w={120} h={18} r={6} className="fill-current" opacity={0.1} />
      <Block x={44} y={88} w={120} h={18} r={6} className="fill-none stroke-current" />
      <Block x={52} y={95} w={60} h={4} className="fill-current" />
      <Block x={44} y={154} w={52} h={16} r={6} className="fill-current" />
      <path d="M180 32V168" className="stroke-foreground/10" />
      <Block x={196} y={36} w={80} h={20} r={9} className="fill-foreground/10" />
      <Block x={192} y={64} w={76} h={30} r={9} className="fill-current" opacity={0.25} />
      <Block x={212} y={102} w={64} h={20} r={9} className="fill-foreground/10" />
      <path d="M200 142h.01M210 142h.01M220 142h.01" strokeWidth={6} strokeLinecap="round" className="stroke-current" />
      <path d="M170 83l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z" className="fill-current" />
      <path d="M150 96v17l4.6-4.2 3 6.8 3.2-1.4-3-6.6H164z" className="fill-current stroke-background" />
    </g>
  ),
  telemetry: (
    <g>
      {frame}
      <Block x={44} y={34} w={36} h={12} className="fill-current" opacity={0.3} />
      <Block x={86} y={34} w={56} h={12} className="fill-foreground/10" />
      <path d="M44 70H204M44 100H204M44 130H204M44 160H204" strokeDasharray="2 4" className="stroke-foreground/10" />
      <path d={`M44 160L${chartPoints}L204 160Z`} className="fill-current" opacity={0.15} />
      <polyline points={chartPoints} strokeWidth={2.5} strokeLinejoin="round" className="fill-none stroke-current" />
      <circle cx={204} cy={66} r={9} className="fill-current" opacity={0.25} />
      <circle cx={204} cy={66} r={4} className="fill-current" />
      <g strokeWidth={6} strokeLinecap="round" className="fill-none">
        <circle cx={248} cy={72} r={18} className="stroke-foreground/10" />
        <circle cx={248} cy={132} r={18} className="stroke-foreground/10" />
        <path d="M248 54A18 18 0 1 1 230.6 76.7M248 114A18 18 0 0 1 252.4 149.5" className="stroke-current" />
      </g>
    </g>
  ),
  docs: (
    <g>
      {frame}
      <path d="M28 44H292M104 44V180" className="stroke-foreground/10" />
      <circle cx={44} cy={32} r={5} className="fill-current" />
      <Block x={56} y={29} w={40} h={6} className="fill-foreground/30" />
      <Block x={196} y={26} w={84} h={12} className="fill-foreground/5 stroke-foreground/15" />
      <circle cx={206} cy={32} r={3} strokeWidth={1.5} className="fill-none stroke-current" />
      <Block x={34} y={81} w={64} h={15} r={5} className="fill-current" opacity={0.12} />
      {[58, 72, 100, 114, 128, 142].map((y) => (
        <Block key={y} x={40} y={y} w={y % 3 ? 50 : 36} className="fill-foreground/15" />
      ))}
      <Block x={40} y={86} w={50} className="fill-current" />
      <Block x={118} y={58} w={110} h={10} className="fill-foreground/40" />
      <Block x={118} y={112} w={158} h={50} r={8} className="fill-foreground/5 stroke-foreground/10" />
      <circle cx={270} cy={164} r={11} className="fill-current" />
      <g strokeLinecap="round" strokeWidth={5}>
        <path d="M120 80H272M120 90H256M120 100H212" strokeWidth={4} className="stroke-foreground/15" />
        <path d="M131 126H149M131 138H149M131 150H149" className="stroke-current" opacity={0.7} />
        <path d="M159 126H223M159 138H203M159 150H243" className="stroke-foreground/25" />
        <path d="M265 164h.01M270 164h.01M275 164h.01" strokeWidth={3} className="stroke-background" />
      </g>
    </g>
  ),
  queue: (
    <g>
      <Block x={32} y={28} w={150} h={144} r={16} className="fill-background/80 stroke-foreground/10" />
      <Block x={48} y={44} w={64} h={6} className="fill-foreground/25" />
      <text x={107} y={112} textAnchor="middle" fontSize={46} className="fill-current font-black font-mono">
        042
      </text>
      <Block x={48} y={134} w={118} h={22} r={8} className="fill-current" opacity={0.15} />
      <Block x={58} y={142} w={50} h={6} className="fill-current" />
      {[43, 44, 45].map((ticket, idx) => (
        <g key={ticket} transform={`translate(198 ${36 + idx * 46})`} opacity={1 - idx * 0.25}>
          <Block x={0} y={0} w={90} h={36} r={8} className="fill-background/80 stroke-foreground/15" />
          <path d="M28 4V32" strokeDasharray="3 3" className="stroke-foreground/25" />
          <circle cx={14} cy={18} r={6} className="fill-current" opacity={0.6} />
          <text x={38} y={24} fontSize={16} className="fill-foreground/70 font-bold font-mono">{`0${ticket}`}</text>
        </g>
      ))}
    </g>
  ),
  board: (
    <g>
      {frame}
      <Block x={38} y={32} w={176} h={26} r={8} className="fill-current" opacity={0.12} />
      {[0, 1, 2, 3, 4].map((idx) => (
        <g key={idx} transform={`translate(0 ${36 + idx * 28})`}>
          <circle cx={52} cy={9} r={7} className="fill-current" opacity={idx ? 0.25 : 1} />
          <circle cx={74} cy={9} r={8} className="fill-foreground/20" />
          <Block x={88} y={6} w={56 - idx * 4} h={6} className="fill-foreground/30" />
          <Block x={160} y={6} w={44 - idx * 6} h={6} className="fill-current" opacity={0.9 - idx * 0.15} />
        </g>
      ))}
      <path d="M218 160H288" className="stroke-foreground/20" />
      <Block x={222} y={96} w={18} h={64} r={4} className="fill-current" opacity={0.55} />
      <Block x={244} y={72} w={18} h={88} r={4} className="fill-current" />
      <Block x={266} y={116} w={18} h={44} r={4} className="fill-current" opacity={0.3} />
      <path d="M253 53l2 4.5 5 .5-3.8 3.3 1.1 4.9-4.3-2.4-4.3 2.4 1.1-4.9-3.8-3.3 5-.5z" className="fill-current" />
    </g>
  ),
};

interface ShowcaseThumbnailProps {
  className?: string;
  motif: ShowcaseMotif;
  tone?: ShowcaseTone;
}
export const ShowcaseThumbnail = ({ className, motif, tone = "primary" }: ShowcaseThumbnailProps) => {
  return (
    <div
      className={cn(
        "relative aspect-16/10 w-full overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/5 bg-linear-to-br via-transparent to-transparent",
        toneClassName[tone],
        className,
      )}
    >
      <div className="absolute -top-16 -right-16 size-56 rounded-full bg-current opacity-15 blur-3xl" />
      <svg viewBox="0 0 320 200" className="absolute inset-0 size-full" aria-hidden>
        <path d={gridPath} className="stroke-foreground/5" />
        {motifArt[motif]}
      </svg>
    </div>
  );
};
