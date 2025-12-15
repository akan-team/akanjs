"use client";
import { Layout } from "@akanjs/ui";
import { st, usePage } from "@shared/client";

interface NotificationEditProps {
  className?: string;
}

export const General = ({ className }: NotificationEditProps) => {
  const notificationForm = st.use.notificationForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      {/* <Field label={l("modelName.fieldName")} desc={l("modelName.fieldName.desc")} /> */}
    </Layout.Template>
  );
};
