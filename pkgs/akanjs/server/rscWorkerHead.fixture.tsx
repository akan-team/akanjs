import { appendFileSync } from "node:fs";
import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { AkanRedirectError } from "../client/router";
import type { PagesContext } from "./routeTreeBuilder";

const log = (name: string) => {
  if (process.env.AKAN_TEST_HEAD_LOG) appendFileSync(process.env.AKAN_TEST_HEAD_LOG, `${name}\n`);
};
const headOf = (name: string) => () => {
  log(name);
  return <title>{name}</title>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./cached.tsx": async () => ({
    default: page()
      .head(headOf("cached"))
      .render(() => <p>cached body</p>),
  }),
  "./safe.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(headOf("safe"))
      .render(() => <p>safe body</p>),
  }),
  "./faded.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true, transition: "fade" })
      .head(headOf("faded"))
      .render(() => <p>faded body</p>),
  }),
  "./wordy.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(() => (
        <>
          <title>wordy</title>
          <meta name="description" content={"설명".repeat(400)} />
        </>
      ))
      .render(() => <p>wordy body</p>),
  }),
  "./query/_layout.tsx": async () => ({
    default: layout()
      .search("tab", String)
      .head(({ tab }) => <meta name="section" content={tab ?? "none"} />)
      .render(({ children }) => children),
  }),
  "./query/list.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(headOf("list"))
      .render(() => <p>list body</p>),
  }),
  "./quiet/_layout.tsx": async () => ({
    default: layout()
      .head(() => <>{false}</>)
      .render(({ children }) => children),
  }),
  "./quiet/bare.tsx": async () => ({
    default: page().render(() => <p>bare body</p>),
  }),
  "./(guest)/_layout.tsx": async () => ({
    default: layout().render(({ children }) => <div data-group="guest">{children}</div>),
  }),
  "./(guest)/account/login.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(headOf("login"))
      .render(() => <p>login body</p>),
  }),
  "./(guest)/account/signup.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(headOf("signup"))
      .render(() => <p>signup body</p>),
  }),
  "./(member)/_layout.tsx": async () => ({
    default: layout().render(({ children }) => <div data-group="member">{children}</div>),
  }),
  "./(member)/account/settings.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(headOf("settings"))
      .render(() => <p>settings body</p>),
  }),
  "./vault/_layout.tsx": async () => ({
    default: layout()
      .guard(() => {
        log("vault guard");
        throw new AkanRedirectError("/en/signin");
      })
      .render(({ children }) => children),
  }),
  "./open/_layout.tsx": async () => ({
    default: layout()
      .guard(() => log("open guard"))
      .render(({ children }) => children),
  }),
  "./open/plain.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(() => {
        log("plain");
        return (
          <>
            <title>plain</title>
            <script type="application/ld+json">{"{}"}</script>
          </>
        );
      })
      .render(() => <p>plain body</p>),
  }),
  "./open/headless.tsx": async () => ({
    default: page().render(() => <p>headless body</p>),
  }),
  "./vault/sealed.tsx": async () => ({
    default: page()
      .config({ rscPatchHeadSafe: true })
      .head(headOf("sealed"))
      .render(() => <p>sealed body</p>),
  }),
};
