import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="service-dictionary" title={l.trans({ en: "Service Dictionary", ko: "Service dictionary" })}>
        <Docs.Title>{l.trans({ en: "Service Dictionary", ko: "Service dictionary" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service dictionary names the service-facing language: endpoint labels, endpoint arguments, button text, toast messages, and small UI phrases. It is not tied to model fields.",
              ko: "Service dictionary는 endpoint label, endpoint argument, button text, toast message, 작은 UI phrase 같은 service-facing language를 정의합니다. model field에 묶이지 않습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: 'Use `serviceDictionary(["en", "ko"])` for service modules. Add endpoint translations when the service exposes APIs and translate keys when UI or store messages need reusable text.',
              ko: 'Service module에는 `serviceDictionary(["en", "ko"])`를 사용합니다. service가 API를 노출하면 endpoint translation을 추가하고, UI나 store message에 재사용할 문구가 필요하면 translate key를 추가합니다.',
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="endpoint-labels" title={l.trans({ en: "Endpoint Labels", ko: "Endpoint label" })}>
        <Docs.Title>{l.trans({ en: "Endpoint Labels", ko: "Endpoint label" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `.endpoint<Endpoint>()` to keep endpoint names and descriptions typed. The callback keys should match the signal endpoint methods.",
              ko: "Endpoint name과 description을 typed 상태로 유지하려면 `.endpoint<Endpoint>()`를 사용합니다. callback key는 signal endpoint method와 일치해야 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="endpoint label"
          code={`import { serviceDictionary } from "akanjs/dictionary";
import type { SearchEndpoint } from "./search.signal";

export const dictionary = serviceDictionary(["en", "ko"]).endpoint<SearchEndpoint>((fn) => ({
  getSearchResult: fn(["Get search result", "검색 결과 가져오기"]),
}));`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="endpoint-args" title={l.trans({ en: "Endpoint Arguments", ko: "Endpoint argument" })}>
        <Docs.Title>{l.trans({ en: "Endpoint Arguments", ko: "Endpoint argument" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `.arg(...)` when endpoint params, search values, or body values need labels in docs, generated UI, admin screens, or validation messages.",
              ko: "endpoint param, search value, body value가 docs, generated UI, admin screen, validation message에서 label이 필요하면 `.arg(...)`를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="one argument"
          code={`export const dictionary = serviceDictionary(["en", "ko"]).endpoint<SearchEndpoint>((fn) => ({
  getSearchResult: fn(["Get search result", "검색 결과 가져오기"]).arg((t) => ({
    searchIndexName: t(["Search index name", "검색 인덱스 이름"]),
  })),
}));`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="translate-keys" title={l.trans({ en: "Translate Keys", ko: "Translate key" })}>
        <Docs.Title>{l.trans({ en: "Translate Keys", ko: "Translate key" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `.translate({ ... })` for service UI phrases that are not endpoint names. This is common for toast messages, status labels, common controls, and admin UI text.",
              ko: "Endpoint name이 아닌 service UI phrase에는 `.translate({ ... })`를 사용합니다. toast message, status label, common control, admin UI text에 자주 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="service phrases"
          code={`export const dictionary = serviceDictionary(["en", "ko"]).translate({
  loading: ["Loading...", "불러오는 중..."],
  healthy: ["Healthy", "정상"],
});`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="using-keys" title={l.trans({ en: "Using Keys", ko: "Key 사용" })}>
        <Docs.Title>{l.trans({ en: "Using Keys", ko: "Key 사용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Client UI can read service endpoint labels through `l("search.signal.resyncSearchDocuments")`. Store actions can use translated loading, success, and error keys for messages when the service action runs.',
              ko: 'Client UI는 `l("search.signal.resyncSearchDocuments")`로 service endpoint label을 읽을 수 있습니다. Store action은 service action을 실행할 때 loading, success, error용 translated key를 message로 사용할 수 있습니다.',
            })}
          </div>
        </Docs.Description>
        <Code.Snippet title="client usage" code={`<button>{l("search.signal.getSearchResult")}</button>`} />
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
