import { usePage } from "@apps/akan/client";
import { Docs, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const components: UiComponentReference[] = [
    {
      name: "Link",
      desc: l.trans({
        en: "Route-aware navigation component. It renders CSR or SSR navigation depending on the Akan render mode, and falls back to a non-clickable div when disabled or href is empty.",
        ko: "Route-aware navigation component입니다. Akan render mode에 따라 CSR 또는 SSR navigation을 렌더링하고, disabled이거나 href가 비어 있으면 클릭할 수 없는 div로 대체합니다.",
      }),
      props: [
        {
          name: "href",
          type: "string | null",
          desc: l.trans({
            en: "Destination route. Empty values render children without navigation.",
            ko: "이동할 route입니다. 값이 비어 있으면 navigation 없이 children만 렌더링합니다.",
          }),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: l.trans({
            en: "Prevents navigation while keeping the same visual layout.",
            ko: "같은 visual layout을 유지하면서 navigation을 막습니다.",
          }),
        },
        {
          name: "activeClassName",
          type: "string",
          desc: l.trans({
            en: "Class applied when the current route matches the link.",
            ko: "현재 route가 link와 일치할 때 적용되는 class입니다.",
          }),
        },
        {
          name: "scrollToTop",
          type: "boolean",
          desc: l.trans({
            en: "Scrolls to the top after client-side navigation.",
            ko: "client-side navigation 이후 화면을 상단으로 스크롤합니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: "Namespace helpers: `Link.Back`, `Link.Close`, and `Link.Lang` cover common navigation actions.",
          ko: "Namespace helper인 `Link.Back`, `Link.Close`, `Link.Lang`은 자주 쓰이는 navigation action을 다룹니다.",
        }),
      ],
      code: `import { Link } from "akanjs/ui";

export const ProductUnit = ({ product }) => (
  <Link href={\`/products/\${product.id}\`} className="block rounded-xl border p-4" activeClassName="border-primary">
    {product.name}
  </Link>
);`,
    },
    {
      name: "Image",
      desc: l.trans({
        en: "Akan image component for `ProtoFile` objects and direct URLs. It can derive width, height, and blur data from file metadata and uses the Akan image optimizer in SSR mode.",
        ko: "`ProtoFile` 객체와 직접 URL을 모두 받는 Akan image component입니다. file metadata에서 width, height, blur data를 가져올 수 있고 SSR mode에서는 Akan image optimizer를 사용합니다.",
      }),
      props: [
        {
          name: "src",
          type: "string",
          desc: l.trans({
            en: "Direct image URL. Takes precedence over file metadata.",
            ko: "직접 지정하는 image URL입니다. file metadata보다 우선합니다.",
          }),
        },
        {
          name: "file",
          type: "ProtoFile | file-like",
          desc: l.trans({
            en: "File object with `url`, `imageSize`, and optional `abstractData`.",
            ko: "`url`, `imageSize`, optional `abstractData`를 가진 file 객체입니다.",
          }),
        },
        {
          name: "abstractData",
          type: "string",
          desc: l.trans({ en: "Blur/placeholder preview data.", ko: "blur/placeholder preview data입니다." }),
        },
        {
          name: "priority / preload",
          type: "boolean",
          desc: l.trans({
            en: "Marks the image as high-priority and eager-loaded.",
            ko: "image를 high-priority 및 eager-loaded 대상으로 표시합니다.",
          }),
        },
        {
          name: "unoptimized",
          type: "boolean",
          desc: l.trans({
            en: "Skips Akan image optimization.",
            ko: "Akan image optimization을 건너뜁니다.",
          }),
        },
      ],
      code: `import { Image } from "akanjs/ui";

export const Avatar = ({ user }) => (
  <Image file={user.profileImage} alt={user.nickname} width={48} height={48} className="rounded-full" />
);`,
    },
    {
      name: "Layout",
      desc: l.trans({
        en: "Namespace of lightweight layout primitives used throughout module templates, units, views, headers, sidebars, bottom tabs, and zones.",
        ko: "module template, unit, view, header, sidebar, bottom tab, zone 전반에서 사용하는 가벼운 layout primitive namespace입니다.",
      }),
      props: [
        {
          name: "Layout.Template",
          type: "{ className?, children? }",
          desc: l.trans({
            en: "Vertical form/template container with default spacing.",
            ko: "기본 간격이 있는 세로 form/template container입니다.",
          }),
        },
        {
          name: "Layout.Unit",
          type: "{ className?, children, href? }",
          desc: l.trans({
            en: "List/card item container that becomes clickable when href is provided.",
            ko: "href가 제공되면 클릭 가능한 list/card item container입니다.",
          }),
        },
        {
          name: "Layout.View",
          type: "{ className?, children }",
          desc: l.trans({ en: "Constrained detail page container.", ko: "폭이 제한된 detail page container입니다." }),
        },
        {
          name: "Layout.Zone",
          type: "component",
          desc: l.trans({
            en: "Section container for feature zones and page blocks.",
            ko: "feature zone과 page block을 위한 section container입니다.",
          }),
        },
      ],
      code: `import { Layout } from "akanjs/ui";

export const ProductTemplate = ({ children }) => (
  <Layout.Template>
    {children}
  </Layout.Template>
);

export const ProductUnit = ({ product }) => (
  <Layout.Unit href={\`/products/\${product.id}\`}>
    <div className="font-bold">{product.name}</div>
  </Layout.Unit>
);`,
    },
    {
      name: "Load",
      desc: l.trans({
        en: "Namespace for data loading bridges between Akan fetch results and React rendering. It is commonly used for model detail pages, edit pages, pagination, and server/client page loading.",
        ko: "Akan fetch 결과와 React rendering을 연결하는 data loading namespace입니다. model detail page, edit page, pagination, server/client page loading에 자주 사용됩니다.",
      }),
      props: [
        {
          name: "Load.View",
          type: "{ view, renderView, loading?, noDiv? }",
          desc: l.trans({
            en: "Hydrates a full model view and renders it through `renderView`.",
            ko: "full model view를 hydrate하고 `renderView`로 렌더링합니다.",
          }),
        },
        {
          name: "Load.Edit",
          type: "component",
          desc: l.trans({
            en: "Loads edit payloads for model edit/new workflows.",
            ko: "model edit/new workflow를 위한 edit payload를 로드합니다.",
          }),
        },
        {
          name: "Load.Page",
          type: "{ loader, render, loading?, noCache? }",
          desc: l.trans({
            en: "Shared SSR/CSR page loader wrapper.",
            ko: "SSR/CSR에서 함께 사용하는 page loader wrapper입니다.",
          }),
        },
        {
          name: "Load.Units",
          type: "component",
          desc: l.trans({
            en: "Renders list/unit data from pagination-style results.",
            ko: "pagination-style 결과에서 list/unit data를 렌더링합니다.",
          }),
        },
      ],
      code: `import { Load } from "akanjs/ui";

export default function ProductPage({ view }) {
  return (
    <Load.View
      view={view}
      renderView={(product) => <ProductView product={product} />}
    />
  );
}`,
    },
    {
      name: "Model",
      desc: l.trans({
        en: "Namespace of model workflow shells for generated Akan stores: view wrappers, edit/new modals, removal flows, and admin panels.",
        ko: "generated Akan store를 위한 model workflow shell namespace입니다. view wrapper, edit/new modal, removal flow, admin panel을 포함합니다.",
      }),
      props: [
        {
          name: "Model.EditModal",
          type: "{ slice, edit?, renderTitle?, onSubmit? }",
          desc: l.trans({
            en: "Modal editing shell wired to generated model store actions.",
            ko: "generated model store action과 연결된 modal editing shell입니다.",
          }),
        },
        {
          name: "Model.NewWrapper",
          type: "component",
          desc: l.trans({
            en: "Wrapper for opening and initializing a new-model form.",
            ko: "새 model form을 열고 초기화하는 wrapper입니다.",
          }),
        },
        {
          name: "Model.ViewWrapper",
          type: "component",
          desc: l.trans({
            en: "Wrapper for rendering full model view state.",
            ko: "full model view state를 렌더링하는 wrapper입니다.",
          }),
        },
        {
          name: "Model.Remove",
          type: "component",
          desc: l.trans({
            en: "Removal action connected to generated delete flows.",
            ko: "generated delete flow와 연결된 removal action입니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: "Use `Model` components inside module `Util`, `View`, or `Zone` files where generated store actions are already available.",
          ko: "generated store action을 사용할 수 있는 module `Util`, `View`, `Zone` 파일 안에서 `Model` component를 사용합니다.",
        }),
      ],
      code: `import { Model } from "akanjs/ui";

export const ProductEdit = ({ productEdit, slice }) => (
  <Model.EditModal slice={slice} edit={productEdit} renderTitle="Edit product">
    <ProductTemplate />
  </Model.EditModal>
);`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="core-ui" title={l.trans({ en: "Core UI", ko: "Core UI" })}>
        <Docs.Title>{l.trans({ en: "Core UI", ko: "Core UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Core UI components are the most common `akanjs/ui` imports in apps and libs. They compose routing, images, layout containers, fetch loading, and model store workflows.",
              ko: "Core UI component는 apps/libs에서 가장 자주 import되는 `akanjs/ui` 요소입니다. routing, image, layout container, fetch loading, model store workflow를 조합합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {components.map((component) => (
        <UiComponentSlide key={component.name} component={component} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
