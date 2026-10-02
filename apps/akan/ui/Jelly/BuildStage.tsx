import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { Duet } from "../Duet";
import { Friend } from "./Friend";
import { JellyStar } from "./JellyStar";

const layers = [
  { name: "ui", className: "tint-comet text-white", order: "[--i:0]" },
  { name: "state", className: "tint-jelly text-white", order: "[--i:1]" },
  { name: "type", className: "tint-warning text-black/70", order: "[--i:2]" },
  { name: "fetch", className: "tint-moon text-black/70", order: "[--i:3]" },
  { name: "api", className: "tint-rocket text-black/70", order: "[--i:4]" },
  { name: "service", className: "tint-success text-white", order: "[--i:5]" },
  { name: "query", className: "tint-planet text-white", order: "[--i:6]" },
  { name: "schema", className: "tint-cloud text-white", order: "[--i:7]" },
] as const;

const platformSlots = [
  "top-[41%] left-[1%]",
  "top-[56%] left-[1%]",
  "top-[71%] left-[1%]",
  "top-[41%] right-[1%]",
  "top-[56%] right-[1%]",
  "top-[71%] right-[1%]",
] as const;

const platformOrder = ["[--i:0]", "[--i:1]", "[--i:2]", "[--i:3]", "[--i:4]", "[--i:5]"] as const;

const platformThreads = [
  "M20 44.5H27",
  "M20 59.5H27",
  "M20 74.5H27",
  "M73 44.5H80",
  "M73 59.5H80",
  "M73 74.5H80",
] as const;

interface BuildStageProps {
  className?: string;
}
export const BuildStage = ({ className }: BuildStageProps) => {
  const { l } = usePage();
  const platforms = [l.trans({ en: "Web", ko: "웹" }), "iOS", "Android", "macOS", "Windows", "Linux"];
  return (
    <div aria-hidden="true" className={cn("@container relative aspect-square", className)}>
      <svg className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
        {platformThreads.map((d, idx) => (
          <path
            className={cn(
              "cosmos-thread build-on-3 stroke-foreground/35 [--build-motion:build-fade]",
              platformOrder[idx],
            )}
            d={d}
            fill="none"
            key={d}
          />
        ))}
        <path
          className="cosmos-thread build-on-4 stroke-foreground/35 [--build-motion:build-fade]"
          d="M20 15Q30 12 38 17"
          fill="none"
        />
        <path
          className="cosmos-thread build-on-4 stroke-comet/70 [--build-motion:build-fade]"
          d="M79 15Q70 12 62 17"
          fill="none"
        />
      </svg>

      <div className="build-on-4 absolute top-[0.5%] left-[32%] aspect-square w-[36%] rounded-full border-2 border-primary/45 border-dashed" />
      <div className="absolute top-[-3.5%] left-1/2 -translate-x-1/2">
        <p className="build-on-4 jelly tint-primary rounded-full px-[2.2cqw] py-[0.6cqw] font-bold font-mono text-[2.6cqw] text-primary-foreground [--i:1]">
          guards
        </p>
      </div>

      <div className="build-on-1 absolute top-[5%] left-[38%] w-[24%]">
        <JellyStar motion="breathe" />
      </div>
      <div className="absolute top-[30.5%] left-1/2 -translate-x-1/2">
        <p className="build-on-1 jelly-glass whitespace-nowrap rounded-full px-[2.6cqw] py-[1cqw] font-mono text-[3.2cqw] [--i:2]">
          <span className="text-foreground">name</span>
          <span className="text-foreground/40">: </span>
          <span className="text-primary">field</span>
          <span className="text-foreground/40">(</span>
          String
          <span className="text-foreground/40">)</span>
        </p>
      </div>

      <div className="build-on-2 absolute top-[37%] bottom-[15%] left-1/2 w-[1.4%] origin-top -translate-x-1/2 rounded-full bg-primary/70 shadow-[0_0_14px_2px_var(--color-primary)] [--build-motion:build-grow]" />
      <ul className="absolute top-[40%] right-[27%] bottom-[15%] left-[27%] flex flex-col justify-between">
        {layers.map((layer) => (
          <li
            className={cn(
              "build-on-2 jelly flex h-[11%] items-center rounded-[2cqw] px-[3cqw] font-bold font-mono text-[2.8cqw] [--build-motion:build-drop]",
              layer.className,
              layer.order,
            )}
            key={layer.name}
          >
            {layer.name}
          </li>
        ))}
      </ul>

      {platforms.map((platform, idx) => (
        <p
          className={cn(
            "build-on-3 jelly-glass absolute w-[19%] rounded-full py-[1cqw] text-center font-bold text-[2.9cqw]",
            platformSlots[idx],
            platformOrder[idx],
          )}
          key={platform}
        >
          {platform}
        </p>
      ))}

      <div className="build-on-4 absolute top-[7%] left-[4%] flex flex-col items-center gap-[1cqw]">
        <Duet.HumanArrow className="h-[7cqw] w-[4.6cqw]" />
        <span className="font-bold text-[2.8cqw] text-foreground/70">{l.trans({ en: "people", ko: "사람" })}</span>
      </div>
      <div className="build-on-4 absolute top-[2%] right-[2%] flex flex-col items-center gap-[0.4cqw] [--i:1]">
        <Friend className="size-[13cqw] max-w-none" name="comet" />
        <span className="font-bold text-[2.8cqw] text-comet">{l.trans({ en: "agents", ko: "에이전트" })}</span>
      </div>
    </div>
  );
};
