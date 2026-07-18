import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.Template.tsx`,
    content: `
"use client";
import { Field, Layout } from "akanjs/ui";
import { st, usePage } from "@${scanInfo?.type ?? "apps"}/${dict.sysName}/client";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const ${dict.model}Form = st.use.${dict.model}Form();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("${dict.model}.name")}
        value={${dict.model}Form.name}
        onChange={st.do.setNameOn${dict.Model}}
      />
    </Layout.Template>
  );
};
`,
  };
}
