"use client";
import { Layout } from "@akanjs/ui";
import { st, usePage } from "@shared/client";
import { Field } from "@shared/ui";

interface FileEditProps {
  className?: string;
}
export const General = ({ className }: FileEditProps) => {
  const fileForm = st.use.fileForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("file.filename")}
        desc={l("file.filename.desc")}
        value={fileForm.url}
        onChange={st.do.setUrlOnFile}
      />
    </Layout.Template>
  );
};
