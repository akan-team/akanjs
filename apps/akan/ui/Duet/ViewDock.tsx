import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";

interface ViewDockProps {
  className?: string;
}
export const ViewDock = ({ className }: ViewDockProps) => {
  const { l } = usePage();
  return (
    <div
      className={cn(
        "pointer-events-none sticky bottom-4 z-40 flex h-0 items-end justify-end px-4 sm:bottom-6 sm:px-6",
        className,
      )}
    >
      <div
        role="radiogroup"
        aria-label={l.trans({ en: "See the screens as", ko: "화면을 보는 눈" })}
        className="dock-reveal jelly-glass pointer-events-auto inline-flex rounded-full p-1 font-bold text-xs"
      >
        <label
          htmlFor="duet-human"
          className="has-checked:jelly has-checked:tint-foreground flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1 text-foreground/55 transition has-checked:text-background has-focus-visible:ring-2 has-focus-visible:ring-primary sm:px-3.5 sm:py-1.5"
        >
          <input id="duet-human" type="radio" name="duet-view" defaultChecked className="sr-only" />
          <span className="size-1.5 rounded-full bg-current" />
          <span className="sm:hidden">{l.trans({ en: "Human", ko: "사람" })}</span>
          <span className="max-sm:hidden">{l.trans({ en: "Human view", ko: "사람의 눈" })}</span>
        </label>
        <label
          htmlFor="duet-agent"
          className="has-checked:jelly has-checked:tint-primary flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1 text-foreground/55 transition has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-primary sm:px-3.5 sm:py-1.5"
        >
          <input id="duet-agent" type="radio" name="duet-view" className="sr-only" />
          <span className="size-1.5 rounded-full bg-current" />
          <span className="sm:hidden">{l.trans({ en: "Agent", ko: "에이전트" })}</span>
          <span className="max-sm:hidden">{l.trans({ en: "Agent view", ko: "에이전트의 눈" })}</span>
        </label>
      </div>
    </div>
  );
};
