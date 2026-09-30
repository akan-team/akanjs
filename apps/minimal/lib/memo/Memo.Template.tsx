"use client";
import { st, usePage } from "@apps/minimal/client";
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const memoForm = st.use.memoForm();
  return (
    <Layout.Template className={className}>
      <Field.Text label={l("memo.name")} value={memoForm.name} onChange={st.do.setNameOnMemo} />
    </Layout.Template>
  );
};
