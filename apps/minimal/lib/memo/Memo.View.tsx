import { type cnst, usePage } from "@apps/minimal/client";
import { cn } from "akanjs/client";
import { Image } from "akanjs/ui";

interface GeneralProps {
  className?: string;
  memo: cnst.Memo;
}
export const General = ({ className, memo }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div>
        {l("memo.name")}: {memo.name}
      </div>
      {memo.hasImage() ? (
        <Image src={memo.imageUrl} alt={memo.name} width={320} height={320} className="rounded-box object-contain" />
      ) : null}
    </div>
  );
};
