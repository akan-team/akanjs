import { type ReactNode, Suspense } from "react";
import { registerClientReference } from "react-server-dom-webpack/server.node";
import { page } from "../client/route/routeBuilders";
import { untrackedHeaders } from "../fetch/requestStorage";
import { lazy } from "../webkit/lazy";
import type { PagesContext } from "./routeTreeBuilder";

const ClientNote = registerClientReference(
  (_: { label: string }): ReactNode => {
    throw new Error("ClientNote is a client component");
  },
  "staticapp/client",
  "ClientNote",
);

const NeverReady = registerClientReference(
  (): ReactNode => {
    throw new Error("NeverReady is a client component");
  },
  "staticapp/client",
  "NeverReady",
);

const ClientThrows = registerClientReference(
  (): ReactNode => {
    throw new Error("ClientThrows is a client component");
  },
  "staticapp/client",
  "ClientThrows",
);

const BrowserChart = registerClientReference(
  (): ReactNode => {
    throw new Error("BrowserChart is a client component");
  },
  "staticapp/client",
  "BrowserChart",
);

const ServerCanvas = lazy(async () => ({ default: () => <canvas /> }), {
  ssr: false,
  loading: () => <i>canvas loading</i>,
});

const LateNote = async (): Promise<ReactNode> => {
  await Bun.sleep(20);
  return <p>late note</p>;
};

const Unsettled = async (): Promise<ReactNode> => await new Promise<ReactNode>(() => undefined);

const ServerThrows = (): ReactNode => {
  throw new Error("the board is missing");
};

const Raw = ({ html }: { html: string }): ReactNode => (
  // biome-ignore lint/security/noDangerouslySetInnerHtml: markup an app could write, which the static render must strip
  <div dangerouslySetInnerHTML={{ __html: html }} />
);

const signedIn = () => {
  if (untrackedHeaders().get("authorization") !== "Bearer u1")
    throw Object.assign(new Error("redirect"), { digest: "AKAN_REDIRECT", location: "/signin" });
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>page frame{children}</main>,
    theme: "dark",
    McpAppRoot: ({ children, path }: { children: ReactNode; path: string }) => (
      <section data-app-root={path}>{children}</section>
    ),
  }),
  "./board.tsx": async () => ({
    default: page()
      .guard(signedIn)
      .app(
        "showBoard",
        "Show the board.",
        () => (
          <article>
            <h1>Board</h1>
            <ClientNote label="client note" />
            <Suspense fallback={<i>loading</i>}>
              <LateNote />
            </Suspense>
          </article>
        ),
        { static: true },
      )
      .app("showLiveBoard", "Show the live board.", () => <h1>Live</h1>)
      .render(() => <p>board page</p>),
  }),
  "./canvas.tsx": async () => ({
    default: page()
      .app("showCanvas", "Show the canvas.", () => <ServerCanvas />, { static: true })
      .render(() => null),
  }),
  "./chart.tsx": async () => ({
    default: page()
      .app(
        "showChart",
        "Show the chart.",
        () => (
          <article>
            <h1>Chart</h1>
            <BrowserChart />
          </article>
        ),
        { static: true },
      )
      .render(() => null),
  }),
  "./scripted.tsx": async () => ({
    default: page()
      .app(
        "showScripted",
        "Show the scripted note.",
        () => (
          <article>
            <h1>Scripted</h1>
            <Raw html={"<script>boot()</script><script>inner()</script\t\n x><p>kept</p>"} />
          </article>
        ),
        { static: true },
      )
      .app(
        "showSpliced",
        "Show the spliced note.",
        () => <Raw html="<p>spliced</p><scr<script></script>ipt>run()</script>" />,
        { static: true },
      )
      .render(() => null),
  }),
  "./active.tsx": async () => ({
    default: page()
      .app(
        "showActive",
        "Show the active note.",
        () => (
          <article>
            <h1>Active</h1>
            <Raw
              html={[
                '<p onclick="go()" ONMOUSEOVER="go()" title="kept title">active text</p>',
                '<iframe srcdoc="<p>inner</p>" title="frame"></iframe>',
                '<object data="/movie.swf"></object><embed src="/movie.swf">',
                '<meta http-equiv="refresh" content="0;url=/away">',
                '<a href=" &#x6A;ava\tscript:go()">entity link</a>',
                '<a href="JAVASCRIPT:go()">upper link</a>',
                '<a href="\u0001javascript:go()">control link</a>',
                '<form action="javascript:go()"><button formaction="javascript:go()">send</button></form>',
                '<svg><a xlink:href="javascript:go()"><text>svg link</text></a></svg>',
                '<img src="javascript:go()" alt="pic"><a href="/kept">plain link</a>',
              ].join("")}
            />
          </article>
        ),
        { static: true },
      )
      .render(() => null),
  }),
  "./slow.tsx": async () => ({
    default: page()
      .app("showHung", "Show a board whose load never ends.", () => new Promise<ReactNode>(() => undefined), {
        static: true,
      })
      .app(
        "showUnsettled",
        "Show a board whose component never ends.",
        () => (
          <article>
            <h1>Unsettled</h1>
            <Suspense fallback={<i>waiting</i>}>
              <Unsettled />
            </Suspense>
          </article>
        ),
        { static: true },
      )
      .app(
        "showNeverReady",
        "Show a board whose client part never ends.",
        () => (
          <article>
            <h1>Never ready</h1>
            <Suspense fallback={<i>waiting</i>}>
              <NeverReady />
            </Suspense>
          </article>
        ),
        { static: true },
      )
      .render(() => null),
  }),
  "./broken.tsx": async () => ({
    default: page()
      .app(
        "showServerThrows",
        "Show a board that throws on the server.",
        () => (
          <article>
            <h1>Broken</h1>
            <ServerThrows />
          </article>
        ),
        { static: true },
      )
      .app(
        "showClientThrows",
        "Show a board whose client part throws.",
        () => (
          <article>
            <h1>Broken</h1>
            <ClientThrows />
          </article>
        ),
        { static: true },
      )
      .app("showHuge", "Show a board past the size cap.", () => <p>{"x".repeat(1024 * 1024 + 1)}</p>, {
        static: true,
      })
      .render(() => null),
  }),
  "./blank.tsx": async () => ({
    default: page()
      .app("showBlank", "Show nothing.", () => null, { static: true })
      .render(() => null),
  }),
};
