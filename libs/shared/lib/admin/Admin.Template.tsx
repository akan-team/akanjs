"use client";
import { Layout } from "@akanjs/ui";
import { st, usePage } from "@shared/client";
import { Field } from "@shared/ui";

interface AdminEditProps {
  className?: string;
}

export const General = ({ className }: AdminEditProps) => {
  const adminForm = st.use.adminForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("admin.accountId")}
        desc={l("admin.accountId.desc")}
        value={adminForm.accountId}
        onChange={st.do.setAccountIdOnAdmin}
      />
    </Layout.Template>
  );
};
