import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";

interface VideoSlotProps {
  className?: string;
  title: string;
  shot: string;
  length: string;
  src?: string;
}
export const VideoSlot = ({ className, title, shot, length, src }: VideoSlotProps) => {
  const { l } = usePage();
  return (
    <figure className={cn("overflow-hidden rounded-2xl border border-foreground/10 bg-card/50", className)}>
      <div className="relative aspect-video overflow-hidden bg-background">
        {src ? (
          <video className="size-full object-cover" src={src} autoPlay muted loop playsInline />
        ) : (
          <>
            <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,var(--color-foreground)_0_1px,transparent_1px_18px)] opacity-[0.06]" />
            <div className="crop-marks marks-primary absolute inset-5" />
            <p className="absolute top-8 left-9 flex items-center gap-2 font-mono text-[11px] text-primary uppercase tracking-[0.25em]">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              rec
            </p>
            <p className="absolute top-8 right-9 font-mono text-[11px] text-foreground/45 tracking-[0.2em]">
              00:{length}
            </p>
            <div className="absolute inset-0 grid place-items-center px-10 text-center">
              <div>
                <p className="font-mono text-foreground/40 text-xs uppercase tracking-[0.3em]">
                  {l.trans({ en: "Recording soon", ko: "촬영 예정" })}
                </p>
                <p className="mt-3 font-semibold text-lg sm:text-xl">{title}</p>
              </div>
            </div>
          </>
        )}
      </div>
      <figcaption className="flex items-start gap-3 p-5">
        <span className="mt-1 font-mono text-[11px] text-primary">▶</span>
        <span className="text-foreground/65 text-sm leading-6">{shot}</span>
      </figcaption>
    </figure>
  );
};
