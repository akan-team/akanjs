import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const baseVariables: IntroItem[] = [
    { name: "st.<model>: Full | null", desc: "The cached full model instance." },
    { name: "st.<model>Loading: string | boolean", desc: "Loading status for the model instance." },
    { name: "st.<model>Form: Default", desc: "Form state for create or update flows." },
    { name: "st.<model>FormLoading: string | boolean", desc: "Loading status for form submission." },
    { name: "st.<model>Submit: Submit", desc: "Latest submit state." },
    { name: "st.<model>ViewAt: Date", desc: "Time when the detailed view was opened." },
    { name: "st.<model>Modal: string | null", desc: "Modal key associated with this model." },
  ];

  const baseMethods: IntroItem[] = [
    { name: "create<Class>InForm(options?)", desc: "Create a document using form state." },
    { name: "update<Class>InForm(options?)", desc: "Update a document using form state." },
    { name: "create<Class>(data, options?)", desc: "Create a new document with data." },
    { name: "update<Class>(id, data, options?)", desc: "Update an existing document." },
    { name: "remove<Class>(id, options?)", desc: "Remove a document." },
    { name: "check<Class>Submitable(disabled?)", desc: "Check whether the form can be submitted." },
    { name: "submit<Class>(options?)", desc: "Submit the form for create or update." },
    { name: "new<Class>(partial?, options?)", desc: "Initialize form state for creation." },
    { name: "edit<Class>(model, options?)", desc: "Initialize form state for editing." },
    { name: "merge<Class>(model, data, options?)", desc: "Merge data into an existing cached document." },
    { name: "view<Class>(model, options?)", desc: "Open detailed view state." },
    { name: "set<Class>(...models)", desc: "Manually set model cache." },
    { name: "reset<Class>(model?)", desc: "Reset model state." },
  ];

  const sliceVariables: IntroItem[] = [
    { name: "st.default<Class>: Default", desc: "Default value for the slice." },
    { name: "st.<slice>List: DataList<Light>", desc: "List loaded by init or refresh." },
    { name: "st.<slice>ListLoading: boolean", desc: "Loading status of the list." },
    { name: "st.<slice>InitList: DataList<Light>", desc: "Initial list snapshot." },
    { name: "st.<slice>InitAt: Date", desc: "Time when the list was initialized." },
    { name: "st.<slice>Selection: DataList<Light>", desc: "Selected items in the list." },
    { name: "st.<slice>Insight: Insight", desc: "Insight data for the list." },
    { name: "st.lastPageOf<Slice>: number", desc: "Last accessed page number." },
    { name: "st.pageOf<Slice>: number", desc: "Current page number." },
    { name: "st.limitOf<Slice>: number", desc: "Items per page." },
    { name: "st.queryArgsOf<Slice>: QueryArgs", desc: "Current query arguments." },
    { name: "st.sortOf<Slice>: Sort", desc: "Current sort setting." },
  ];

  const sliceMethods: IntroItem[] = [
    { name: "init<Slice>(...args)", desc: "Initialize list with query args." },
    { name: "refresh<Slice>(initForm?)", desc: "Reload list with strict consistency." },
    { name: "select<Slice>(model, options?)", desc: "Update selection state." },
    { name: "setPageOf<Slice>(page, options?)", desc: "Change page and reload." },
    { name: "addPageOf<Slice>(page, options?)", desc: "Load next page and append." },
    { name: "setLimitOf<Slice>(limit, options?)", desc: "Change list limit and reload." },
    { name: "setQueryArgsOf<Slice>(...args)", desc: "Change query arguments and reload." },
    { name: "setSortOf<Slice>(sort, options?)", desc: "Change sort and reload." },
  ];

  const stateManagementMethods: IntroItem[] = [
    {
      name: "get()",
      desc: l.trans({
        en: "Get the current snapshot of the store state.",
        ko: "store state의 현재 snapshot을 가져옵니다.",
      }),
      example: `const { ticket, ticketList } = this.get();`,
    },
    {
      name: "set(state)",
      desc: l.trans({
        en: "Update store state. It merges shallowly.",
        ko: "store state를 업데이트합니다. 얕게 병합됩니다.",
      }),
      example: `this.set({ ticketModal: null });`,
    },
    {
      name: "pick(...keys)",
      desc: l.trans({
        en: "Select required state values. It throws immediately if any requested key is null or undefined.",
        ko: "필수 state 값을 선택합니다. 요청한 key 중 하나라도 null 또는 undefined면 즉시 error를 발생시킵니다.",
      }),
      example: `const { ticketForm } = this.pick("ticketForm");`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="store-overview" title="model.store.ts">
        <Docs.Title>model.store.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A store file is the client-side state and action layer for a module. Pages and UI components read state from the store and call store actions instead of coordinating fetch calls directly.",
              ko: "store 파일은 module의 client-side state와 action layer입니다. page와 UI component는 fetch 호출을 직접 조율하지 않고 store에서 state를 읽고 store action을 호출합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Stores sit between UI and generated fetch/sig clients. Service and document files keep business rules; store files handle UI state, form state, list state, toast messages, and client navigation around those calls.",
              ko: "store는 UI와 generated fetch/sig client 사이에 위치합니다. business rule은 service와 document에 두고, store는 UI state, form state, list state, toast message, client navigation을 다룹니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="class-structure" title={l.trans({ en: "Store Class Structure", ko: "Store class 구조" })}>
        <Docs.Title>{l.trans({ en: "Store Class Structure", ko: "Store class 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Define a store with store(sig.model, stateFactory). The second argument is a factory, so default state is recreated safely for each runtime instance.",
              ko: "store는 store(sig.model, stateFactory)로 정의합니다. 두 번째 인자는 factory이므로 runtime instance마다 default state가 안전하게 다시 만들어집니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="ticket.store.ts"
          code={`import { msg } from "@apps/akan/client";
import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class TicketStore extends store(sig.ticket, () => ({
  backlogTicketList: [] as cnst.LightTicket[],
})) {
  async openTicket(id: string, due: Dayjs) {
    msg.loading("ticket.openTicketLoading", { key: "openTicket" });
    this.setTicket(await fetch.openTicket(id, due));
    msg.success("ticket.openTicketSuccess", { key: "openTicket" });
    this.set({ ticketModal: null });
  }
}`}
        />
        <Code.Snippet
          title="service-only store"
          code={`export class MyappStore extends store("myapp" as const, () => ({
  menuOpen: false,
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="generated-extension"
        title={l.trans({ en: "Extending Generated Stores", ko: "Generated store 확장" })}
      >
        <Docs.Title>{l.trans({ en: "Extending Generated Stores", ko: "Generated store 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When an app extends a generated or library domain, pass the generated stores after local state. The inherited state, actions, and metadata are merged first, then the app adds its own state and actions.",
              ko: "app이 generated 또는 library domain을 확장한다면 local state 뒤에 generated stores를 넘깁니다. inherited state, action, metadata가 merge되고 app이 자기 state와 action을 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="user.store.ts"
          code={`import { user } from "../__lib/lib.store";

export class UserStore extends store(
  sig.user,
  () => ({
    self: new cnst.User(),
  }),
  ...user.stores,
) {
  async refreshSelf() {
    const { self } = this.get();
    this.set({ self: await fetch.user(self.id) });
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="writable-derived-state"
        title={l.trans({ en: "Writable And Derived State", ko: "Writable와 derived state" })}
      >
        <Docs.Title>{l.trans({ en: "Writable And Derived State", ko: "Writable와 derived state" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Most stores only need plain writable state. The state builder also supports persist and session values. A third store() argument can define derived state such as URL search params or computed values.",
              ko: "대부분의 store는 plain writable state만 필요합니다. state builder는 persist와 session 값도 지원합니다. store()의 세 번째 인자로 URL search param이나 computed value 같은 derived state를 정의할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="store state builders"
          code={`export class TicketStore extends store(
  sig.ticket,
  ({ persist, session }) => ({
    viewMode: persist(String, { default: "board" }),
    draftKeyword: session(String, { default: "" }),
  }),
  ({ search, computed }) => ({
    status: search("status", TicketStatus, { default: "active" }),
    hasKeyword: computed(["draftKeyword"], (keyword) => keyword.length > 0),
  }),
) {}`}
        />
        <div className="grid gap-3 xl:grid-cols-4">
          {[
            {
              title: "plain",
              desc: l.trans({
                en: "Use normal values for UI state that can reset with the store.",
                ko: "store와 함께 reset되어도 되는 UI state에는 일반 값을 사용합니다.",
              }),
            },
            {
              title: "persist",
              desc: l.trans({
                en: "Use for values that should survive browser reloads.",
                ko: "browser reload 이후에도 유지해야 하는 값에 사용합니다.",
              }),
            },
            {
              title: "session",
              desc: l.trans({
                en: "Use for values that should last only during the current browser session.",
                ko: "현재 browser session 동안만 유지하면 되는 값에 사용합니다.",
              }),
            },
            {
              title: "search / computed",
              desc: l.trans({
                en: "Use for URL-backed state or values derived from writable state.",
                ko: "URL 기반 state 또는 writable state에서 계산되는 값에 사용합니다.",
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

      <Scroll.Slide id="state-management" title={l.trans({ en: "State Interaction", ko: "State 상호작용" })}>
        <Docs.Title>{l.trans({ en: "State Interaction", ko: "State 상호작용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Inside a store action, use get for optional reads, pick for required state, and set for updates. pick is useful when the next line cannot work without that state.",
              ko: "store action 내부에서는 optional read에 get, 필수 state에 pick, update에 set을 사용합니다. 다음 코드가 해당 state 없이는 동작할 수 없을 때 pick이 유용합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={stateManagementMethods} />
        <Docs.Alert>
          {l.trans({
            en: "pick throws if the requested value is null or undefined. Use get when null is a valid branch you want to handle manually.",
            ko: "pick은 요청한 값이 null 또는 undefined면 error를 발생시킵니다. null을 직접 처리해야 하는 분기라면 get을 사용하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="standard-api" title={l.trans({ en: "Standard Model API", ko: "표준 model API" })}>
        <Docs.Title>{l.trans({ en: "Standard Model API", ko: "표준 model API" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A store bound to sig.model receives generated model state and generated CRUD/form actions. These helpers cover common create, update, remove, view, edit, submit, and cache flows.",
              ko: "sig.model에 묶인 store는 generated model state와 generated CRUD/form action을 받습니다. 이 helper들은 create, update, remove, view, edit, submit, cache 흐름을 다룹니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.SubTitle>Base State</Docs.SubTitle>
        <Docs.IntroTable type="field" items={baseVariables} />
        <div className="mb-8" />
        <Docs.SubTitle>Base Actions</Docs.SubTitle>
        <Docs.IntroTable type="method" items={baseMethods} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="slice-features"
        title={l.trans({ en: "Slice Auto-Generated Features", ko: "Slice 자동 생성 기능" })}
      >
        <Docs.Title>{l.trans({ en: "Slice Auto-Generated Features", ko: "Slice 자동 생성 기능" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Slice state and actions are generated from slices declared in model.signal.ts. Use them for list pages, pagination, sorting, selection, and insight state.",
              ko: "slice state와 action은 model.signal.ts에 선언된 slice에서 생성됩니다. list page, pagination, sorting, selection, insight state에 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="ticket.signal.ts"
          code={`export class TicketSlice extends slice(srv.ticket, { guards: { root: User } }, (init) => ({
  inProject: init()
    .param("projectId", ID)
    .exec(function (projectId) {
      return this.ticketService.queryInProject(projectId);
    }),
})) {}`}
        />
        <Docs.SubTitle>Generated Slice State</Docs.SubTitle>
        <Docs.IntroTable type="field" items={sliceVariables} />
        <div className="mb-8" />
        <Docs.SubTitle>Generated Slice Actions</Docs.SubTitle>
        <Docs.IntroTable type="method" items={sliceMethods} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="usage-patterns" title={l.trans({ en: "Usage Patterns", ko: "사용 패턴" })}>
        <Docs.Title>{l.trans({ en: "Usage Patterns", ko: "사용 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use this.get, this.pick, this.set, generated fetch clients, and generated setters inside store actions. In React components, read with st.use and call actions with st.do.",
              ko: "store action 내부에서는 this.get, this.pick, this.set, generated fetch client, generated setter를 사용합니다. React component에서는 st.use로 읽고 st.do로 action을 호출합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="Inside store"
            code={`async archiveTicketMany() {
  const { ticketList } = this.get();
  await fetch.archiveTicketMany(ticketList.map((ticket) => ticket.id));
  this.set({ completeTicketList: [] });
}`}
          />
          <Code.Snippet
            title="Inside component"
            code={`const ticket = st.use.ticket();

<button onClick={() => st.do.openTicket(ticket.id, due)}>
  Open
</button>`}
          />
        </div>
        <Docs.SubTitle>{l.trans({ en: "Auto-Generated Setters", ko: "자동 생성 setter" })}</Docs.SubTitle>
        <Code.Snippet
          title="setter examples"
          code={`st.do.setTicketModal(null);
st.set({ ticketModal: null });`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="rootstore-access"
        title={l.trans({ en: "Other Stores With RootStore", ko: "RootStore로 다른 store 접근" })}
      >
        <Docs.Title>{l.trans({ en: "Other Stores With RootStore", ko: "RootStore로 다른 store 접근" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Store instances are merged into one app-level RootStore type. Use RootStore casting only for rare cross-store coordination, because broad cross-store coupling makes actions harder to reason about.",
              ko: "store instance는 app-level RootStore type으로 merge됩니다. cross-store coordination이 꼭 필요할 때만 RootStore casting을 사용하세요. 너무 넓은 cross-store coupling은 action 이해를 어렵게 만듭니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="user.store.ts"
          code={`import type { RootStore } from "../st";

async applyUserProfile() {
  const { self } = (this as unknown as RootStore).get();
  await (this as unknown as RootStore).refreshJwt();
  this.set({ self });
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Keep UI orchestration in store: fetch calls, loading state, toast messages, modal state, and navigation.",
                ko: "fetch call, loading state, toast message, modal state, navigation 같은 UI orchestration은 store에 둡니다.",
              }),
              l.trans({
                en: "Keep pure business rules in constants, documents, services, or signals instead of store actions.",
                ko: "순수 business rule은 store action이 아니라 constant, document, service, signal에 둡니다.",
              }),
              l.trans({
                en: "Use pick for required state and get when null is a valid branch.",
                ko: "필수 state에는 pick을, null이 가능한 분기에는 get을 사용합니다.",
              }),
              l.trans({
                en: "Use generated fetch clients inside store actions and generated setters like this.setTicket after successful mutations.",
                ko: "store action 내부에서는 generated fetch client를 사용하고 mutation 성공 후 this.setTicket 같은 generated setter를 사용합니다.",
              }),
              l.trans({
                en: "Extend generated or library stores with ...model.stores before adding app-specific state and actions.",
                ko: "app 전용 state와 action을 추가하기 전에 ...model.stores로 generated 또는 library store를 확장합니다.",
              }),
              l.trans({
                en: "Use RootStore casting sparingly for cross-store coordination.",
                ko: "cross-store coordination에는 RootStore casting을 필요한 만큼만 사용합니다.",
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
