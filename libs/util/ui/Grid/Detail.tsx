import { clsx } from "akanjs/client";

interface DetailProps {
  className?: string;
  children: any;
}
export const Detail = ({ className, children }: DetailProps) => {
  return (
    <div className={clsx(className, "absolute inset-0 m-auto bg-background group-data-[open=false]/gridunit:hidden")}>
      {children}
    </div>
  );
};
