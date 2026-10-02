import { usePage } from "@apps/akan/client";
import { Friend } from "./Friend";
import { JellyStar } from "./JellyStar";

export const JellyChatIntro = () => {
  const { l } = usePage();
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="relative size-24">
        <JellyStar motion="breathe" />
        <span className="jelly-float absolute -top-3 -right-8 block [--float-duration:4.6s] [--float-tilt:9deg]">
          <Friend className="size-12" name="comet" />
        </span>
      </div>
      <p className="font-black text-foreground text-lg tracking-tight">
        {l.trans({ en: "Ask the docs anything.", ko: "문서에 무엇이든 물어보세요." })}
      </p>
      <p className="max-w-64 text-foreground/50 text-xs leading-5">{l("base.agentIntro")}</p>
    </div>
  );
};
