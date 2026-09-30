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
        "inline-flex max-w-full items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/5 py-2 pr-2 pl-4 font-mono text-sm",
        className,
      )}
    >
      <span className="select-none text-primary">$</span>
      <span className="truncate text-foreground/80">{installCommand}</span>
      <Clipboard className="relative shrink-0" text={installCommand} />
    </div>
  );
};
