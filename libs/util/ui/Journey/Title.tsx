import { cn } from "akanjs/client";

interface TitleProps {
  children: any;
  className?: string;
  direction?: "left" | "right";
}
export const Title = ({ children, className, direction = "right" }: TitleProps) => {
  return (
    <div
      className={cn(
        "relative z-10",
        direction === "right" && "md:ml-4 md:text-left",
        direction === "left" && "md:mr-4 md:text-right",
      )}
    >
      <h1
        className={`ml-6 pt-10 pb-6 font-bold text-3xl leading-relaxed underline decoration-8 decoration-primary underline-offset-4 md:ml-0 ${className}`}
      >
        {children}
      </h1>
      <div
        className={cn(
          "absolute bottom-[30px] left-[-16px] z-10 size-8 rounded-full border-8 border-primary",
          direction === "right" && "bg-secondary md:left-[-52px]",
          direction === "left" && "bg-secondary md:right-[-52px] md:left-auto",
        )}
      />
    </div>
  );
};
