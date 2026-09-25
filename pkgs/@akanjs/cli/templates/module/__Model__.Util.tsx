import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
  sysType: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.Util.tsx`,
    content: `
"use client";
import { Model } from "akanjs/ui";
import { fetch, usePage } from "@${dict.sysType}s/${dict.sysName}/client";
import { BiTrash } from "react-icons/bi";

interface RemoveProps {
  ${dict.model}Id: string;
}
export const Remove = ({ ${dict.model}Id }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={${dict.model}Id} slice={fetch.slice["${dict.model}"]}>
      <BiTrash /> {l("base.remove")}
    </Model.Remove>
  );
};
`,
  };
}
