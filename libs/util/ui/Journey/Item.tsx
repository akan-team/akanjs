import { clsx } from "akanjs/client";

interface ItemProps {
  children: any;
  direction?: "left" | "right";
}
export const Item = ({ children, direction = "right" }: ItemProps) => {
  return (
    <div
      className={clsx("relative mb-6", {
        "md:text-right": direction === "right",
        "text-left": direction === "left",
      })}
    >
      <div
        className={clsx("absolute top-[4px] left-[-28px] z-10 size-4 rounded-full border-2 border-primary", {
          "bg-slate-700 md:right-[-28px] md:left-auto": direction === "right",
          "bg-slate-800 md:left-[-28px]": direction === "left",
        })}
      />
      {children}
    </div>
  );
};
