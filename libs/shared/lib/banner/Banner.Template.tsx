"use client";
import { cnst, fetch, st, usePage } from "@libs/shared/client";
import { Field } from "@libs/shared/ui";
import { Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const bannerForm = st.use.bannerForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("banner.category")}
        desc={l("banner.category.desc")}
        value={bannerForm.category}
        onChange={st.do.setCategoryOnBanner}
      />
      <Field.Text
        label={l("banner.title")}
        desc={l("banner.title.desc")}
        value={bannerForm.title}
        onChange={st.do.setTitleOnBanner}
      />
      <Field.Text
        label={l("banner.content")}
        desc={l("banner.content.desc")}
        value={bannerForm.content}
        onChange={st.do.setContentOnBanner}
      />
      <Field.Img
        label={l("banner.image")}
        desc={l("banner.image.desc")}
        slice={fetch.slice.banner}
        value={bannerForm.image}
        onChange={st.do.setImageOnBanner}
      />
      <Field.Text
        label={l("banner.href")}
        desc={l("banner.href.desc")}
        value={bannerForm.href}
        onChange={st.do.setHrefOnBanner}
      />
      <Field.ToggleSelect
        label={l("banner.target")}
        desc={l("banner.target.desc")}
        value={bannerForm.target}
        items={cnst.BannerTarget}
        onChange={(target) => {
          st.do.setTargetOnBanner(target);
        }}
      />
      <Field.Date
        label={l("banner.from")}
        desc={l("banner.from.desc")}
        value={bannerForm.from}
        onChange={st.do.setFromOnBanner}
        showTime
      />
      <Field.Date
        label={l("banner.to")}
        desc={l("banner.to.desc")}
        value={bannerForm.to}
        onChange={st.do.setToOnBanner}
        showTime
      />
    </Layout.Template>
  );
};
