import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function ViewDocsPage() {
  const { l } = usePage();

  const comparisonItems: IntroItem[] = [
    {
      name: "Model.View",
      desc: l.trans({
        en: "Renders the full model. Use it for detail pages and sections that need body content, histories, logs, or full nested data.",
        ko: "full model을 렌더링합니다. 본문, history, log, nested data가 필요한 상세 page나 section에 사용합니다.",
      }),
      example: "Ticket.View.General",
    },
    {
      name: "Model.Unit",
      desc: l.trans({
        en: "Renders the light model. Use it for list rows, cards, table items, and compact summaries.",
        ko: "light model을 렌더링합니다. list row, card, table item, compact summary에 사용합니다.",
      }),
      example: "Ticket.Unit.Card",
    },
  ];
  const loadViewStateItems: IntroItem[] = [
    {
      name: "<model>",
      desc: l.trans({
        en: "Stores the hydrated full model instance from the server view object.",
        ko: "server view object에서 받은 hydrated full model instance를 저장합니다.",
      }),
      example: "article: new cnst.Article()",
    },
    {
      name: "<model>Loading",
      desc: l.trans({
        en: "Marks the full model as ready so the View can render without showing loading UI.",
        ko: "full model이 준비되었음을 표시해서 View가 loading UI 없이 렌더링될 수 있게 합니다.",
      }),
      example: "articleLoading: false",
    },
    {
      name: "<model>Modal",
      desc: l.trans({
        en: "Marks the current model state as view mode. Other model wrappers can distinguish view/edit/new flows.",
        ko: "현재 model state를 view mode로 표시합니다. 다른 model wrapper가 view/edit/new 흐름을 구분할 수 있습니다.",
      }),
      example: 'articleModal: "view"',
    },
    {
      name: "<model>ViewAt",
      desc: l.trans({
        en: "Stores the server view timestamp so Load.View can avoid replacing newer client state with older view data.",
        ko: "server view timestamp를 저장해서 Load.View가 더 최신인 client state를 오래된 view data로 덮어쓰지 않도록 합니다.",
      }),
      example: "articleViewAt: dayjs()",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title="Model.View.tsx">
        <Docs.Title>Model.View.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A View file renders full-model detail UI. It is usually used by detail pages or Zone wrappers that already have full view data from the server.",
              ko: "View 파일은 full-model detail UI를 렌더링합니다. 보통 server에서 full view data를 받은 detail page나 Zone wrapper에서 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "View components are presentation components. They may compose Unit, Util, Zone, and local subcomponents, but mutation and business decisions should stay outside the View.",
              ko: "View component는 presentation component입니다. Unit, Util, Zone, local subcomponent를 조합할 수 있지만 mutation과 business decision은 View 밖에 둡니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="comparison" title={l.trans({ en: "View vs Unit", ko: "View vs Unit" })}>
        <Docs.Title>{l.trans({ en: "View vs Unit", ko: "View vs Unit" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "The main distinction is data size and page role. View is for full detail, while Unit is for repeated summary UI.",
            ko: "핵심 차이는 data 크기와 page 역할입니다. View는 full detail에, Unit은 반복되는 summary UI에 사용합니다.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="Comparison" items={comparisonItems} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="standard-view-shape" title={l.trans({ en: "Standard View Shape", ko: "표준 View 형태" })}>
        <Docs.Title>{l.trans({ en: "Standard View Shape", ko: "표준 View 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A standard View exports General, accepts className and a full model prop, then uses dictionary labels for field names and statuses.",
              ko: "표준 View는 General을 export하고 className과 full model prop을 받은 뒤 dictionary label로 field name과 status를 표시합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Ticket.View.tsx"
          code={`import { type cnst, usePage } from "@apps/myapp/client";
import { clsx } from "akanjs/client";

interface GeneralProps {
  className?: string;
  ticket: cnst.Ticket;
}

export const General = ({ className, ticket }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex w-full flex-col gap-4", className)}>
      <h1>{ticket.title}</h1>
      <div>{l("ticket.status")}: {l(\`ticketStatus.\${ticket.status}\`)}</div>
    </div>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="detail-patterns"
        title={l.trans({ en: "Full Model Detail Patterns", ko: "Full model detail 패턴" })}
      >
        <Docs.Title>{l.trans({ en: "Full Model Detail Patterns", ko: "Full model detail 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A View can render every field defined on the constant full model because it receives the full model shape, not the light summary shape.",
              ko: "View는 light summary shape가 아니라 constant의 full model shape를 받기 때문에 full model에 정의된 모든 field를 렌더링할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="Article.View.tsx"
            code={`interface ArticleViewProps {
  article: cnst.Article;
}

export const General = ({ article }: ArticleViewProps) => (
  <article>
    <h1>{article.title}</h1>
    <p>{article.description}</p>
  </article>
);`}
          />
          <Code.Snippet
            title="Order.View.tsx"
            code={`interface OrderViewProps {
  order: cnst.Order;
}

export const General = ({ order }: OrderViewProps) => {
  const { l } = usePage();
  return (
    <div>
      <span>{l(\`orderStatus.\${order.status}\`)}</span>
      <div>{order.totalPrice.toLocaleString()}</div>
    </div>
  );
};`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="using-view-pages" title={l.trans({ en: "Using View In Pages", ko: "Page에서 View 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Using View In Pages", ko: "Page에서 View 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A server page usually fetches full view data, then passes the view object to a Zone wrapper or directly into Load.View.",
              ko: "server page는 보통 full view data를 fetch한 뒤 view object를 Zone wrapper 또는 Load.View에 전달합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="detail page"
          code={`export default async function Page({ params }: PageProps) {
  const { releaseView } = await fetch.viewRelease(params.releaseId);
  return <Release.Zone.View view={releaseView} />;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="load-view"
        title={l.trans({ en: "Load.View And Store Hydration", ko: "Load.View와 store hydration" })}
      >
        <Docs.Title>{l.trans({ en: "Load.View And Store Hydration", ko: "Load.View와 store hydration" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Load.View safely hydrates server-provided full model data into the client store. It sets the model, loading state, modal state, and view timestamp before rendering your View.",
              ko: "Load.View는 server에서 받은 full model data를 client store에 안전하게 hydrate합니다. View를 렌더링하기 전에 model, loading state, modal state, view timestamp를 설정합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use this wrapper when rendering server-fetched view data inside client Zones, tab layouts, or reusable sections.",
              ko: "server에서 fetch한 view data를 client Zone, tab layout, reusable section 안에서 렌더링할 때 이 wrapper를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="field" items={loadViewStateItems} />
        <Code.Snippet
          title="Release.Zone.tsx"
          code={`interface ViewProps {
  view: ClientView<"release", cnst.Release>;
}

export const View = ({ view }: ViewProps) => {
  return <Load.View view={view} renderView={(release) => <Release.View.General release={release} />} />;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Accept full model props in View components. Use Unit for light list or card summaries.",
                ko: "View component는 full model prop을 받습니다. light list 또는 card summary에는 Unit을 사용합니다.",
              }),
              l.trans({
                en: "Use dictionary labels for field names, statuses, and headings.",
                ko: "field name, status, heading에는 dictionary label을 사용합니다.",
              }),
              l.trans({
                en: "Split large Views into named section components instead of one giant General component.",
                ko: "큰 View는 하나의 거대한 General component가 아니라 named section component로 나눕니다.",
              }),
              l.trans({
                en: "Keep mutations in Util, Store, Signal, or Service. View should mostly render the current full model.",
                ko: "mutation은 Util, Store, Signal, Service에 둡니다. View는 현재 full model을 렌더링하는 데 집중합니다.",
              }),
              l.trans({
                en: "Use Load.View when server-fetched view data must hydrate into client store state.",
                ko: "server-fetched view data를 client store state에 hydrate해야 하면 Load.View를 사용합니다.",
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
