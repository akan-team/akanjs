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
  "./blank.tsx": async () => ({
    default: page()
      .app("showBlank", "Show nothing.", () => null, { static: true })
      .render(() => null),
  }),
};
