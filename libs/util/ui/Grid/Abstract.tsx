import { clsx } from "@akanjs/client";

interface AbstractProps {
  className?: string;
  children: any;
}
export const Abstract = ({ className, children }: AbstractProps) => {
  return (
    <div
      className={clsx(
        "hover:z-20 hover:scale-105",
        className
        // "group-data-[open=true]/gridunit:hidden"
      )}
    >
      {children}
    </div>
  );
};
