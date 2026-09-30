import { type cnst, usePage } from "@apps/minimal/client";
import type { ModelProps } from "akanjs/client";
import { Image, Link } from "akanjs/ui";

export const Card = ({ memo, href }: ModelProps<"memo", cnst.LightMemo>) => {
  const { l } = usePage();
  return (
    <Link href={href} className="flex w-full items-center gap-3 rounded-box bg-muted p-3">
      {memo.hasImage() ? (
        <Image
          src={memo.imageUrl}
          alt={memo.name}
          width={48}
          height={48}
          className="size-12 rounded-field object-cover"
        />
      ) : null}
      <div>
        {l("memo.name")}: {memo.name}
      </div>
    </Link>
  );
};
