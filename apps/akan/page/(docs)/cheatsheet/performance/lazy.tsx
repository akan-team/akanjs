import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Lazy Loading", ko: "지연 로딩" })}>
        <Docs.Title>{l.trans({ en: "Lazy Loading", ko: "지연 로딩" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Lazy loading means the first page does not download every heavy component right away. Load expensive UI only when the user reaches it.",
              ko: "Lazy loading은 첫 화면에서 모든 무거운 component를 바로 받지 않는 방식입니다. 사용자가 실제로 볼 때 비싼 UI를 불러오세요.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Good for maps, charts, editors, 3D viewers, and wallet widgets.",
                ko: "지도, 차트, 에디터, 3D viewer, wallet widget에 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Good for large admin panels that are not always opened.",
                ko: "항상 열리지 않는 큰 admin panel에도 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Not useful for tiny buttons or above-the-fold content.",
                ko: "작은 버튼이나 첫 화면 핵심 content에는 별로 도움이 되지 않습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="external" title={l.trans({ en: "External Libraries", ko: "외부 라이브러리" })}>
        <Docs.Title>{l.trans({ en: "External Libraries", ko: "외부 라이브러리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some libraries are large or depend on browser-only APIs such as `window`. Wrap them with `lazy` and disable SSR when needed.",
              ko: "어떤 라이브러리는 크거나 `window` 같은 브라우저 전용 API에 의존합니다. 필요하면 `lazy`로 감싸고 SSR을 끄세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Map widget", ko: "지도 widget" })}
          code={`"use client";
import { lazy } from "akanjs/webkit";

const MapWidget = lazy(() => import("heavy-map-widget"), {
  ssr: false,
  loading: () => <div className="skeleton h-64" />,
});

interface ArticleMapProps {
  center: Point;
}
export const ArticleMap = ({ center }: ArticleMapProps) => {
  return <MapWidget center={center} />;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="internal" title={l.trans({ en: "Large Components", ko: "큰 component" })}>
        <Docs.Title>{l.trans({ en: "Large Components", ko: "큰 component" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "You can also split your own components. This is useful when a page has a heavy editor or dashboard that opens only after a click.",
              ko: "직접 만든 component도 나눌 수 있습니다. 클릭 후에만 열리는 무거운 editor나 dashboard가 있을 때 유용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Lazy editor", ko: "Lazy editor" })}
          code={`import { lazy } from "akanjs/webkit";

const ArticleEditor = lazy(() => import("./ArticleEditor"), {
  loading: () => <div>Loading editor...</div>,
});

interface EditPanelProps {
  open: boolean;
}
export const EditPanel = ({ open }: EditPanelProps) => {
  if (!open) return null;
  return <ArticleEditor />;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="ssr" title={l.trans({ en: "SSR Or Client Only", ko: "SSR 또는 client only" })}>
        <Docs.Title>{l.trans({ en: "SSR Or Client Only", ko: "SSR 또는 client only" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use default lazy when the component can render on the server.",
                ko: "Component가 서버에서 렌더링 가능하면 기본 lazy를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `{ ssr: false }` when the library needs `window`, `document`, canvas, WebGL, or browser storage.",
                ko: "라이브러리가 `window`, `document`, canvas, WebGL, browser storage를 필요로 하면 `{ ssr: false }`를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Always give a loading fallback when the blank space would be confusing.",
                ko: "빈 공간이 어색하다면 항상 loading fallback을 제공하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Split by user intent: editor, map, chart, modal, viewer.",
                ko: "사용자 의도 기준으로 나누세요. editor, map, chart, modal, viewer가 좋은 단위입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Do not lazy-load the first thing users need to see.",
                ko: "사용자가 처음 봐야 하는 핵심 요소는 lazy-load하지 마세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If many pages use the same component immediately, lazy may only add delay.",
                ko: "많은 페이지가 같은 component를 즉시 사용한다면 lazy가 오히려 지연을 만들 수 있습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
