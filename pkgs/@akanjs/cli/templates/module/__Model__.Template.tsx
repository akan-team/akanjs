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
  const field = {
    tag: "Field.Text",
    attrs: [`label={l("${model}.name")}`, `value={${model}Form.name}`, `onChange={st.do.setNameOn${Model}}`],
  };
  return {
    filename: `${Model}.Template.tsx`,
    content: `"use client";
${BiomeForm.importFrom(["st", "usePage"], `@${dict.sysType}s/${dict.sysName}/client`)}
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
${BiomeForm.assign("  ", `const ${model}Form`, `st.use.${model}Form`, [], ";")}
  return (
    <Layout.Template className={className}>
${BiomeForm.element(field, "      ")}
    </Layout.Template>
  );
};
`,
  };
}
