import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function UnitDocsPage() {
  const { l } = usePage();
  const loadUnitsStateItems: IntroItem[] = [
    {
      name: "<model>List<Suffix>",
      desc: l.trans({
        en: "The hydrated list rendered by Load.Units. This is the current visible list state.",
        ko: "Load.Units가 hydrate한 list입니다. 현재 화면에 보이는 list state입니다.",
      }),
      example: "articleListInProject: new DataList()",
    },
    {
      name: "<model>InitList<Suffix>",
      desc: l.trans({
        en: "The first list snapshot from the server init object. It is useful for reset or comparison flows.",
        ko: "server init object에서 받은 최초 list snapshot입니다. reset이나 비교 흐름에 사용할 수 있습니다.",
      }),
      example: "articleInitListInProject: new DataList()",
    },
    {
      name: "<model>InitAt<Suffix>",
      desc: l.trans({
        en: "Timestamp for when the server initialized the list.",
        ko: "server가 list를 initialize한 시각입니다.",
      }),
      example: "articleInitAtInProject: dayjs()",
    },
    {
      name: "<model>ListLoading<Suffix>",
      desc: l.trans({
        en: "Marks the list as ready after hydration.",
        ko: "hydration 이후 list가 준비되었음을 표시합니다.",
      }),
      example: "articleListLoadingInProject: false",
    },
    {
      name: "<model>Insight<Suffix>",
      desc: l.trans({
        en: "Insight data returned with the slice, such as count or summary values.",
        ko: "slice와 함께 반환된 insight data입니다. count나 summary 값을 담습니다.",
      }),
      example: "articleInsightInProject: new cnst.ArticleInsight()",
    },
    {
      name: "st.pageOf<Model><Suffix> / st.lastPageOf<Model><Suffix> / st.limitOf<Model><Suffix>",
      desc: l.trans({
        en: "Pagination state hydrated from the init object.",
        ko: "init object에서 hydrate되는 pagination state입니다.",
      }),
      example: "pageOfArticleInProject: 1\nlastPageOfArticleInProject: 10\nlimitOfArticleInProject: 10",
    },
    {
      name: "st.queryArgsOf<Model><Suffix>",
      desc: l.trans({
        en: "The current query arguments used to load the slice.",
        ko: "slice를 load할 때 사용한 현재 query argument입니다.",
      }),
      example: 'queryArgsOfArticleInProject: [{ title: "Article" }]',
    },
    {
      name: "st.sortOf<Model><Suffix>",
      desc: l.trans({
        en: "The current sort value used to load the slice.",
        ko: "slice를 load할 때 사용한 현재 sort 값입니다.",
      }),
      example: 'sortOfArticleInProject: "latest"',
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="unit-overview" title="Model.Unit.tsx">
        <Docs.Title>Model.Unit.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Unit file contains reusable renderers for one model item or one list/table representation. Common exports are cards, compact rows, avatars, gallery tiles, and column helpers.",
              ko: "Unit 파일은 model item 하나 또는 list/table 표현 하나를 렌더링하는 재사용 renderer를 담습니다. 흔한 export는 card, compact row, avatar, gallery tile, column helper입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Units are usually presentational. They may include thin UI actions such as edit buttons, but forms belong in Template files and larger interactions belong in Util or Store.",
              ko: "Unit은 보통 presentational component입니다. edit button 같은 얇은 UI action은 포함할 수 있지만 form은 Template에, 더 큰 interaction은 Util 또는 Store에 둡니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="modelprops-light"
        title={l.trans({ en: "ModelProps And Light Models", ko: "ModelProps와 Light model" })}
      >
        <Docs.Title>{l.trans({ en: "ModelProps And Light Models", ko: "ModelProps와 Light model" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use ModelProps to type the model prop, href, className, and common interaction props. Unit components usually receive Light models because they are rendered repeatedly in lists.",
              ko: "ModelProps로 model prop, href, className, 공통 interaction prop을 type 처리합니다. Unit component는 list에서 반복 렌더링되므로 보통 Light model을 받습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Article.Unit.tsx"
          code={`import { type ModelProps, clsx } from "akanjs/client";
import { Layout } from "akanjs/ui";

export const Card = ({ article, className, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <Layout.Unit className={clsx("rounded-lg border", className)} href={href}>
      <div className="font-bold">{article.title}</div>
      <div className="text-base-content/70">{article.summary}</div>
    </Layout.Unit>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="unit-variants" title={l.trans({ en: "Unit Variants", ko: "Unit variant" })}>
        <Docs.Title>{l.trans({ en: "Unit Variants", ko: "Unit variant" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A single Unit file can export several display shapes for the same model. Name them by usage: Card for normal cards, Mini for compact rows, Abstract for feed/list summaries, Gallery for image grids.",
              ko: "하나의 Unit 파일은 같은 model에 대한 여러 display shape를 export할 수 있습니다. 일반 card는 Card, compact row는 Mini, feed/list summary는 Abstract, image grid는 Gallery처럼 용도에 맞게 이름 붙입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Units are server components by default, so avoid putting browser events such as onClick directly in the Unit. Move interactive behavior into a small Util component, such as Article.Util.Remove, and compose it from the Unit.",
              ko: "Unit은 기본적으로 server component이므로 onClick 같은 browser event를 Unit에 직접 두는 것을 권장하지 않습니다. interactive 기능은 Article.Util.Remove 같은 작은 Util component로 분리한 뒤 Unit에서 조합합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Article.Unit.tsx"
          code={`interface MiniProps extends ModelProps<"article", cnst.LightArticle> {}

export const Mini = ({ article, className, href }: MiniProps) => (
  <div className={clsx("flex items-center gap-2", className)}>
    <Link href={href}>{article.title}</Link>
    <Article.Util.Remove article={article} />
  </div>
);`}
        />
        <Code.Snippet
          title="Article.Unit.tsx"
          code={`export const Gallery = ({ article, href }: ModelProps<"article", cnst.LightArticle>) => (
  <Link href={href} className="overflow-hidden rounded-md border">
    <Image src={article.cover.url} width={320} height={200} />
    <div>{article.title}</div>
  </Link>
);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="actions-inside-units" title={l.trans({ en: "Actions Inside Units", ko: "Unit 안의 action" })}>
        <Docs.Title>{l.trans({ en: "Actions Inside Units", ko: "Unit 안의 action" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Units may show small UI actions such as remove, copy, or detail buttons. Keep the Unit thin: render a small Util component for the browser behavior, while forms and async workflows stay outside the Unit.",
              ko: "Unit은 remove, copy, detail button 같은 작은 UI action을 보여줄 수 있습니다. Unit은 얇게 유지하고 browser 동작은 작은 Util component로 렌더링하며, form과 async workflow는 Unit 밖에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Article.Unit.tsx"
          code={`<Layout.Unit className="relative rounded-lg border">
  <div>{article.title}</div>
  <div className="absolute top-2 right-2">
    <Article.Util.Remove article={article} />
  </div>
</Layout.Unit>`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="loadunits-direct-rendering"
        title={l.trans({ en: "Load.Units And Direct Rendering", ko: "Load.Units와 직접 렌더링" })}
      >
        <Docs.Title>{l.trans({ en: "Load.Units And Direct Rendering", ko: "Load.Units와 직접 렌더링" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Load.Units when a slice manages loading, pagination, refresh, and empty states. If the page already has an array, render Units directly with map, which is common in server-rendered pages.",
              ko: "slice가 loading, pagination, refresh, empty state를 관리해야 하면 Load.Units를 사용합니다. page가 이미 배열을 가지고 있다면 map으로 Unit을 직접 렌더링하며, server-rendered page에서 자주 쓰입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Load.Units also hydrates slice state into the client store so generated pagination, query, sort, refresh, and insight helpers can keep working after the first render.",
              ko: "Load.Units는 slice state를 client store에 hydrate해서 첫 렌더링 이후에도 generated pagination, query, sort, refresh, insight helper가 계속 동작할 수 있게 합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="hidden overflow-x-auto lg:block">
          <table className="table w-full table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[30%]" />
              <col className="w-[40%]" />
            </colgroup>
            <thead>
              <tr className="bg-base-200">
                <th className="text-base-content">field</th>
                <th className="text-base-content">{l.trans({ en: "Description", ko: "설명" })}</th>
                <th className="text-base-content">{l.trans({ en: "Example", ko: "예제" })}</th>
              </tr>
            </thead>
            <tbody>
              {loadUnitsStateItems.map((item, index) => (
                <tr key={index}>
                  <td className="wrap-break-word align-top font-mono">{item.name}</td>
                  <td className="align-top leading-relaxed" style={{ whiteSpace: "pre-line" }}>
                    {item.desc}
                  </td>
                  <td className="align-top">
                    <Code.Raw language="typescript" showLineNumbers={false} code={item.example as string} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4 lg:hidden">
          {loadUnitsStateItems.map((item, index) => (
            <div key={index} className="rounded-lg bg-base-100 p-3">
              <div className="mb-2">
                <span className="block font-bold font-mono text-primary">{item.name}</span>
              </div>
              <p className="mb-3 text-base-content text-sm leading-relaxed" style={{ whiteSpace: "pre-line" }}>
                {item.desc}
              </p>
              <Code.Raw language="typescript" code={item.example as string} />
            </div>
          ))}
        </div>
        <Code.Snippet
          title="Load.Units"
          code={`<Load.Units
  init={articleInit}
  renderEmpty={() => <Model.NewWrapper slice={fetch.slice.article}>+ New</Model.NewWrapper>}
  renderItem={(article) => <Article.Unit.Card key={article.id} article={article} />}
/>`}
        />
        <Code.Snippet
          title="Direct SSR rendering"
          code={`<div className="flex flex-col gap-2">
  {articleList.map((article) => (
    <Article.Unit.Card key={article.id} href={"/article/" + article.id} article={article} />
  ))}
</div>`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Use Light models for lists and repeated Unit rendering.",
                ko: "list와 반복 Unit 렌더링에는 Light model을 사용합니다.",
              }),
              l.trans({
                en: "Accept className and href when the Unit may be reused in different layouts or links.",
                ko: "여러 layout이나 link에서 재사용될 수 있는 Unit은 className과 href를 받습니다.",
              }),
              l.trans({
                en: "Use clsx to merge caller styling with the Unit's base styling.",
                ko: "호출하는 쪽의 style과 Unit의 기본 style을 합칠 때 clsx를 사용합니다.",
              }),
              l.trans({
                en: "Prefer Layout.Unit or Link for clickable card/list containers.",
                ko: "클릭 가능한 card/list container에는 Layout.Unit 또는 Link를 우선 사용합니다.",
              }),
              l.trans({
                en: "Keep forms in Template and complex async interactions in Util or Store.",
                ko: "form은 Template에, 복잡한 async interaction은 Util 또는 Store에 둡니다.",
              }),
              l.trans({
                en: "Export variants by display purpose instead of adding many flags to one Card.",
                ko: "하나의 Card에 많은 flag를 추가하기보다 display 목적별 variant를 export합니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
