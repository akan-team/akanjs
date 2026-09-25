import { clsx } from "akanjs/client";

interface TitleProps {
  children: any;
  className?: string;
  direction?: "left" | "right";
}
export const Title = ({ children, className, direction = "right" }: TitleProps) => {
  return (
    <div
      className={clsx("relative z-10", {
        "md:ml-4 md:text-left": direction === "right",
        "md:mr-4 md:text-right": direction === "left",
      })}
    >
      <h1
        className={`ml-6 pt-10 pb-6 font-bold text-3xl leading-relaxed underline decoration-8 decoration-primary underline-offset-4 md:ml-0 ${className}`}
      >
        {children}
      </h1>
      <div
        className={clsx("absolute bottom-[30px] left-[-16px] z-10 size-8 rounded-full border-8 border-primary", {
          "bg-slate-700 md:left-[-52px]": direction === "right",
          "bg-slate-800 md:right-[-52px] md:left-auto": direction === "left",
        })}
      />
    </div>
  );
};
