import { cn } from "akanjs/client";
import { BuildStage } from "./BuildStage";

const chapterTimeline = ["build-chapter-1", "build-chapter-2", "build-chapter-3", "build-chapter-4"] as const;
const chapterTint = ["tint-jelly", "tint-moon", "tint-planet", "tint-comet"] as const;
const tagTint = ["text-primary", "text-warning", "text-planet", "text-comet"] as const;

interface BuildChapter {
  numeral: string;
  tag: string;
  title: string;
  body: string;
}

interface SkyBuildProps {
  className?: string;
  chapters: BuildChapter[];
}
export const SkyBuild = ({ className, chapters }: SkyBuildProps) => {
  return (
    <section className={cn("build-scope relative pb-[24svh]", className)}>
      <div className="relative mx-auto w-full max-w-7xl px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 lg:left-1/2">
          <div className="sticky top-[var(--akanjs-header-offset)] flex h-[42svh] items-center justify-center lg:h-[calc(100svh-var(--akanjs-header-offset))]">
            <BuildStage className="w-[min(80vw,36svh)] lg:w-[min(34rem,calc(100svh-var(--akanjs-header-offset)-5rem))]" />
          </div>
        </div>
        {chapters.map((chapter, idx) => (
          <article
            className="chapter-fade relative grid min-h-[100svh] grid-rows-[1fr_auto] pb-[6svh] lg:w-1/2 lg:grid-rows-1 lg:items-center lg:pr-14 lg:pb-0"
            key={chapter.numeral}
          >
            <span className={cn("pointer-events-none absolute inset-0", chapterTimeline[idx])} />
            <div className="row-start-2 lg:row-start-1">
              <p
                className={cn(
                  "jelly-text w-fit pr-2 font-black text-6xl leading-none tracking-[-0.06em] sm:text-8xl lg:text-9xl",
                  chapterTint[idx],
                )}
              >
                {chapter.numeral}
              </p>
              <p className={cn("mt-4 font-bold text-sm uppercase tracking-[0.18em]", tagTint[idx])}>{chapter.tag}</p>
              <h2 className="mt-3 font-black text-3xl sm:text-4xl lg:text-5xl">{chapter.title}</h2>
              <p className="mt-4 max-w-xl text-[15px] text-foreground/65 leading-7 sm:text-lg sm:leading-8">
                {chapter.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
