import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
  sysType: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model, model } = dict;
  const remove = { tag: "Model.Remove", attrs: [`modelId={${model}Id}`, `slice={fetch.slice.${model}}`] };
  return {
    filename: `${Model}.Util.tsx`,
    content: `"use client";
${BiomeForm.importFrom(["fetch", "usePage"], `@${dict.sysType}s/${dict.sysName}/client`)}
import { Model } from "akanjs/ui";
import { BiTrash } from "react-icons/bi";

interface RemoveProps {
  ${model}Id: string;
}
export const Remove = ({ ${model}Id }: RemoveProps) => {
  const { l } = usePage();
  return (
${BiomeForm.openingTag(remove, "    ")}
      <BiTrash /> {l("base.remove")}
    </Model.Remove>
  );
};
`,
  };
}
