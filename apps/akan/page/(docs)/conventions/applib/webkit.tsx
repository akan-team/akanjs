import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="webkit-overview" title={l.trans({ en: "Webkit Overview", ko: "Webkit 개요" })}>
        <Docs.Title>{l.trans({ en: "Webkit Overview", ko: "Webkit 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The webkit folder contains reusable code needed during web rendering. It is similar to srvkit, but it is for browser-side or web-rendering logic instead of server-only logic.",
              ko: "webkit 폴더는 웹 렌더링 과정에서 필요한 재사용 코드를 담습니다. srvkit과 비슷하지만, 서버 전용 로직이 아니라 브라우저 또는 웹 렌더링 로직을 위한 폴더입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use it for render maps, browser helpers, web hooks, and wrappers around browser libraries. Pages can then import from the webkit barrel instead of carrying complex logic directly.",
              ko: "render map, browser helper, web hook, 브라우저 라이브러리 wrapper 등에 사용합니다. 페이지는 복잡한 로직을 직접 들고 있지 않고 webkit barrel에서 가져다 쓸 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="what-belongs" title={l.trans({ en: "What Belongs In Webkit", ko: "Webkit에 두는 것" })}>
        <Docs.Title>{l.trans({ en: "What Belongs In Webkit", ko: "Webkit에 두는 것" })}</Docs.Title>
        <div className="space-y-4">
          {[
            {
              title: l.trans({ en: "Render maps", ko: "Render map" }),
              desc: l.trans({
                en: "Static maps used during rendering, such as status colors, badges, icons, labels, or page display options.",
                ko: "status color, badge, icon, label, page display option처럼 렌더링 중 사용하는 정적 map입니다.",
              }),
              snippetTitle: "webkit/ticketStatusColorMap.ts",
              code: `export const ticketStatusColorMap = {
  active: {
    label: "Active",
    badgeColor: "badge-secondary",
  },
  rejected: {
    label: "Rejected",
    badgeColor: "badge-error",
  },
};`,
            },
            {
              title: l.trans({ en: "Browser helpers", ko: "Browser helper" }),
              desc: l.trans({
                en: "Small browser actions such as downloading a file, reading cookies, opening a share link, or copying text.",
                ko: "파일 다운로드, cookie 읽기, share link 열기, text copy처럼 작은 브라우저 동작입니다.",
              }),
              snippetTitle: "webkit/copyText.ts",
              code: `"use client";

export function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}`,
            },
            {
              title: l.trans({ en: "Web hooks", ko: "Web hook" }),
              desc: l.trans({
                en: "Reusable browser hooks for notifications, messaging, viewport state, permission checks, or browser APIs.",
                ko: "notification, messaging, viewport state, permission check, browser API를 다루는 재사용 hook입니다.",
              }),
              snippetTitle: "webkit/useViewportWidth.ts",
              code: `"use client";

import { useEffect, useState } from "react";

export function useViewportWidth() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const sync = () => setWidth(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return width;
}`,
            },
            {
              title: l.trans({ en: "External web wrappers", ko: "외부 웹 라이브러리 wrapper" }),
              desc: l.trans({
                en: "Wrappers around browser libraries so pages do not import vendor packages directly.",
                ko: "페이지가 vendor package를 직접 import하지 않도록 브라우저 라이브러리를 감싸는 코드입니다.",
              }),
              snippetTitle: "webkit/qrCodeCanvas.ts",
              code: `"use client";

import { QRCodeCanvas } from "qrcode.react";

export const qrCodeCanvas = QRCodeCanvas;`,
            },
            {
              title: l.trans({ en: "Routing/account helpers", ko: "Routing/account helper" }),
              desc: l.trans({
                en: "Web helpers that read account state or route users during rendering.",
                ko: "렌더링 중 account state를 읽거나 사용자를 route하는 웹 helper입니다.",
              }),
              snippetTitle: "webkit/getSignedInUser.ts",
              code: `import { getAccount, router } from "akanjs/client";

export function getSignedInUser() {
  const user = getAccount<{ user?: { nickname: string } }>().user;
  if (!user) router.replace("/signin");
  return user;
}`,
            },
          ].map(({ title, desc, snippetTitle, code }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
              <div className="mt-3">
                <Code.Snippet title={snippetTitle} code={code} />
              </div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="barrel-optimization"
        title={l.trans({ en: "Barrel, Optimized Import, And Shape", ko: "Barrel, 최적화 import, 권장 구조" })}
      >
        <Docs.Title>
          {l.trans({ en: "Barrel, Optimized Import, And Shape", ko: "Barrel, 최적화 import, 권장 구조" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The webkit folder is a barrel folder like ui. Export web helpers from index.ts, then import from the barrel. Akan can optimize imports so the page includes only the webkit files it actually uses.",
              ko: "webkit 폴더는 ui처럼 barrel folder입니다. 웹 helper를 index.ts에서 export하고, 페이지에서는 barrel에서 import합니다. Akan은 import를 최적화해서 페이지가 실제로 사용하는 webkit 파일만 bundle에 포함할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Prefer one file, one export, and file name equals export name. This keeps the barrel predictable and helps optimized imports stay precise.",
              ko: "1개 파일, 1개 export, 파일명과 export명을 일치시키는 것을 권장합니다. 이렇게 하면 barrel이 예측 가능해지고 optimized import가 정확하게 동작하기 쉽습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          <Code.Snippet
            title="webkit/downloadFile.ts"
            code={`"use client";

import { saveAs } from "file-saver";

export const downloadFile = async (url: string, filename: string) => {
  const res = await window.fetch(url, { method: "GET" });
  saveAs(await res.blob(), filename);
};`}
          />
          <Code.Snippet title="webkit/index.ts" code={`export { downloadFile } from "./downloadFile";`} />
          <Code.Snippet
            title="page.tsx"
            code={`import { downloadFile } from "@libs/shared/webkit";

export function DownloadButton() {
  return <button onClick={() => downloadFile("/invoice.pdf", "invoice.pdf")}>Download</button>;
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Use webkit for web-rendering logic that is not itself a reusable UI component.",
                ko: "그 자체가 재사용 UI component는 아니지만 웹 렌더링에 필요한 로직은 webkit에 둡니다.",
              }),
              l.trans({
                en: "Use srvkit for server-only code, and webkit for browser or web-rendering code.",
                ko: "서버 전용 코드는 srvkit에 두고, 브라우저 또는 웹 렌더링 코드는 webkit에 둡니다.",
              }),
              l.trans({
                en: "Import from the webkit barrel instead of deep paths so optimized import can work.",
                ko: "optimized import가 동작할 수 있도록 깊은 경로 대신 webkit barrel에서 import합니다.",
              }),
              l.trans({
                en: "Keep file names and export names aligned, such as downloadFile.ts exporting downloadFile.",
                ko: "downloadFile.ts가 downloadFile을 export하는 것처럼 파일명과 export명을 맞춥니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
