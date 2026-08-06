"use client";
import { Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  return (
    <Layout.Template className={className}>
      {/* <Field label={l("modelName.fieldName")} desc={l("modelName.fieldName.desc")} /> */}
    </Layout.Template>
  );
};
