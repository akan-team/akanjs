import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type IntroItem, type MatrixGroup, type OptionItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "도메인: Model.Unit.tsx | Akan.js" : "Domain: Model.Unit.tsx | Akan.js";
    const description =
      lang === "ko"
        ? "Unit이 받는 light 모델과 변형, 그 안에서 하는 동작."
        : "The light model a Unit takes, its variants, and the actions inside it.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const bulletList = "my-4 list-disc space-y-2 pl-5";

    const termRows: IntroItem[] = [
      {
        name: "cnst.Light<Model>",
        desc: l.trans({
          en: "The slim version of a model: only the fields its constant picks for lists, plus display methods.",
          ko: "모델의 가벼운 버전입니다. constant가 목록용으로 고른 필드와 표시용 메서드만 가집니다.",
        }),
      },
      {
        name: <span className="font-sans">{l.trans({ en: "server component", ko: "서버 컴포넌트" })}</span>,
        desc: l.trans({
          en: 'A component without "use client". It becomes HTML on the server and ships no JavaScript.',
          ko: '"use client"가 없는 컴포넌트입니다. 서버에서 HTML이 되고, JavaScript는 브라우저로 가지 않습니다.',
        }),
      },
      {
        name: "slice",
        desc: l.trans({
          en: "A named list query such as `inProject`. Its name becomes the `<Suffix>` in generated names.",
          ko: "`inProject`처럼 이름이 붙은 목록 query입니다. 이 이름이 자동으로 생기는 이름 끝의 `<Suffix>` 자리에 들어갑니다.",
        }),
      },
      {
        name: "hydrate",
        desc: l.trans({
          en: "Putting data the server already loaded into the browser's store, so nothing is fetched twice.",
          ko: "서버가 이미 불러온 데이터를 브라우저의 store에 채우는 일입니다. 같은 데이터를 두 번 불러오지 않습니다.",
        }),
      },
    ];

    const ownerColumns = [
      { key: "unit", label: "Unit" },
      { key: "util", label: "Util" },
      { key: "template", label: "Template" },
      { key: "store", label: "Store" },
      { key: "page", label: "page" },
    ];
    const onlyIn = (key: string) => ({
      unit: false,
      util: false,
      template: false,
      store: false,
      page: false,
      [key]: true,
    });

    const ownerGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "What the Unit does itself", ko: "Unit이 직접 하는 일" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "Light model fields", ko: "Light 모델의 필드" })}</span>,
            desc: l.trans({
              en: "Title, status, dates: drawn as a card, a row or a tile.",
              ko: "제목, 상태, 날짜 같은 값을 카드, 행, 타일로 그립니다.",
            }),
            marks: onlyIn("unit"),
          },
          {
            name: "usePage · l()",
            desc: l.trans({
              en: "Translation works on the server, so labels need no client code.",
              ko: "번역은 서버에서도 되므로, 라벨 때문에 클라이언트 코드를 쓸 일이 없습니다.",
            }),
            marks: onlyIn("unit"),
          },
          {
            name: "Link · href",
            desc: l.trans({
              en: "Navigation belongs to the Unit; the caller decides where it goes.",
              ko: "이동은 Unit이 맡고, 어디로 갈지는 호출하는 쪽이 정합니다.",
            }),
            marks: onlyIn("unit"),
          },
        ],
      },
      {
        label: l.trans({ en: "What it hands to another file", ko: "다른 파일에 맡기는 일" }),
        rows: [
          {
            name: "onClick",
            desc: l.trans({
              en: "A thin action such as edit or remove is a Util that the Unit renders.",
              ko: "수정, 삭제 같은 작은 동작은 Unit이 렌더링하는 Util이 맡습니다.",
            }),
            marks: onlyIn("util"),
          },
          {
            name: "Field.*",
            desc: l.trans({
              en: "A form is a Template, never part of a list item.",
              ko: "폼은 Template이 맡고, 목록 항목 안에는 넣지 않습니다.",
            }),
            marks: onlyIn("template"),
          },
          {
            name: "st.use · st.do",
            desc: l.trans({
              en: "A larger interaction: a Util starts it and a store action runs it.",
              ko: "규모가 큰 상호작용은 Util이 시작하고 store 액션이 처리합니다.",
            }),
            marks: { unit: false, util: true, template: false, store: true, page: false },
          },
          {
            name: "fetch.*",
            desc: l.trans({
              en: "The page loads the data and hands each record to the Unit as a prop.",
              ko: "데이터는 page가 불러오고, 레코드를 하나씩 prop으로 Unit에 넘깁니다.",
            }),
            marks: onlyIn("page"),
          },
        ],
      },
    ];

    const modelPropsOptions: OptionItem[] = [
      {
        key: "article",
        type: "cnst.LightArticle",
        tags: [l.trans({ en: "required", ko: "필수" })],
        desc: l.trans({
          en: "The record to draw. The prop is named by the first type argument.",
          ko: "그릴 레코드입니다. prop 이름은 첫 번째 타입 인자가 정합니다.",
        }),
      },
      {
        key: "className",
        type: "string",
        desc: l.trans({
          en: "Extra classes from the caller. Merge them last with `cn`.",
          ko: "호출하는 쪽이 주는 추가 class입니다. `cn`으로 맨 뒤에 합칩니다.",
        }),
      },
      {
        key: "href",
        type: "string",
        desc: l.trans({
          en: "Where the Unit links to. Without it, `Layout.Unit` and `Link` render a plain `div`.",
          ko: "Unit이 연결할 주소입니다. 없으면 `Layout.Unit`과 `Link`는 평범한 `div`를 그립니다.",
        }),
      },
      {
        key: "onClick",
        type: "(model: L) => unknown",
        desc: l.trans({
          en: "A click callback that a client parent can pass.",
          ko: "클라이언트 부모가 넘길 수 있는 클릭 콜백입니다.",
        }),
      },
      {
        key: "slice",
        type: "SliceMeta",
        desc: l.trans({
          en: "The slice the list belongs to, passed by `Data.ListContainer`.",
          ko: "목록이 속한 slice입니다. `Data.ListContainer`가 넘깁니다.",
        }),
      },
      {
        key: "actions",
        type: "DataAction[]",
        desc: l.trans({
          en: "Row actions (`edit`, `view`, `remove` or an element), passed by `Data.ListContainer`.",
          ko: "행 동작(`edit`, `view`, `remove` 또는 요소)입니다. `Data.ListContainer`가 넘깁니다.",
        }),
      },
      {
        key: "columns",
        type: "DataColumn<L>[]",
        desc: l.trans({
          en: "Which fields to show, passed by `Data.ListContainer`.",
          ko: "보여 줄 필드 목록입니다. `Data.ListContainer`가 넘깁니다.",
        }),
      },
    ];

    const variantRows: IntroItem[] = [
      {
        name: "Card",
        desc: l.trans({
          en: "The normal card for lists and grids.",
          ko: "목록과 그리드에 쓰는 기본 카드입니다.",
        }),
      },
      {
        name: ["Mini", "Row"],
        desc: l.trans({
          en: "A compact row for dense lists. `Admin.Unit.Row` also carries its action buttons.",
          ko: "빽빽한 목록에 쓰는 한 줄짜리 행입니다. `Admin.Unit.Row`는 동작 버튼도 함께 둡니다.",
        }),
      },
      {
        name: "Abstract",
        desc: l.trans({
          en: "A short summary for feeds and list previews.",
          ko: "피드나 목록 미리보기에 쓰는 짧은 요약입니다.",
        }),
      },
      {
        name: "Gallery",
        desc: l.trans({
          en: "An image-first tile for image grids.",
          ko: "이미지 그리드에 쓰는, 이미지가 중심인 타일입니다.",
        }),
      },
      {
        name: "Avatar",
        desc: l.trans({
          en: "A small picture of the record, such as `User.Unit.Avatar`.",
          ko: "`User.Unit.Avatar`처럼 레코드를 작은 그림으로 보여 줍니다.",
        }),
      },
    ];

    const pathColumns = [
      { key: "holds", label: l.trans({ en: "The page holds", ko: "page가 가진 것" }) },
      { key: "render", label: l.trans({ en: "Render with", ko: "렌더링 방법" }), code: true },
      { key: "result", label: l.trans({ en: "What you get", ko: "결과" }) },
    ];
    const pathRows = [
      {
        holds: l.trans({ en: "`init` passed to a Zone", ko: "Zone에 넘긴 `init`" }),
        render: "Load.Units",
        result: l.trans({
          en: "Loading, pagination, refresh and empty states, plus a hydrated store.",
          ko: "로딩, 페이지 이동, 새로고침, 빈 화면을 처리하고 store도 hydrate합니다.",
        }),
      },
      {
        holds: l.trans({ en: "An awaited list", ko: "await한 목록" }),
        render: "list.map(…)",
        result: l.trans({
          en: "Plain server HTML in the first response. Common on server-rendered pages.",
          ko: "첫 응답에 들어가는 서버 HTML입니다. 서버에서 렌더링하는 page에서 흔히 씁니다.",
        }),
      },
      {
        holds: l.trans({ en: "The un-awaited `<model>List<Suffix>`", ko: "await하지 않은 `<model>List<Suffix>`" }),
        render: "Load.Stream",
        result: l.trans({
          en: "The list renders behind its own boundary instead of holding the route.",
          ko: "목록이 자기 boundary 뒤에서 렌더링되므로 route 전체가 기다리지 않습니다.",
        }),
      },
    ];

    const loadUnitsStateItems: IntroItem[] = [
      {
        name: "<model>List<Suffix>",
        desc: l.trans({
          en: "The list `Load.Units` draws, as it is on screen now.",
          ko: "`Load.Units`가 그리는 목록입니다. 지금 화면에 보이는 그대로입니다.",
        }),
        example: "articleListInProject: new DataList()",
      },
      {
        name: "<model>InitList<Suffix>",
        desc: l.trans({
          en: "The first list the server sent, kept for reset and comparison.",
          ko: "서버가 처음 보낸 목록입니다. 초기화하거나 비교할 때 씁니다.",
        }),
        example: "articleInitListInProject: new DataList()",
      },
      {
        name: "<model>InitAt<Suffix>",
        desc: l.trans({
          en: "When the server built that first list.",
          ko: "서버가 그 첫 목록을 만든 시각입니다.",
        }),
        example: "articleInitAtInProject: new Date()",
      },
      {
        name: "<model>ListLoading<Suffix>",
        desc: l.trans({
          en: "`false` once the list is hydrated, and `true` again while a refetch runs.",
          ko: "목록이 hydrate되면 `false`가 되고, 다시 불러오는 동안에는 `true`가 됩니다.",
        }),
        example: "articleListLoadingInProject: false",
      },
      {
        name: "<model>Insight<Suffix>",
        desc: l.trans({
          en: "Insight returned with the slice, such as `count` or summary values.",
          ko: "slice와 함께 온 insight입니다. `count`나 요약 값이 들어 있습니다.",
        }),
        example: "articleInsightInProject: new cnst.ArticleInsight()",
      },
      {
        name: ["pageOf<Model><Suffix>", "lastPageOf<Model><Suffix>", "limitOf<Model><Suffix>"],
        desc: l.trans({
          en: "Pagination state taken from the init object.",
          ko: "init 객체에서 가져온 페이지 상태입니다.",
        }),
        example: "pageOfArticleInProject: 1\nlastPageOfArticleInProject: 10\nlimitOfArticleInProject: 10",
      },
      {
        name: ["hasMoreOf<Model><Suffix>", "isCumulativeOf<Model><Suffix>"],
        desc: l.trans({
          en: "Whether more rows follow, and whether the list keeps rows appended by `loadMoreOf<Model><Suffix>()`.",
          ko: "뒤에 행이 더 있는지, 목록이 `loadMoreOf<Model><Suffix>()`로 행을 이어 붙인 상태인지를 나타냅니다.",
        }),
        example: "hasMoreOfArticleInProject: true\nisCumulativeOfArticleInProject: false",
      },
      {
        name: "queryArgsOf<Model><Suffix>",
        desc: l.trans({
          en: "The filter arguments the slice was loaded with.",
          ko: "slice를 불러올 때 쓴 필터 인자입니다.",
        }),
        example: "queryArgsOfArticleInProject: [projectId]",
      },
      {
        name: "sortOf<Model><Suffix>",
        desc: l.trans({
          en: "The sort key the slice was loaded with.",
          ko: "slice를 불러올 때 쓴 정렬 키입니다.",
        }),
        example: 'sortOfArticleInProject: "latest"',
      },
    ];

    const mistakeColumns = [
      { key: "mistake", label: l.trans({ en: "Mistake, then the fix", ko: "실수와 고치는 법" }), code: true },
      { key: "fix", label: l.trans({ en: "Do this", ko: "이렇게 합니다" }) },
    ];
    const mistakeRows = [
      {
        mistake: "Util.Remove article={article}",
        fix: l.trans({
          en: "A Util takes an id, so pass `articleId={article.id}`.",
          ko: "Util은 id를 받으므로 `articleId={article.id}`를 넘깁니다.",
        }),
      },
      {
        mistake: "<button onClick={…}>",
        fix: l.trans({
          en: "Move the handler into a Util and render that Util from the Unit.",
          ko: "핸들러를 Util로 옮기고, Unit에서는 그 Util을 렌더링합니다.",
        }),
      },
      {
        mistake: "export const ArticleCard",
        fix: l.trans({
          en: "Export `Card`. The namespace names the model: `<Article.Unit.Card />`.",
          ko: "`Card`로 export합니다. 모델 이름은 namespace가 붙여 줍니다: `<Article.Unit.Card />`.",
        }),
      },
      {
        mistake: "article.content",
        fix: l.trans({
          en: "A Light model has only the fields its constant picks. Add the field there, or draw it in a View.",
          ko: "Light 모델에는 constant가 고른 필드만 있습니다. 거기에 필드를 추가하거나 View에서 그립니다.",
        }),
      },
      {
        mistake: "await fetch.viewArticle(id)",
        fix: l.trans({
          en: "A Unit never fetches. Load in the page and pass the record down as a prop.",
          ko: "Unit은 데이터를 불러오지 않습니다. page에서 불러와 레코드를 prop으로 넘깁니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="unit-overview" title="Model.Unit.tsx">
          <Docs.Title>Model.Unit.tsx</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A Unit file draws one record of a model: a card, a compact row, an avatar, a gallery tile, or a column helper for tables. Every list and relation that shows the model reuses these exports.",
                ko: "Unit 파일은 모델의 레코드 하나를 그립니다. 카드, 한 줄짜리 행, 아바타, 갤러리 타일, 테이블 열을 그리는 helper가 대표적이며, 이 모델을 보여 주는 목록과 관계 화면은 모두 이 export를 가져다 씁니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Open it when a list needs a new look, or a row should show another field. A Unit only draws; everything else has a file of its own:",
                ko: "목록에 새 모양이 필요하거나 행에 필드를 하나 더 보여 줘야 할 때 이 파일을 엽니다. Unit은 그리기만 하고, 나머지 일은 각자 맡는 파일이 있습니다:",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "What", ko: "무엇을" })}
              columns={ownerColumns}
              groups={ownerGroups}
              markLabel={l.trans({ en: "Lives here", ko: "여기에 둠" })}
              emptyLabel={l.trans({ en: "Not here", ko: "여기가 아님" })}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="modelprops-light"
          title={l.trans({ en: "ModelProps And Light Models", ko: "ModelProps와 Light 모델" })}
        >
          <Docs.Title>{l.trans({ en: "ModelProps And Light Models", ko: "ModelProps와 Light 모델" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Type a Unit's props with <code>ModelProps&lt;"article", cnst.LightArticle&gt;</code>. It gives the
                    record a prop named after the model, plus <code>className</code>, <code>href</code> and a few props
                    that list components fill in.
                  </span>
                ),
                ko: (
                  <span>
                    Unit의 props 타입은 <code>ModelProps&lt;"article", cnst.LightArticle&gt;</code>로 씁니다. 모델
                    이름을 딴 레코드 prop에 <code>className</code>, <code>href</code>, 목록 컴포넌트가 채워 주는 prop 몇
                    개가 더해집니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "A list renders a Unit many times, so it takes a Light model. The smallest complete Unit file:",
                ko: "Unit은 목록에서 여러 번 렌더링되므로 Light 모델을 받습니다. 가장 작은 완성형 Unit 파일입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/article/Article.Unit.tsx"
              code={`import type { cnst } from "@apps/koyo/client";
import { cn, type ModelProps } from "akanjs/client";
import { Layout } from "akanjs/ui";

export const Card = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <Layout.Unit className={cn("rounded-lg border", className)} href={href}>
      <div className="font-bold">{article.title}</div>
      <div className="text-foreground/70">{article.summary}</div>
    </Layout.Unit>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Layout.Unit</code> is the usual container.
                      </strong>{" "}
                      It is a padded column that becomes a link when <code>href</code> is set, and a plain{" "}
                      <code>div</code> without one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Layout.Unit</code>이 기본 컨테이너입니다.
                      </strong>{" "}
                      안쪽 여백이 있는 세로 레이아웃이며, <code>href</code>가 있으면 링크가 되고 없으면 평범한{" "}
                      <code>div</code>가 됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Read only Light fields.</strong> A Light model carries just the fields its constant picks
                      for lists, so do not assume a full-model field is there.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>Light 필드만 읽습니다.</strong> Light 모델에는 constant가 목록용으로 고른 필드만 있으므로,
                      전체 모델의 필드가 있다고 가정하지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Display logic lives on the Light class.</strong> A label or a check is a method such as{" "}
                      <code>admin.label()</code>, and the Unit only calls it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>표시 로직은 Light 클래스에 둡니다.</strong> 라벨이나 조건 판단은{" "}
                      <code>admin.label()</code> 같은 메서드로 만들고, Unit은 호출만 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Extra props extend ModelProps.</strong> Declare{" "}
                      <code>interface MiniProps extends ModelProps&lt;"article", cnst.LightArticle&gt;</code> right
                      above the component.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>prop을 더하려면 ModelProps를 확장합니다.</strong>{" "}
                      <code>interface MiniProps extends ModelProps&lt;"article", cnst.LightArticle&gt;</code>를 컴포넌트
                      바로 위에 선언합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>
              {l.trans({ en: "What ModelProps gives you", ko: "ModelProps가 주는 props" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The last three are filled in by <code>Data.ListContainer</code>, which takes a Unit directly as its{" "}
                    <code>renderItem</code>:
                  </span>
                ),
                ko: (
                  <span>
                    마지막 세 prop은 Unit을 <code>renderItem</code>으로 바로 받는 <code>Data.ListContainer</code>가 채워
                    줍니다:
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={modelPropsOptions} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="unit-variants" title={l.trans({ en: "Unit Variants", ko: "Unit 변형" })}>
          <Docs.Title>{l.trans({ en: "Unit Variants", ko: "Unit 변형" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    One Unit file exports several shapes of the same model, each named by its purpose. The namespace
                    already names the model, so it is <code>{"<Article.Unit.Card />"}</code>, never{" "}
                    <code>ArticleCard</code>.
                  </span>
                ),
                ko: (
                  <span>
                    Unit 파일 하나가 같은 모델의 여러 모양을 export하고, 각각 용도에 맞는 이름을 붙입니다. 모델 이름은
                    namespace가 붙여 주므로 <code>ArticleCard</code>가 아니라 <code>{"<Article.Unit.Card />"}</code>
                    입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type="export" items={variantRows} />
            <div>
              {l.trans({
                en: "A compact row and an image tile from the same file:",
                ko: "같은 파일에 있는 한 줄짜리 행과 이미지 타일입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/article/Article.Unit.tsx"
              code={`import { Article, type cnst } from "@apps/koyo/client"; // [!code collapse:3]
import { cn, type ModelProps } from "akanjs/client";
import { Image, Link } from "akanjs/ui";

export const Mini = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link href={href}>{article.title}</Link>
      <Article.Util.Remove articleId={article.id} />
    </div>
  );
};

export const Gallery = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <Link
      href={href}
      className={cn("block overflow-hidden rounded-md border", className)}
    >
      <Image file={article.cover} className="aspect-video w-full object-cover" />
      <div className="p-2">{article.title}</div>
    </Link>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Variants beat flags.</strong> Adding <code>Mini</code> is simpler than giving{" "}
                      <code>Card</code> an <code>isCompact</code> flag.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>flag보다 변형이 낫습니다.</strong> <code>Card</code>에 <code>isCompact</code> flag를 다는
                      것보다 <code>Mini</code>를 하나 더 만드는 편이 간단합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Actions come from a Util.</strong> <code>Mini</code> renders{" "}
                      <code>Article.Util.Remove</code> and hands it only the id; the next section shows why.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>동작은 Util이 맡습니다.</strong> <code>Mini</code>는 <code>Article.Util.Remove</code>를
                      렌더링하면서 id만 넘깁니다. 이유는 다음 섹션에서 설명합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Image</code> takes the file.
                      </strong>{" "}
                      <code>file={"{article.cover}"}</code> reads the URL, the size and the blur preview from the{" "}
                      <code>File</code> relation.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Image</code>에는 파일을 넘깁니다.
                      </strong>{" "}
                      <code>file={"{article.cover}"}</code>로 넘기면 <code>File</code> 관계에서 URL, 크기, 흐린
                      미리보기를 읽습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="actions-inside-units" title={l.trans({ en: "Actions Inside Units", ko: "Unit 안의 동작" })}>
          <Docs.Title>{l.trans({ en: "Actions Inside Units", ko: "Unit 안의 동작" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A Unit may show small actions such as remove, copy or a detail button. The Unit only places a small Util component; the Util owns the browser behaviour.",
                ko: "Unit에는 삭제, 복사, 상세 보기 같은 작은 동작 버튼을 둘 수 있습니다. Unit은 작은 Util 컴포넌트를 배치만 하고, 브라우저 동작은 Util이 맡습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "The Unit puts the button in a corner, next to the link rather than inside it:",
                ko: "Unit은 버튼을 모서리에 두되, 링크 안이 아니라 링크 옆에 둡니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/article/Article.Unit.tsx"
              code={`export const Card = ({ className, article, href }: ModelProps<"article", cnst.LightArticle>) => {
  return (
    <div className={cn("relative", className)}>
      <Layout.Unit className="rounded-lg border" href={href}>
        <div className="font-bold">{article.title}</div>
      </Layout.Unit>
      <div className="absolute top-2 right-2">
        <Article.Util.Remove articleId={article.id} />
      </div>
    </div>
  );
};`}
            />
            <div>
              {l.trans({
                en: "The Util is the client component. It takes the id, not the model:",
                ko: "Util은 클라이언트 컴포넌트입니다. 모델이 아니라 id를 받습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/article/Article.Util.tsx"
              code={`"use client";
import { fetch, usePage } from "@apps/koyo/client";
import { Model } from "akanjs/ui";

interface RemoveProps {
  articleId: string;
}
export const Remove = ({ articleId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={articleId} slice={fetch.slice.article}>
      {l("base.remove")}
    </Model.Remove>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Only the button ships as JavaScript.</strong> When a page renders the card, the rest of it
                      stays server-rendered HTML.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>JavaScript로 가는 것은 버튼뿐입니다.</strong> page가 카드를 렌더링하면 나머지는 서버에서
                      그린 HTML로 남습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A Util takes ids, not models.</strong> A model prop would cross the server-client boundary
                      as a class instance, so <code>RemoveProps</code> takes <code>articleId: string</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>Util은 모델이 아니라 id를 받습니다.</strong> 모델 prop은 클래스 인스턴스째로 서버와
                      클라이언트의 경계를 넘게 되므로, <code>RemoveProps</code>는 <code>articleId: string</code>을
                      받습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep the button outside the link.</strong> A click inside <code>{"<a>"}</code> also
                      follows the link, and a button there is invalid HTML, so the snippet makes the two siblings.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>버튼은 링크 밖에 둡니다.</strong> <code>{"<a>"}</code> 안을 누르면 링크로도 이동하고, 그
                      안의 버튼은 올바르지 않은 HTML이라 예제에서는 둘을 형제로 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Forms and async workflows stay out.</strong> A form belongs in a Template, and a
                      multi-step workflow in a store action.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>폼과 비동기 흐름은 Unit 밖에 둡니다.</strong> 폼은 Template에, 여러 단계짜리 흐름은 store
                      액션에 둡니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>A Unit file never uses client-only features.</strong> Lint rejects{" "}
                    <code>{'"use client"'}</code>, React hooks such as <code>useState</code>, and an <code>st</code>{" "}
                    import in a Unit. An <code>onClick</code> in a Unit breaks too, once a page renders it on the
                    server.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Unit 파일에서는 클라이언트 전용 기능을 쓰지 않습니다.</strong> Unit 안의{" "}
                    <code>{'"use client"'}</code>, <code>useState</code> 같은 React hook, <code>st</code> import는
                    lint가 막습니다. <code>onClick</code>도 page가 서버에서 그 Unit을 렌더링하는 순간 깨집니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="loadunits-direct-rendering"
          title={l.trans({ en: "Load.Units And Direct Rendering", ko: "Load.Units와 직접 렌더링" })}
        >
          <Docs.Title>{l.trans({ en: "Load.Units And Direct Rendering", ko: "Load.Units와 직접 렌더링" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A list of Units reaches the screen in one of three ways. Pick by what the page holds:",
                ko: "Unit 목록이 화면에 나오는 길은 세 가지입니다. page가 무엇을 가지고 있는지에 따라 고릅니다:",
              })}
            </div>
            <Docs.Table columns={pathColumns} rows={pathRows} stacked />

            <Docs.SubSubTitle>{l.trans({ en: "Load.Units in a Zone", ko: "Zone 안의 Load.Units" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Use <code>Load.Units</code> when the slice has to manage loading, pagination, refresh and the empty
                    state. It lives in a Zone, which receives the page's <code>init</code>:
                  </span>
                ),
                ko: (
                  <span>
                    slice가 로딩, 페이지 이동, 새로고침, 빈 화면을 관리해야 하면 <code>Load.Units</code>를 씁니다.
                    page가 넘긴 <code>init</code>을 받는 Zone 안에 둡니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/article/Article.Zone.tsx"
              code={`"use client"; // [!code collapse:4]
import { Article, type cnst, fetch, usePage } from "@apps/koyo/client";
import type { ClientInit } from "akanjs/fetch";
import { buttonRecipe, Load, Model } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"article", cnst.LightArticle>;
  projectId: string;
}
export const Card = ({ className, init, projectId }: CardProps) => {
  const { l } = usePage();
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderEmpty={() => (
          <Model.NewWrapper
            slice={fetch.slice.articleInProject}
            partial={{ projectId }}
          >
            <button type="button" className={buttonRecipe({ variant: "secondary" })}>
              {l("base.new")}
            </button>
          </Model.NewWrapper>
        )}
        renderItem={(article) => (
          <Article.Unit.Card
            key={article.id}
            href={\`/article/\${article.id}\`}
            article={article}
          />
        )}
      />
      <Model.EditModal slice={fetch.slice.articleInProject}>
        <Article.Template.General />
      </Model.EditModal>
    </>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>renderItem</code> draws one row with a Unit.
                      </strong>{" "}
                      Pass <code>href</code> here, so the Unit itself stays reusable.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>renderItem</code>은 Unit으로 행 하나를 그립니다.
                      </strong>{" "}
                      <code>href</code>는 여기서 넘겨야 Unit 자체를 여러 곳에서 다시 쓸 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>renderEmpty</code> is the empty state.
                      </strong>{" "}
                      <code>Model.NewWrapper</code> makes the button it wraps open the new form, and{" "}
                      <code>Model.EditModal</code> draws that form.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>renderEmpty</code>는 빈 화면입니다.
                      </strong>{" "}
                      <code>Model.NewWrapper</code>는 감싼 버튼이 새 폼을 열게 하고, 그 폼은{" "}
                      <code>Model.EditModal</code>이 그립니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "What Load.Units puts in the store", ko: "Load.Units가 store에 채우는 값" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>Load.Units</code> hydrates the slice into the client store, so the generated pagination,
                    query, sort, refresh and insight helpers keep working after the first render. Read any key with{" "}
                    <code>st.use.&lt;key&gt;()</code>:
                  </span>
                ),
                ko: (
                  <span>
                    <code>Load.Units</code>는 slice를 클라이언트 store에 hydrate합니다. 덕분에 첫 렌더링 뒤에도 자동으로
                    생긴 페이지 이동, query, 정렬, 새로고침, insight helper가 계속 동작합니다. 각 값은{" "}
                    <code>st.use.&lt;key&gt;()</code>로 읽습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Store key", ko: "store 키" })} items={loadUnitsStateItems} />

            <Docs.SubSubTitle>
              {l.trans({ en: "Direct rendering on the server", ko: "서버에서 직접 렌더링하기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "When the page already holds the list, map it straight into Units. Nothing hydrates, and the rows are in the first response:",
                ko: "page가 이미 목록을 가지고 있다면 map으로 바로 Unit을 그립니다. hydrate할 것이 없고, 행은 첫 응답에 들어갑니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/project/[projectId]/_index.tsx"
              code={`import { Article, fetch } from "@apps/koyo/client"; // [!code collapse:3]
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("projectId", ID)
  .render(async ({ projectId }) => {
    const [{ articleListInProject }] = await Promise.all([
      fetch.initArticleInProject(projectId),
    ]);
    return (
      <div className="flex flex-col gap-2">
        {articleListInProject.map((article) => (
          <Article.Unit.Card
            key={article.id}
            href={\`/article/\${article.id}\`}
            article={article}
          />
        ))}
      </div>
    );
  });`}
            />
            <div>
              {l.trans({
                en: (
                  <span>
                    If the page holds the un-awaited <code>&lt;model&gt;List&lt;Suffix&gt;</code> promise instead, wrap
                    the map in <code>Load.Stream</code>. The list renders behind its own boundary rather than holding
                    the route:
                  </span>
                ),
                ko: (
                  <span>
                    배열 대신 await하지 않은 <code>&lt;model&gt;List&lt;Suffix&gt;</code> promise를 가지고 있다면, map을{" "}
                    <code>Load.Stream</code>으로 감쌉니다. 목록이 route를 붙잡지 않고 자기 boundary 뒤에서 렌더링됩니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/page/project/[projectId]/_index.tsx"
              code={`import { Article, fetch } from "@apps/koyo/client"; // [!code collapse:4]
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load, Loading } from "akanjs/ui";

export default page()
  .param("projectId", ID)
  .render(({ projectId }) => {
    const { articleListInProject } = fetch.initArticleInProject(projectId);
    return (
      <Load.Stream
        of={articleListInProject}
        fallback={<Loading.Skeleton active />}
      >
        {(articleList) => (
          <div className="flex flex-col gap-2">
            {articleList.map((article) => (
              <Article.Unit.Card
                key={article.id}
                href={\`/article/\${article.id}\`}
                article={article}
              />
            ))}
          </div>
        )}
      </Load.Stream>
    );
  });`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>&lt;model&gt;List&lt;Suffix&gt;</code> holds model instances.
                      </strong>{" "}
                      Hand it only to server components. A Zone takes <code>&lt;model&gt;Init&lt;Suffix&gt;</code>{" "}
                      instead.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>&lt;model&gt;List&lt;Suffix&gt;</code>에는 모델 인스턴스가 들어 있습니다.
                      </strong>{" "}
                      서버 컴포넌트에만 넘기고, Zone에는 <code>&lt;model&gt;Init&lt;Suffix&gt;</code>를 넘깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Stream only small, static lists.</strong> When the same slice also feeds a Zone,{" "}
                      <code>Load.Stream</code> on the server and <code>Load.Units</code> after hydration build the rows
                      twice. A large list goes through <code>init</code> into the Zone alone.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>스트리밍은 작고 변하지 않는 목록에만 씁니다.</strong> 같은 slice를 Zone에도 넘기면 서버의{" "}
                      <code>Load.Stream</code>과 hydrate 뒤의 <code>Load.Units</code>가 행을 두 번 만듭니다. 큰 목록은{" "}
                      <code>init</code>으로 Zone에만 넘깁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
          <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Six rules keep a Unit reusable:",
                ko: "Unit을 여러 곳에서 다시 쓸 수 있게 하는 여섯 가지 규칙입니다:",
              })}
            </div>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Light models for lists.</strong> Anything drawn once per row takes the Light model, not
                      the full one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>목록에는 Light 모델을 씁니다.</strong> 행마다 반복해서 그리는 것은 전체 모델이 아니라
                      Light 모델을 받습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Accept <code>className</code> and <code>href</code>.
                      </strong>{" "}
                      Then the same Unit fits other layouts and other links.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>className</code>과 <code>href</code>를 받습니다.
                      </strong>{" "}
                      그래야 다른 레이아웃과 다른 링크에서도 같은 Unit을 쓸 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Merge with <code>cn</code>.
                      </strong>{" "}
                      Put the caller's classes last: <code>cn("rounded-lg border", className)</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>cn</code>으로 합칩니다.
                      </strong>{" "}
                      호출하는 쪽의 class를 맨 뒤에 둡니다: <code>cn("rounded-lg border", className)</code>.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Make clickable cards and rows with <code>Layout.Unit</code> or <code>Link</code>.
                      </strong>
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        클릭할 수 있는 카드와 행은 <code>Layout.Unit</code>이나 <code>Link</code>로 만듭니다.
                      </strong>
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Forms in Template, complex async work in Util or Store.</strong> A Unit keeps neither.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>폼은 Template에, 복잡한 비동기 동작은 Util이나 Store에 둡니다.</strong> Unit에는 둘 다
                      두지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Export variants, not flags.</strong> Add a variant per display purpose instead of piling
                      flags onto one <code>Card</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>flag 대신 변형을 export합니다.</strong> <code>Card</code> 하나에 flag를 쌓지 말고, 보여
                      주는 목적마다 변형을 하나씩 만듭니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Common mistakes", ko: "자주 하는 실수" })}</Docs.SubSubTitle>
            <Docs.Table columns={mistakeColumns} rows={mistakeRows} stacked />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
