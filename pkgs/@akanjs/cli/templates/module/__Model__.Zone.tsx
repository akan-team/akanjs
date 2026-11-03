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
  const card = {
    tag: `${Model}.Unit.Card`,
    attrs: [`key={${model}.id}`, `href={\`/${model}/\${${model}.id}\`}`, `${model}={${model}}`],
  };
  const units = {
    tag: "Load.Units",
    attrs: ["className={className}", "init={init}", { name: "renderItem", param: model, body: card }],
  };
  const view = {
    tag: "Load.View",
    attrs: [
      "view={view}",
      { name: "renderView", param: model, body: { tag: `${Model}.View.General`, attrs: [`${model}={${model}}`] } },
    ],
  };
  return {
    filename: `${Model}.Zone.tsx`,
    content: `"use client";
${BiomeForm.importFrom(["type cnst", Model], `@${dict.sysType}s/${dict.sysName}/client`)}
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
${BiomeForm.typeArgs("  ", "init: ClientInit", [`"${model}"`, `cnst.Light${Model}`], ";")}
  slice?: SliceMeta;
}
export const Card = ({ className, init, slice }: CardProps) => {
${BiomeForm.returnElement(units, "  ")}
};

interface ViewProps {
  className?: string;
${BiomeForm.typeArgs("  ", "view: ClientView", [`"${model}"`, `cnst.${Model}`], ";")}
}
export const View = ({ view }: ViewProps) => {
${BiomeForm.returnElement(view, "  ")}
};
`,
  };
}
