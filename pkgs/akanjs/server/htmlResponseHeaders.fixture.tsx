import { createHash } from "node:crypto";
import { type ReactNode, Suspense } from "react";
import { page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import { scriptHashes, scriptNonce } from "../client/scriptPolicy";
import type { PagesContext } from "./routeTreeBuilder";

export const declaredSnippet = "window.dataLayer=window.dataLayer||[];";
export const noncedSnippet = "window.noncedRan=true;";
export const declaredHash = `sha256-${createHash("sha256").update(declaredSnippet).digest("base64")}`;

export const manyDeclaredHashes = Array.from(
  { length: 40 },
  (_, index) => `sha256-${createHash("sha256").update(`declared ${index}`).digest("base64")}`,
);
export const boundaryCount = 34;

const Late = async ({ index }: { index: number }) => {
  await Bun.sleep(40);
  return <b>late {index}</b>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
  }),
  "./plain/_index.tsx": async () => ({
    default: page().render(() => <p id="plain">plain content</p>),
  }),
  "./streamed/_index.tsx": async () => ({
    default: page()
      .loading(() => <i>page loading</i>)
      .render(async () => {
        await Bun.sleep(120);
        return <p>loaded content</p>;
      }),
  }),
  "./hashed/_index.tsx": async () => ({
    default: page()
      .head(() => {
        scriptHashes(declaredHash);
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant snippet, named by hash in the policy
        return <script dangerouslySetInnerHTML={{ __html: declaredSnippet }} />;
      })
      .render(() => <p>hashed content</p>),
  }),
  "./nonced/_index.tsx": async () => ({
    default: page()
      .head(() => (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant snippet, run under the response's nonce
        <script nonce={scriptNonce()} dangerouslySetInnerHTML={{ __html: noncedSnippet }} />
      ))
      .render(() => <p>nonced content</p>),
  }),
  "./echoed/_index.tsx": async () => ({
    default: page().render(() => <p>{`nonce:${scriptNonce() ?? "none"}`}</p>),
  }),
  "./declares/_index.tsx": async () => ({
    default: page()
      .head(() => {
        scriptHashes(...manyDeclaredHashes);
        return <meta name="declares" content="many" />;
      })
      .render(() => <p>declares many</p>),
  }),
  "./boundaries/_index.tsx": async () => ({
    default: page().render(() => (
      <div>
        {Array.from({ length: boundaryCount }, (_, index) => (
          <Suspense key={index} fallback={<i>waiting</i>}>
            <Late index={index} />
          </Suspense>
        ))}
      </div>
    )),
  }),
  "./late/_index.tsx": async () => ({
    default: page()
      .loading(() => <i>late loading</i>)
      .render(async () => {
        await Bun.sleep(120);
        return router.redirect("/plain");
      }),
  }),
};
