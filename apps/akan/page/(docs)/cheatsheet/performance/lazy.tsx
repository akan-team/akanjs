import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsList, DocsToc } from "@apps/akan/ui";
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
          <DocsList>
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
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

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
          className="w-full"
          title={l.trans({ en: "Map widget", ko: "지도 widget" })}
          code={`"use client";
import { lazy } from "akanjs/webkit";

const MapWidget = lazy(() => import("heavy-map-widget"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-box bg-muted" />,
});

interface ArticleMapProps {
  center: Point;
}
export const ArticleMap = ({ center }: ArticleMapProps) => {
  return <MapWidget center={center} />;
};`}
        />
      </Scroll.Slide>
      <Divider />

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
          className="w-full"
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
      <Divider />

      <Scroll.Slide id="server" title={l.trans({ en: "Server Adapters", ko: "서버 어댑터" })}>
        <Docs.Title>{l.trans({ en: "Server Adapters", ko: "서버 어댑터" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The same idea applies on the server, where the cost is memory instead of bundle size. A `srvkit` barrel re-exports every adapter, so importing one helper loads every SDK the folder touches — and each one stays resident in every replica and every batch worker.",
              ko: "서버에도 같은 원리가 적용되는데, 여기서는 비용이 번들 크기가 아니라 메모리입니다. `srvkit` barrel은 모든 adapter를 re-export하므로, helper 하나만 import해도 그 폴더가 쓰는 SDK가 전부 로드되고, 각각이 모든 replica와 batch worker에 상주합니다.",
            })}
          </div>
          <DocsList>
            <li>
              {l.trans({
                en: "Measured in this workspace: puppeteer 19MB, discord.js 23MB, nodemailer 16MB, firebase-admin 2MB — about 61MB resident before a single request arrives.",
                ko: "이 workspace 실측: puppeteer 19MB, discord.js 23MB, nodemailer 16MB, firebase-admin 2MB로, 요청이 하나도 오기 전에 약 61MB가 상주합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Gating construction is not enough. `options.discord ? new DiscordApi(...) : null` still runs the import at module scope.",
                ko: "생성만 막는 것으로는 부족합니다. `options.discord ? new DiscordApi(...) : null`이어도 import는 module scope에서 실행됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Worth it for a heavy SDK an app may never configure: mail, push, Discord, a headless browser, an image encoder.",
                ko: "앱이 설정하지 않을 수도 있는 무거운 SDK에 적합합니다. 메일, 푸시, Discord, headless browser, 이미지 인코더가 그렇습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Not worth it for small pure helpers such as jwt or aes — they cost nothing and are used on every request.",
                ko: "jwt나 aes 같은 작은 순수 helper에는 불필요합니다. 비용이 없고 매 요청마다 쓰입니다.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title={l.trans({ en: "Memoized module import", ko: "메모이즈된 module import" })}
          code={`import { adapt } from "akanjs/service";

// Memoized at module scope, resolved on first use: the SDK is absent from a process that never sends a message.
let discordLoad: Promise<typeof import("discord.js")> | null = null;
const loadDiscord = () => {
  discordLoad ??= import("discord.js");
  return discordLoad;
};

export class DiscordApi extends adapt("discordApi" as const, ({ env }) => ({
  token: env(() => process.env.DISCORD_TOKEN ?? ""),
})) {
  #client: import("discord.js").Client | null = null;

  async #getClient() {
    if (this.#client) return this.#client;
    const { Client, GatewayIntentBits } = await loadDiscord();
    this.#client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await this.#client.login(this.token);
    return this.#client;
  }

  async send(channelId: string, content: string) {
    const client = await this.#getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;
    return await channel.send(content);
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Check what a process actually pays with `AKAN_MEMORY_LOG=1`, which reports RSS per replica on an interval.",
              ko: "프로세스가 실제로 쓰는 비용은 `AKAN_MEMORY_LOG=1`로 확인하세요. replica별 RSS를 주기적으로 보고합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="ssr" title={l.trans({ en: "SSR Or Client Only", ko: "SSR 또는 client only" })}>
        <Docs.Title>{l.trans({ en: "SSR Or Client Only", ko: "SSR 또는 client only" })}</Docs.Title>
        <Docs.Description>
          <DocsList>
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
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <DocsList>
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
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
}
