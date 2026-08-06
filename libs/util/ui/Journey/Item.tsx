import { cn } from "akanjs/client";

interface ItemProps {
  children: any;
  direction?: "left" | "right";
}
export const Item = ({ children, direction = "right" }: ItemProps) => {
  return (
    <div className={cn("relative mb-6", direction === "right" && "md:text-right", direction === "left" && "text-left")}>
      <div
        className={cn(
          "absolute top-[4px] left-[-28px] z-10 size-4 rounded-full border-2 border-primary",
          direction === "right" && "bg-secondary md:right-[-28px] md:left-auto",
          direction === "left" && "bg-secondary md:left-[-28px]",
        )}
      />
      {children}
    </div>
  );
};
