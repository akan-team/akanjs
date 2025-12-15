"use client";
import { Model } from "@akanjs/ui";
import { usePage } from "@shared/client";
import { BiTrash } from "react-icons/bi";

interface RemoveProps {
  bannerId: string;
}
export const Remove = ({ bannerId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={bannerId} sliceName="banner">
      <BiTrash /> {l("base.remove")}
    </Model.Remove>
  );
};
