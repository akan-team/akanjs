import { cn } from "akanjs/client";
import { CosmosSky } from "./cosmos.util";

const dotTone = {
  glow: "fill-starlight",
  dust: "fill-stardust",
  planet: "fill-planet/60",
} as const;

const twinkleBeat = [
  "[--twinkle-delay:-0.3s] [--twinkle-duration:3.4s]",
  "[--twinkle-delay:-1.6s] [--twinkle-duration:4.6s]",
  "[--twinkle-delay:-2.9s] [--twinkle-duration:2.9s]",
  "[--twinkle-delay:-0.9s] [--twinkle-duration:5.2s]",
  "[--twinkle-delay:-3.8s] [--twinkle-duration:3.9s]",
] as const;

interface CosmosProps {
  className?: string;
}
export const Cosmos = ({ className }: CosmosProps) => {
  return (
    <div aria-hidden="true" className={cn("cosmos pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      <svg
        className="cosmos-far absolute inset-x-0 top-0 h-[112vh] w-full opacity-60"
        preserveAspectRatio="xMidYMid slice"
        viewBox={`0 0 ${CosmosSky.width} ${CosmosSky.height}`}
      >
        {CosmosSky.dots.map((dot) => (
          <circle
            className={cn(
              dotTone[dot.tone],
              dot.twinkle >= 0 && "cosmos-twinkle",
              dot.twinkle >= 0 && twinkleBeat[dot.twinkle],
            )}
            cx={dot.x}
            cy={dot.y}
            key={`${dot.x}-${dot.y}`}
            r={dot.r}
          />
        ))}
      </svg>
      <div className="cosmos-grain absolute inset-0" />
    </div>
  );
};
