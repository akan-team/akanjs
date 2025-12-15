/* eslint-disable @akanjs/lint/useClientByFile */
import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.Util.tsx`,
    content: `
"use client";
import { Model } from "@akanjs/ui";
import { usePage } from "@${dict.sysName}/client";
import { BiTrash } from "react-icons/bi";

interface RemoveProps {
  ${dict.model}Id: string;
}
export const Remove = ({ ${dict.model}Id }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={${dict.model}Id} sliceName="${dict.model}">
      <BiTrash /> {l("base.remove")}
    </Model.Remove>
  );
};
`,
  };
}
