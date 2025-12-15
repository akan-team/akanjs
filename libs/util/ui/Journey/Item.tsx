import { clsx } from "@akanjs/client";

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
        className={clsx("border-primary absolute left-[-28px] top-[4px] z-10 size-4 rounded-full border-2", {
          "md:left-auto md:right-[-28px] bg-slate-700": direction === "right",
          "md:left-[-28px] bg-slate-800": direction === "left",
        })}
      />
      {children}
    </div>
  );
};
