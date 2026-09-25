import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const baseVariables: IntroItem[] = [
    { name: "st.<model>: Full | null", desc: "The single instance of the model." },
    { name: "st.<model>Loading: string | boolean", desc: "Loading status of the single instance." },
    { name: "st.<model>Form: Default", desc: "Form state for creating or updating." },
    { name: "st.<model>FormLoading: string | boolean", desc: "Loading status of the form." },
    { name: "st.<model>Submit: Submit", desc: "Start time of the latest submit." },
    { name: "st.<model>ViewAt: Date", desc: "Time when the detailed view was accessed." },
    { name: "st.<model>Modal: string | null", desc: "Modal ID associated with this model." },
  ];

  const baseMethods: IntroItem[] = [
    { name: "create<Class>InForm(options?): Promise<void>", desc: "Create a document using form state." },
    { name: "update<Class>InForm(options?): Promise<void>", desc: "Update a document using form state." },
    { name: "create<Class>(data, options?): Promise<void>", desc: "Create a new document with data." },
    { name: "update<Class>(id, data, options?): Promise<void>", desc: "Update an existing document." },
    { name: "remove<Class>(id, options?): Promise<void>", desc: "Remove a document." },
    { name: "check<Class>Submitable(disabled?): Promise<void>", desc: "Check if the form can be submitted." },
    { name: "submit<Class>(options?): Promise<void>", desc: "Submit the form (create or update)." },
    { name: "new<Class>(partial?, options?): void", desc: "Initialize form for new creation." },
    { name: "edit<Class>(model, options?): Promise<void>", desc: "Initialize form for editing." },
    { name: "merge<Class>(model, data, options?): Promise<void>", desc: "Merge data into existing document." },
    { name: "view<Class>(model, options?): Promise<void>", desc: "Open detailed view." },
    { name: "set<Class>(...models): void", desc: "Manually set model cache." },
    { name: "reset<Class>(model?): void", desc: "Reset model state." },
  ];

  const sliceVariables: IntroItem[] = [
    { name: "st.default<Class>: Default", desc: "Default value for the slice." },
    { name: "st.<slice>List: DataList<Light>", desc: "List of data loaded by init/refresh." },
    { name: "st.<slice>ListLoading: boolean", desc: "Loading status of the list." },
    { name: "st.<slice>InitList: DataList<Light>", desc: "Initial list snapshot." },
    { name: "st.<slice>InitAt: Date", desc: "Time when the list was initialized." },
    { name: "st.<slice>Selection: DataList<Light>", desc: "Selected items in the list." },
    { name: "st.<slice>Insight: Insight", desc: "Insight data for the list (e.g. counts)." },
    { name: "st.lastPageOf<Slice>: number", desc: "Last accessed page number." },
    { name: "st.pageOf<Slice>: number", desc: "Current page number." },
    { name: "st.limitOf<Slice>: number", desc: "Items per page." },
    { name: "st.queryArgsOf<Slice>: QueryArgs", desc: "Current query arguments." },
    { name: "st.sortOf<Slice>: Sort", desc: "Current sort setting." },
  ];

  const sliceMethods: IntroItem[] = [
    { name: "init<Slice>(...args): Promise<void>", desc: "Initialize list with query args." },
    { name: "refresh<Slice>(initForm?): Promise<void>", desc: "Reload list with strict consistency." },
    { name: "select<Slice>(model, options?): void", desc: "Update selection state." },
    { name: "setPageOf<Slice>(page, options?): Promise<void>", desc: "Change page and reload." },
    { name: "addPageOf<Slice>(page, options?): Promise<void>", desc: "Load next page and append." },
    { name: "setLimitOf<Slice>(limit, options?): Promise<void>", desc: "Change list limit and reload." },
    { name: "setQueryArgsOf<Slice>(...args): Promise<void>", desc: "Change query arguments and reload." },
    { name: "setSortOf<Slice>(sort, options?): Promise<void>", desc: "Change sort and reload." },
  ];

  const stateManagementMethods: IntroItem[] = [
    {
      name: "get()",
      desc: l.trans({
        en: "Get the current snapshot of the store state.",
        ko: "스토어 상태의 현재 스냅샷을 가져옵니다.",
      }),
      example: `const { product, productList } = this.get();`,
    },
    {
      name: "set(state)",
      desc: l.trans({
        en: "Update the store state. Merges shallowly.",
        ko: "스토어 상태를 업데이트합니다. 얕게 병합됩니다.",
      }),
      example: `this.set({ productLoading: true });
// Functional update
this.set(state => ({ count: state.count + 1 }));`,
    },
    {
      name: "pick(...keys)",
      desc: l.trans({
        en: "Select specific properties from the state. Guaranteed to be non-nullable (throws if null/undefined).",
        ko: "상태에서 특정 속성을 선택합니다. Non-nullable이 보장됩니다. (null/undefined일 경우 에러 발생)",
      }),
      example: `const { product, user } = this.pick("product", "user");`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="store-overview" title={"model.store.ts"}>
        <Docs.Title>{"model.store.ts"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The store file manages client-side state and synchronizes with the server via Signals. It extends the functionality of Zustand.",
              ko: "store 파일은 클라이언트 측 상태를 관리하고 Signals를 통해 서버와 동기화합니다. Zustand의 기능을 확장합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🏪</span>
                <strong className="text-blue-800">{l.trans({ en: "Client State", ko: "클라이언트 상태" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Manages UI state, form data, and cached server data in a reactive way.",
                  ko: "UI 상태, 폼 데이터, 캐시된 서버 데이터를 반응형으로 관리합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="class-structure" title={l.trans({ en: "Store Class Structure", ko: "Store 클래스 구조" })}>
        <Docs.Title>{l.trans({ en: "Store Class Structure", ko: "Store 클래스 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Stores are defined using the store() function, which binds a Signal (server syncing definition) and an initial state.",
              ko: "Store는 store() 함수를 사용하여 정의되며, Signal(서버 동기화 정의)과 초기 상태를 바인딩합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.store.ts"
            code={`import { store } from "@akanjs/store";
import { fetch, sig } from "../useClient";
import * as cnst from "../cnst";

// store(signal, initialState)
export class ProductStore extends store(sig.product, {
  // Define custom state
  filterOpen: false, 
  customData: null as string | null,
}) {
  // Define actions
  toggleFilter() {
    const { filterOpen } = this.get();
    this.set({ filterOpen: !filterOpen });
  }

  async customAction() {
    const { product } = this.pick("product");
    // ... logic
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="state-management" title={l.trans({ en: "State Interaction", ko: "상태 상호작용" })}>
        <Docs.Title>{l.trans({ en: "State Interaction", ko: "상태 상호작용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Stores provide built-in methods to interact with the state safely.",
              ko: "Store는 상태와 안전하게 상호작용하기 위한 내장 메서드를 제공합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={stateManagementMethods} />

        <div className="mb-4" />
        <div className="rounded-lg bg-orange-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-orange-600">⚡</span>
            <strong className="text-orange-800">
              {l.trans({ en: "Non-nullable Guarantee", ko: "Non-nullable 보장" })}
            </strong>
          </div>
          <div className="text-orange-700 text-sm">
            {l.trans({
              en: "The 'pick' method throws an error immediately if any of the requested keys are null or undefined. Use 'get' if you need to handle nulls manually.",
              ko: "'pick' 메서드는 요청한 키 중 하나라도 null이나 undefined이면 즉시 에러를 발생시킵니다. null 처리가 필요하다면 'get'을 사용하세요.",
            })}
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="standard-api" title={l.trans({ en: "Standard Model API (Base)", ko: "표준 모델 API (기본)" })}>
        <Docs.Title>{l.trans({ en: "Standard Model API (Base)", ko: "표준 모델 API (기본)" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These states and actions are automatically generated for every Store bound to a Signal. They handle the basic CRUD and form operations for the single model instance.",
              ko: "이러한 상태와 동작은 Signal에 바인딩된 모든 Store에 대해 자동으로 생성됩니다. 단일 모델 인스턴스에 대한 기본 CRUD 및 양식 작업을 처리합니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>2.1. Base State (Standard)</Docs.SubTitle>
        <Docs.IntroTable type="field" items={baseVariables} />

        <div className="mb-8" />

        <Docs.SubTitle>2.2. Base Actions (Standard)</Docs.SubTitle>
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
              en: "State and methods are generated based on Slices defined in model.signal.ts. This includes the 'Default Slice' (always available) and any custom slices.",
              ko: "상태와 메서드는 model.signal.ts에 정의된 Slice를 기반으로 생성됩니다. 여기에는 '기본 Slice'(항상 사용 가능)와 모든 커스텀 Slice가 포함됩니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>3.1. Slice Definition (Signal)</Docs.SubTitle>
        <Code.Snippet
          title="product.signal.ts"
          code={`export class ProductSlice extends slice(
  srv.product,
  // ... guards
  (init) => ({
    // Custom Slice: "inMarket"
    inMarket: init()
      .param("marketId", ID)
      .exec(function (marketId) {
        return this.productService.listByMarket(marketId);
      }),
  })
) {}`}
        />

        <div className="mb-8" />

        <Docs.SubTitle>3.2. Generated Slice State</Docs.SubTitle>
        <div className="mb-4 text-base-content/70 text-sm">
          {l.trans({
            en: "Replace <Slice> with the capitalized slice name. For the default slice, usually the <Slice> suffix is essentially the model name.",
            ko: "<Slice>를 대문자로 시작하는 Slice 이름으로 대체하세요. 기본 Slice의 경우, 대개 <Slice> 접미사는 본질적으로 모델 이름입니다.",
          })}
        </div>
        <Docs.IntroTable type="field" items={sliceVariables} />

        <div className="mb-8" />

        <Docs.SubTitle>3.3. Generated Slice Actions</Docs.SubTitle>
        <Docs.IntroTable type="method" items={sliceMethods} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="usage-patterns" title={l.trans({ en: "Usage Patterns", ko: "사용 패턴" })}>
        <Docs.Title>{l.trans({ en: "Usage Patterns", ko: "사용 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "There are two distinct ways to interact with the Store: inside the Store class itself, and from React Components.",
              ko: "Store와 상호작용하는 방법은 두 가지가 있습니다: Store 클래스 내부에서와 React 컴포넌트에서입니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>4.1. Inside Store Class</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Use 'this.get()' to access state and 'this.anyAction()' to call methods. Use 'this.set()' for updates.",
            ko: "'this.get()'으로 상태에 접근하고 'this.anyAction()'으로 메서드를 호출하세요. 업데이트에는 'this.set()'을 사용합니다.",
          })}
        </Docs.Description>
        <Code.Snippet
          title="Inside Store"
          code={`// Access State
const { product } = this.get();
const { product, user } = this.pick("product", "user"); // Non-nullable check

// Call Action
await this.updateProduct(product.id, { name: "New Name" });

// Update State
this.set({ productLoading: true });`}
        />

        <div className="mb-8" />

        <Docs.SubTitle>4.2. Inside React Component</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Use 'st.use.stateName()' hooks for reactive state access and 'st.do.actionName()' for invoking actions.",
            ko: "반응형 상태 접근을 위해 'st.use.stateName()' 훅을 사용하고, 액션 호출을 위해 'st.do.actionName()'을 사용하세요.",
          })}
        </Docs.Description>
        <Code.Snippet
          title="Inside Component"
          code={`// Reactive State Hook
const product = st.use.product();
const productList = st.use.productList();

// Invoke Action
<button onClick={() => st.do.updateProduct(product.id, { ... })}>
  Save
</button>`}
        />

        <div className="mb-8" />

        <Docs.Title>{l.trans({ en: "Auto-Generated Setters", ko: "자동 생성된 Setter" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When you define a state property, a corresponding setter method is automatically added to 'st.do'. You can also use 'st.set' directly.",
              ko: "상태 속성을 정의하면 해당 Setter 메서드가 'st.do'에 자동으로 추가됩니다. 'st.set'을 직접 사용할 수도 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Setter Examples"
          code={`// Given State: { filterOpen: false }

// 1. Auto-generated Setter
st.do.setFilterOpen(true);

// 2. Direct Set
st.set({ filterOpen: true });`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="global-access" title={l.trans({ en: "Other Stores (Global)", ko: "다른 스토어 (전역)" })}>
        <Docs.Title>{l.trans({ en: "Other Stores (Global)", ko: "다른 스토어 (전역)" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Since the Store is a single global instance, you can access state and actions from other stores. However, you must explicitly cast 'this' to 'RootStore' to satisfy TypeScript.",
              ko: "Store는 단일 전역 인스턴스이므로 다른 스토어의 상태와 액션에 접근할 수 있습니다. 단, TypeScript를 만족시키기 위해 'this'를 'RootStore'로 명시적으로 캐스팅해야 합니다.",
            })}
          </div>
          <div className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
            <strong>RootStore</strong>:{" "}
            {l.trans({
              en: "A type that merges all Store definitions in the application.",
              ko: "애플리케이션의 모든 Store 정의가 병합된 타입입니다.",
            })}
          </div>
        </Docs.Description>

        <Code.Snippet
          title="product.store.ts"
          code={`import type { RootStore } from "../st"; // Import RootStore type

export class ProductStore extends store(sig.product, { ... }) {
  async complexAction() {
    // 1. Accessing other store's state
    const { user } = (this as unknown as RootStore).get();
    
    // 2. Calling other store's action
    await (this as unknown as RootStore).updateUser(user.id, { ... });
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Store Best Practices", ko: "Store 모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Store Best Practices", ko: "Store 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Use 'pick' for State Access", ko: "'pick'을 사용하여 상태 접근" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Prefer 'pick' over 'get' when you only need specific fields. It makes dependencies explicit.",
                  ko: "특정 필드만 필요할 때는 'get'보다 'pick'을 선호하세요. 의존성을 명확하게 합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Keep Async Logic in Store", ko: "비동기 로직은 Store에" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "UI-related async operations (fetching, submitting) belong in the Store. Pure business logic belongs in the Service.",
                  ko: "UI 관련 비동기 작업(fetch, submit)은 Store에 속합니다. 순수 비즈니스 로직은 Service에 속합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
