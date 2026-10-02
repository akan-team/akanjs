import type { ReactNode } from "react";
import { KoyoOrder } from "./KoyoOrder";
import { KoyoScript } from "./koyoScript.util";
import { Phone } from "./Phone";
import { AgentPointer, HumanPointer } from "./Pointer";
import { Story } from "./Story";

interface ScreenStoryProps {
  className?: string;
  header: ReactNode;
  steps: ReactNode[];
}
export const ScreenStory = ({ className, header, steps }: ScreenStoryProps) => {
  const { css, still } = KoyoScript.story();
  return (
    <Story
      id="screen"
      timeline="screen"
      className={className}
      css={css}
      still={still}
      header={header}
      steps={steps}
      stage={
        <div className="relative max-lg:[zoom:0.6]">
          <div className="pointer-events-none absolute inset-x-[8%] -bottom-5 -z-10 h-10 rounded-full bg-black/20 blur-xl dark:bg-black/60" />
          <Phone>
            <KoyoOrder>
              <span className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px translate-y-[calc(var(--duet-scan)*37rem)] bg-primary opacity-[calc(var(--duet-xray)*clamp(0,min(var(--duet-scan),1_-_var(--duet-scan))*30,1))] shadow-[0_0_14px_2px_var(--color-primary)]" />
              <AgentPointer />
              <HumanPointer />
            </KoyoOrder>
          </Phone>
        </div>
      }
    />
  );
};
