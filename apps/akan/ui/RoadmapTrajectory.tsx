import { cn } from "akanjs/client";

interface Point {
  x: number;
  y: number;
}

interface RoadmapWaypoint {
  key: string;
  label: string;
  caption: string;
  state: "flown" | "current" | "committed" | "proposed";
}

const sampleNum = 240;
const control = [
  { x: 110, y: 500 },
  { x: 110, y: 170 },
  { x: 520, y: 60 },
  { x: 1150, y: 48 },
] as const;

const bezierAt = (t: number): Point => {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: a * control[0].x + b * control[1].x + c * control[2].x + d * control[3].x,
    y: a * control[0].y + b * control[1].y + c * control[2].y + d * control[3].y,
  };
};

const samples = Array.from({ length: sampleNum + 1 }, (_, idx) => bezierAt(idx / sampleNum));
const distances = samples.map(() => 0);
samples.forEach((point, idx) => {
  if (idx) distances[idx] = distances[idx - 1] + Math.hypot(point.x - samples[idx - 1].x, point.y - samples[idx - 1].y);
});
const totalDistance = distances[sampleNum];

const locate = (fraction: number) => {
  const target = fraction * totalDistance;
  const idx = Math.max(
    1,
    distances.findIndex((distance) => distance >= target),
  );
  const [from, to] = [samples[idx - 1], samples[idx]];
  const ratio = (target - distances[idx - 1]) / (distances[idx] - distances[idx - 1] || 1);
  const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return { point, angle, idx };
};

const pathOf = (points: Point[]) =>
  points.map((point, idx) => `${idx ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

let starSeed = 20260925;
const nextRandom = () => {
  starSeed = (starSeed * 16807) % 2147483647;
  return starSeed / 2147483647;
};
const stars = Array.from({ length: 90 }, (_, idx) => ({
  x: nextRandom() * 1200,
  y: nextRandom() * 520,
  r: 0.5 + nextRandom() * 1.4,
  twinkle: idx % 9 === 0,
}));

const dotClassName = {
  flown: "fill-primary",
  current: "fill-primary",
  committed: "fill-background stroke-2 stroke-primary",
  proposed: "fill-background stroke-2 stroke-foreground/35",
} as const;

const labelClassName = {
  flown: "fill-foreground/80",
  current: "fill-primary",
  committed: "fill-foreground",
  proposed: "fill-foreground/55",
} as const;

interface RoadmapTrajectoryProps {
  className?: string;
  waypoints: RoadmapWaypoint[];
}
export const RoadmapTrajectory = ({ className, waypoints }: RoadmapTrajectoryProps) => {
  const fractionOf = (idx: number) => 0.04 + (idx * 0.9) / Math.max(1, waypoints.length - 1);
  const currentIdx = Math.max(
    0,
    waypoints.findIndex((waypoint) => waypoint.state === "current"),
  );
  const current = locate(fractionOf(currentIdx));
  const flownPath = pathOf([...samples.slice(0, current.idx), current.point]);
  const futurePath = pathOf([current.point, ...samples.slice(current.idx)]);
  let horizontalNum = 0;
  const placed = waypoints.map((waypoint, idx) => {
    const { point, angle } = locate(fractionOf(idx));
    const isVertical = Math.abs(Math.sin((angle * Math.PI) / 180)) > 0.7;
    const isAbove = !isVertical && horizontalNum++ % 2 === 0;
    return { waypoint, point, isVertical, isAbove };
  });

  return (
    <svg
      viewBox="0 0 1200 520"
      className={cn("h-auto w-full overflow-visible", className)}
      role="img"
      aria-label={waypoints.map((waypoint) => waypoint.label).join(" → ")}
    >
      <defs>
        <filter id="akan-roadmap-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {stars.map((star, idx) => (
        <circle key={idx} cx={star.x} cy={star.y} r={star.r} className="fill-foreground/25">
          {star.twinkle ? (
            <animate attributeName="opacity" values="0.2;1;0.2" dur={`${3 + (idx % 4)}s`} repeatCount="indefinite" />
          ) : null}
        </circle>
      ))}
      <line x1="40" y1="506" x2="300" y2="506" className="stroke-2 stroke-foreground/20" />
      <rect x="96" y="500" width="28" height="6" rx="1" className="fill-foreground/30" />
      <path d={futurePath} className="fill-none stroke-2 stroke-foreground/25 [stroke-dasharray:4_10]" />
      <path d={flownPath} className="fill-none stroke-[10] stroke-primary/40" filter="url(#akan-roadmap-glow)" />
      <path d={flownPath} className="fill-none stroke-3 stroke-primary" />
      <circle r="4" className="fill-primary">
        <animateMotion dur="4s" repeatCount="indefinite" path={flownPath} />
      </circle>
      <circle r="3" className="fill-foreground/50">
        <animateMotion dur="16s" repeatCount="indefinite" path={futurePath} />
      </circle>
      {placed.map(({ waypoint, point, isVertical, isAbove }) => (
        <g key={waypoint.key}>
          {waypoint.state === "current" ? (
            <circle cx={point.x} cy={point.y} r="10" className="fill-none stroke-2 stroke-primary">
              <animate attributeName="r" values="10;30" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
          ) : (
            <circle cx={point.x} cy={point.y} r="6" className={dotClassName[waypoint.state]} />
          )}
          <g className={cn("max-md:hidden", labelClassName[waypoint.state])}>
            <text
              x={isVertical ? point.x + 22 : point.x}
              y={isVertical ? point.y - 2 : isAbove ? point.y - 32 : point.y + 30}
              textAnchor={isVertical ? "start" : "middle"}
              className={cn("font-bold font-mono", waypoint.state === "current" ? "text-[17px]" : "text-[13px]")}
            >
              {waypoint.label}
            </text>
            <text
              x={isVertical ? point.x + 22 : point.x}
              y={isVertical ? point.y + 15 : isAbove ? point.y - 16 : point.y + 46}
              textAnchor={isVertical ? "start" : "middle"}
              className="text-[11px] opacity-70"
            >
              {waypoint.caption}
            </text>
          </g>
        </g>
      ))}
      <g transform={`translate(${current.point.x} ${current.point.y}) rotate(${current.angle + 90})`}>
        <path d="M-4 9 L0 24 L4 9 Z" className="fill-primary">
          <animate attributeName="opacity" values="1;0.4;1" dur="0.35s" repeatCount="indefinite" />
        </path>
        <path d="M-6 2 L-12 13 L-6 10 Z M6 2 L12 13 L6 10 Z" className="fill-primary" />
        <path d="M0 -20 C7 -13 8 -2 6 10 L-6 10 C-8 -2 -7 -13 0 -20 Z" className="fill-foreground" />
        <circle cx="0" cy="-6" r="2.6" className="fill-primary" />
      </g>
    </svg>
  );
};
