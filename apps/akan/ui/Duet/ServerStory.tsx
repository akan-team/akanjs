import type { ReactNode } from "react";
import { McpStage } from "./McpStage";
import { McpScript } from "./mcpScript.util";
import { Story } from "./Story";

interface ServerStoryProps {
  className?: string;
  header: ReactNode;
  steps: ReactNode[];
}
export const ServerStory = ({ className, header, steps }: ServerStoryProps) => {
  const { css, still } = McpScript.story();
  return (
    <Story
      id="server"
      timeline="server"
      className={className}
      css={css}
      still={still}
      header={header}
      steps={steps}
      stage={<McpStage className="max-lg:[zoom:0.64]" />}
    />
  );
};
