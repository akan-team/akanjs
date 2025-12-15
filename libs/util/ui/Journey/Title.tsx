import { clsx } from "@akanjs/client";

interface TitleProps {
  children: any;
  className?: string;
  direction?: "left" | "right";
}
export const Title = ({ children, className, direction = "right" }: TitleProps) => {
  return (
    <div
      className={clsx("relative z-10", {
        "md:text-left md:ml-4": direction === "right",
        "md:text-right md:mr-4": direction === "left",
      })}
    >
      <h1
        className={`decoration-primary ml-6 pb-6 pt-10 text-3xl font-bold leading-relaxed underline decoration-8 underline-offset-4 md:ml-0 ${className}`}
      >
        {children}
      </h1>
      <div
        className={clsx("border-primary absolute bottom-[30px] left-[-16px] z-10 size-8 rounded-full border-8", {
          "md:left-[-52px] bg-slate-700": direction === "right",
          "md:left-auto md:right-[-52px] bg-slate-800": direction === "left",
        })}
      />
    </div>
  );
};
