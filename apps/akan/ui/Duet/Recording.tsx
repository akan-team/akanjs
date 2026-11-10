import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { InViewVideo } from "../InViewVideo";
import { CueSync } from "./CueSync";

interface RecordingCue {
  start: number;
  end: number;
  text: string;
}

interface RecordingProps {
  className?: string;
  src: string;
  compactSrc?: string;
  poster?: string;
  isRealtime?: boolean;
  cues?: RecordingCue[];
}
export const Recording = ({ className, src, compactSrc, poster, isRealtime = true, cues }: RecordingProps) => {
  const { l } = usePage();
  const video = (
    <InViewVideo className="aspect-video w-full object-cover" compactSrc={compactSrc} poster={poster} src={src} />
  );
  return (
    <figure
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-2xl shadow-black/10",
        className,
      )}
    >
      {cues ? (
        <CueSync>
          {video}
          <ol className="pointer-events-none absolute inset-x-0 bottom-[2.5%] grid place-items-center px-4">
            {cues.map(({ start, end, text }) => (
              <li
                key={start}
                data-cue-start={start}
                data-cue-end={end}
                className="hidden rounded-full bg-background/90 px-3 py-1 font-bold text-[11px] text-foreground starting:opacity-0 transition-opacity duration-300 [grid-area:1/1] data-active:block sm:px-4 sm:py-1.5 sm:text-sm"
              >
                {text}
              </li>
            ))}
          </ol>
        </CueSync>
      ) : (
        video
      )}
      {isRealtime ? (
        <figcaption className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 font-mono text-[11px] text-foreground/80 tracking-[0.12em]">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          {l.trans({ en: "1× · real time, not sped up", ko: "1× · 실제 속도, 배속 없음" })}
        </figcaption>
      ) : null}
    </figure>
  );
};
