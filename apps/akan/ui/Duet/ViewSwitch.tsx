import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";

interface ViewSwitchProps {
  className?: string;
}
export const ViewSwitch = ({ className }: ViewSwitchProps) => {
  const { l } = usePage();
  return (
    <div className={cn("flex flex-col items-center gap-2.5", className)}>
      <div
        role="radiogroup"
        aria-label={l.trans({ en: "See the screens as", ko: "화면을 보는 눈" })}
        className="inline-flex rounded-full border border-foreground/15 bg-background/70 p-1 font-mono text-[11px] backdrop-blur"
      >
        <label
          htmlFor="duet-human"
          className="has-checked:jelly has-checked:tint-foreground flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-foreground/55 transition has-checked:text-background has-focus-visible:ring-2 has-focus-visible:ring-primary"
        >
          <input id="duet-human" type="radio" name="duet-view" defaultChecked className="sr-only" />
          <span className="size-1.5 rounded-full bg-current" />
          {l.trans({ en: "Human view", ko: "사람의 눈" })}
        </label>
        <label
          htmlFor="duet-agent"
          className="has-checked:jelly has-checked:tint-primary flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-foreground/55 transition has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-primary"
        >
          <input id="duet-agent" type="radio" name="duet-view" className="sr-only" />
          <span className="size-1.5 rounded-full bg-current" />
          {l.trans({ en: "Agent view", ko: "에이전트의 눈" })}
        </label>
      </div>
      <p className="min-h-4 text-center font-mono duet-agent:text-primary text-[11px] text-foreground/40">
        <span className="duet-agent:hidden">
          {l.trans({
            en: "Flip it — the screens on this page have a second face.",
            ko: "눌러 보세요. 이 페이지의 화면들에는 얼굴이 하나 더 있습니다.",
          })}
        </span>
        <span className="duet-agent:inline hidden">
          {l.trans({
            en: "What a model reads: tools and their arguments, not pixels.",
            ko: "모델이 읽는 화면입니다. 픽셀이 아니라 도구와 인자를 봅니다.",
          })}
        </span>
      </p>
    </div>
  );
};
