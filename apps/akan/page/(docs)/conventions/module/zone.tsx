import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="zone-overview" title="model.Zone.tsx">
        <Docs.Title>model.Zone.tsx</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Zone file contains client section components for pages. Zones compose server-fetched init/view data with Load wrappers, Unit/View display components, Util actions, and small section-level UI state.",
              ko: "Zone 파일은 page의 client section component를 담습니다. Zone은 server에서 가져온 init/view data를 Load wrapper, Unit/View display component, Util action, 작은 section-level UI state와 조립합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Pages should usually pass route params and server data into Zones. Zones handle section composition, while Unit/View render display, Template renders forms, Util handles small actions, and Store owns state/actions.",
              ko: "Page는 보통 route param과 server data를 Zone에 전달합니다. Zone은 section 조립을 담당하고, Unit/View는 display, Template은 form, Util은 작은 action, Store는 state/action을 담당합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-convention" title={l.trans({ en: "File Convention And Props", ko: "파일 규칙과 props" })}>
        <Docs.Title>{l.trans({ en: "File Convention And Props", ko: "파일 규칙과 props" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Zone files usually use client hooks and Load wrappers, so they start with the use client directive. Their props commonly receive server-prepared ClientInit or ClientView values.",
              ko: "Zone 파일은 보통 client hook과 Load wrapper를 사용하므로 use client directive로 시작합니다. props로는 server에서 준비한 ClientInit 또는 ClientView 값을 자주 받습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-4">
          {[
            {
              title: "Path",
              desc: "lib/[model]/[Model].Zone.tsx",
            },
            {
              title: "Directive",
              desc: '"use client"',
            },
            {
              title: "List props",
              desc: "className, init, slice, context ids",
            },
            {
              title: "View props",
              desc: "className, view, self, context data",
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="load-units-zone"
        title={l.trans({ en: "List Zone With Load.Units", ko: "Load.Units list Zone" })}
      >
        <Docs.Title>{l.trans({ en: "List Zone With Load.Units", ko: "Load.Units list Zone" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Load.Units when a Zone receives ClientInit list data from a server page. It hydrates initial list state, handles loading and empty states, and delegates each item to Unit components.",
              ko: "server page에서 ClientInit list data를 받은 Zone에는 Load.Units를 사용합니다. initial list state를 hydrate하고 loading/empty state를 처리하며 각 item 렌더링은 Unit component에 위임합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="DbBackup.Zone.tsx"
          code={`export const Card = ({ className, init, devAppId }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderEmpty={() => (
        <Model.NewWrapper partial={{ devAppId }} slice={fetch.slice.dbBackupInDevApp}>
          <button className="btn btn-secondary">+ New</button>
        </Model.NewWrapper>
      )}
      renderItem={(dbBackup) => <DbBackup.Unit.Card key={dbBackup.id} dbBackup={dbBackup} />}
    />
  );
};`}
        />
        <div className="grid gap-3 xl:grid-cols-3">
          {[
            {
              title: "renderItem",
              desc: l.trans({
                en: "Render one item, usually by delegating to Unit.Card or Unit.Abstract.",
                ko: "하나의 item을 렌더링하며 보통 Unit.Card 또는 Unit.Abstract에 위임합니다.",
              }),
            },
            {
              title: "renderList",
              desc: l.trans({
                en: "Render the whole list when the layout needs grouping, tabs, boards, or custom ordering.",
                ko: "grouping, tab, board, custom ordering이 필요할 때 전체 list를 렌더링합니다.",
              }),
            },
            {
              title: "renderEmpty",
              desc: l.trans({
                en: "Render empty states, often with Model.NewWrapper or a link-style call to action.",
                ko: "empty state를 렌더링하며 Model.NewWrapper 또는 link-style CTA와 함께 쓰는 경우가 많습니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="load-view-zone" title={l.trans({ en: "View Zone With Load.View", ko: "Load.View view Zone" })}>
        <Docs.Title>{l.trans({ en: "View Zone With Load.View", ko: "Load.View view Zone" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Load.View when a Zone receives ClientView detail data. Load.View hydrates the selected model into store state, then passes the full model to View components.",
              ko: "Zone이 ClientView detail data를 받을 때는 Load.View를 사용합니다. Load.View는 선택된 model을 store state에 hydrate한 뒤 full model을 View component에 전달합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Ticket.Zone.tsx"
          code={`export const View = ({ className, view, self }: ViewProps) => {
  return (
    <Load.View
      className={className}
      view={view}
      renderView={(ticket) => <Ticket.View.General ticket={ticket} self={self} />}
    />
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="orchestration-zones"
        title={l.trans({ en: "Section Orchestration Zones", ko: "Section orchestration Zone" })}
      >
        <Docs.Title>{l.trans({ en: "Section Orchestration Zones", ko: "Section orchestration Zone" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some Zones compose more than a simple list. They may combine local UI state, store state, Unit components, Util controls, and Model wrappers for a complete page section.",
              ko: "일부 Zone은 단순 list보다 더 많은 것을 조립합니다. 완성된 page section을 위해 local UI state, store state, Unit component, Util control, Model wrapper를 함께 사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="Ticket.Zone.tsx"
            code={`export const Kanban = ({ init, slice = fetch.slice.ticket }: KanbanProps) => {
  const [tab, setTab] = useState("open");
  return (
    <Load.Units
      init={init}
      renderList={(ticketList) => (
        <>
          <Ticket.Util.QueryMakerInSelf slice={slice} />
          <Ticket.Unit.Card ticket={ticketList.values[0]} />
          <Model.NewWrapper slice={fetch.slice.ticketInProject}>+ New</Model.NewWrapper>
        </>
      )}
    />
  );
};`}
          />
          <Code.Snippet
            title="Dessert.Zone.tsx"
            code={`export const Card = ({ init }: CardProps) => {
  return (
    <>
      <Load.Units
        init={init}
        renderItem={(dessert) => (
          <Model.ViewWrapper modelId={dessert.id} slice={fetch.slice.dessert}>
            <Dessert.Unit.Card dessert={dessert} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal slice={fetch.slice.dessert} renderView={(dessert) => <Dessert.View.General dessert={dessert} />} />
    </>
  );
};`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="live-dashboard-zones"
        title={l.trans({ en: "Live And Dashboard Zones", ko: "Live와 dashboard Zone" })}
      >
        <Docs.Title>{l.trans({ en: "Live And Dashboard Zones", ko: "Live와 dashboard Zone" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Zone can also be a dashboard or a live section when the whole section depends on store state, subscriptions, or client-only layout behavior.",
              ko: "section 전체가 store state, subscription, client-only layout behavior에 의존한다면 Zone은 dashboard 또는 live section이 될 수도 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="Summary.Zone.tsx"
            code={`export const Dashboard = () => {
  const summary = st.use.summary();
  const summaryLoading = st.use.summaryLoading();
  if (summaryLoading || !summary) return <Loading.Skeleton active />;
  return <Summary.View.General summary={summary} />;
};`}
          />
          <Code.Snippet
            title="ChatRoom.Zone.tsx"
            code={`useEffect(() => {
  st.do.readChat(root);
  const unsubscribe = fetch.subscribeChatAdded(root, (chat) => {
    st.do.chatAdded(root, chat);
  });
  return () => unsubscribe();
}, []);`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use Zone", ko: "Zone을 쓰는 경우" })}>
        <Docs.Title>{l.trans({ en: "When To Use Zone", ko: "Zone을 쓰는 경우" })}</Docs.Title>
        <Docs.Description>
          <div className="grid gap-3 xl:grid-cols-5">
            {[
              {
                title: "Page",
                desc: l.trans({
                  en: "Route shell, params, and server fetch.",
                  ko: "route shell, param, server fetch를 담당합니다.",
                }),
              },
              {
                title: "Zone",
                desc: l.trans({
                  en: "Page section composition and Load wrappers.",
                  ko: "page section 조립과 Load wrapper를 담당합니다.",
                }),
              },
              {
                title: "Unit / View",
                desc: l.trans({
                  en: "Model display and detail rendering.",
                  ko: "model display와 detail rendering을 담당합니다.",
                }),
              },
              {
                title: "Template",
                desc: l.trans({
                  en: "Form fields and form fragments.",
                  ko: "form field와 form fragment를 담당합니다.",
                }),
              },
              {
                title: "Util",
                desc: l.trans({
                  en: "Small actions, toolboxes, and helpers.",
                  ko: "작은 action, toolbox, helper를 담당합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
                <div className="font-bold text-base-content">{title}</div>
                <div className="mt-2 text-base-content/70">{desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Keep pages thin by passing server init or view data into Zone components.",
                ko: "server init 또는 view data를 Zone component에 전달해서 page를 얇게 유지합니다.",
              }),
              l.trans({
                en: "Use Load.Units for list sections and Load.View for detail sections.",
                ko: "list section에는 Load.Units, detail section에는 Load.View를 사용합니다.",
              }),
              l.trans({
                en: "Delegate item display to Unit components and full detail display to View components.",
                ko: "item display는 Unit component에, full detail display는 View component에 위임합니다.",
              }),
              l.trans({
                en: "Use Util components for action controls inside Zones.",
                ko: "Zone 내부 action control에는 Util component를 사용합니다.",
              }),
              l.trans({
                en: "Keep core business rules in service, document, store, or constants instead of Zone render code.",
                ko: "핵심 business rule은 Zone render code가 아니라 service, document, store, constant에 둡니다.",
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
