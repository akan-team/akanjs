import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="service-store" title={l.trans({ en: "Service Store", ko: "Service store" })}>
        <Docs.Title>{l.trans({ en: "Service Store", ko: "Service store" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service store coordinates client state for a service feature. It owns local state, fetch calls, loading flags, selected values, pagination, and UI-facing actions.",
              ko: "Service store는 service feature의 client state를 조율합니다. local state, fetch call, loading flag, selected value, pagination, UI-facing action을 담당합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: 'Service stores usually start with a string reference: `store("search" as const, ...)`. They do not automatically receive model form, slice, or CRUD helpers unless the store is bound to a model signal.',
              ko: 'Service store는 보통 `store("search" as const, ...)`처럼 string reference에서 시작합니다. model signal에 묶이지 않는 한 model form, slice, CRUD helper가 자동으로 붙지 않습니다.',
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="string-store" title={l.trans({ en: "String Store Ref", ko: "String store ref" })}>
        <Docs.Title>{l.trans({ en: "String Store Ref", ko: "String store ref" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use the service name as the store ref. The state factory returns the initial local state for the feature, not a generated model form.",
              ko: "Store ref에는 service name을 사용합니다. state factory는 generated model form이 아니라 feature의 initial local state를 반환합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="minimal service store"
          code={`export class SearchStore extends store("search" as const, () => ({
  searchIndexName: null as string | null,
  loading: false,
  searchString: "",
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="fetch-actions" title={l.trans({ en: "Fetch Actions", ko: "Fetch action" })}>
        <Docs.Title>{l.trans({ en: "Fetch Actions", ko: "Fetch action" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Service store methods usually call generated `fetch.*` functions from service endpoints, then update local state with `set()`. This keeps React components thin.",
              ko: "Service store method는 보통 service endpoint에서 생성된 `fetch.*` 함수를 호출한 뒤 `set()`으로 local state를 갱신합니다. 이렇게 하면 React component가 얇아집니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="loading and fetch"
          code={`async setSearchIndexName(searchIndexName: string) {
  this.set({ searchIndexName, loading: true });

  const searchResult = await fetch.getSearchResult(searchIndexName);

  this.set({ searchResult, loading: false });
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="pagination-state" title={l.trans({ en: "Feature State", ko: "Feature state" })}>
        <Docs.Title>{l.trans({ en: "Feature State", ko: "Feature state" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Keep service-specific UI state in the store when several controls need to share it. Search text, selected index, current page, and loading status are good examples.",
              ko: "여러 control이 공유해야 하는 service-specific UI state는 store에 둡니다. search text, selected index, current page, loading status가 좋은 예입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="pagination action"
          code={`async setPage(page: number) {
  const { searchIndexName } = this.get();
  if (!searchIndexName) return;

  const searchResult = await fetch.getSearchResult(searchIndexName, { page });
  this.set({ page, searchResult });
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
