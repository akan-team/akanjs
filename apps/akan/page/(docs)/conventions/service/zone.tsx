import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="service-zone" title={l.trans({ en: "Service Zone", ko: "Service Zone" })}>
        <Docs.Title>{l.trans({ en: "Service Zone", ko: "Service Zone" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service Zone is a client page section for a service feature. It composes store state, store actions, service UI controls, loading indicators, results, and pagination.",
              ko: "Service Zone은 service feature를 위한 client page section입니다. store state, store action, service UI control, loading indicator, result, pagination을 조립합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "It is not a model list section by default. The `_search` Zone renders search administration UI, even though search itself is a service workflow rather than a document model.",
              ko: "기본적으로 model list section이 아닙니다. `_search` Zone은 search가 document model이 아니라 service workflow인데도 search administration UI를 렌더링합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Because service modules are workflow-oriented, service Zones are fairly flexible. Treat them as client components where you can freely compose the controls, result views, and domain-specific UI that the service needs.",
              ko: "Service module은 workflow 중심이기 때문에 service Zone의 자유도는 꽤 높은 편입니다. service에 필요한 control, result view, domain-specific UI를 자유롭게 조합하는 client component로 보면 됩니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="store-driven-section"
        title={l.trans({ en: "Store-Driven Section", ko: "Store-driven section" })}
      >
        <Docs.Title>{l.trans({ en: "Store-Driven Section", ko: "Store-driven section" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service Zone usually reads state through `st.use.*` and runs feature actions through `st.do.*`. Keep data loading in store actions and let Zone focus on composition.",
              ko: "Service Zone은 보통 `st.use.*`로 state를 읽고 `st.do.*`로 feature action을 실행합니다. data loading은 store action에 두고 Zone은 composition에 집중합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "When a small interaction is reused, pull it from the service Util file. Zone can then arrange those Util pieces with local domain components into the final page section.",
              ko: "재사용되는 작은 interaction은 service Util 파일에서 가져다 쓰면 됩니다. Zone은 그런 Util 조각과 domain component를 배치해서 최종 page section을 구성합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="minimal service zone"
          code={`"use client";

export const Database = () => {
  const searchIndexName = st.use.searchIndexName();
  const searchResult = st.use.searchResult();

  useEffect(() => {
    void st.do.getSearchIndexNames();
  }, []);

  return <SearchResults result={searchResult} disabled={!searchIndexName} />;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
