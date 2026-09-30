"use client";
import { fetch, st, usePage } from "@apps/minimal/client";
import { buttonRecipe, Model } from "akanjs/ui";
import { BiImageAdd, BiTrash } from "react-icons/bi";

interface RemoveProps {
  memoId: string;
}
export const Remove = ({ memoId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={memoId} slice={fetch.slice.memo}>
      <BiTrash /> {l("base.remove")}
    </Model.Remove>
  );
};

interface AttachImageProps {
  memoId: string;
}
export const AttachImage = ({ memoId }: AttachImageProps) => {
  const { l } = usePage();
  return (
    <label className={buttonRecipe({ variant: "outline" })}>
      <BiImageAdd /> {l("memo.imageUrl")}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void st.do.attachMemoImage(memoId, files);
        }}
      />
    </label>
  );
};
