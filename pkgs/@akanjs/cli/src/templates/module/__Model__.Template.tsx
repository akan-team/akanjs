/* eslint-disable @akanjs/lint/useClientByFile */
import type { AppInfo, LibInfo } from "@akanjs/devkit";

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
import { cnst, st, usePage } from "@${dict.sysName}/client";
import { Layout, Field } from "@akanjs/ui";

interface ${dict.Model}EditProps {
  className?: string;
}

export const General = ({ className }: ${dict.Model}EditProps) => {
  const ${dict.model}Form = st.use.${dict.model}Form();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("${dict.model}.id")}
        desc={l("${dict.model}.id.desc")}
        value={${dict.model}Form.id}
        onChange={st.do.setIdOn${dict.Model}}
      />
    </Layout.Template>
  );
};
`,
  };
}
