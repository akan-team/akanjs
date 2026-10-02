import { cn } from "akanjs/client";
import { Clipboard } from "akanjs/ui";

const installCommand = "bunx create-akan-workspace@latest";

interface InstallCommandProps {
  className?: string;
}
export const InstallCommand = ({ className }: InstallCommandProps) => {
  return (
    <div
      className={cn(
        "jelly-glass inline-flex max-w-full items-center gap-3 rounded-full py-1.5 pr-1.5 pl-5 font-mono text-sm",
        className,
      )}
    >
      <span className="select-none text-primary">$</span>
      <span className="truncate text-foreground/80">{installCommand}</span>
      <Clipboard className="relative shrink-0" text={installCommand} />
    </div>
  );
};
