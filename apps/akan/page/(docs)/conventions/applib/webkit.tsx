import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const terms: IntroItem[] = [
    {
      name: "barrel",
      desc: l.trans({
        en: "A folder's `index.ts` that re-exports every file in it, so callers import the folder path.",
        ko: "폴더 안의 모든 파일을 다시 export하는 `index.ts`입니다. 쓰는 쪽은 폴더 경로 하나로 import합니다.",
      }),
    },
    {
      name: '"use client"',
      desc: l.trans({
        en: "Marks a file as client code. A server component cannot call its functions or read its values.",
        ko: "파일을 클라이언트 코드로 표시하는 첫 줄입니다. 서버 컴포넌트는 이 파일의 함수를 호출하거나 값을 읽을 수 없습니다.",
      }),
    },
    {
      name: l.trans({ en: "server component", ko: "서버 컴포넌트" }),
      desc: l.trans({
        en: "A page, `Unit` or `View`. It renders on the server and reaches the browser as HTML only.",
        ko: "page, `Unit`, `View`입니다. 서버에서 그려져 브라우저에는 HTML로만 도착합니다.",
      }),
    },
  ];

  const layerPlacement: IntroItem[] = [
    {
      name: "common/",
      desc: l.trans({
        en: "Pure, isomorphic, zero-dependency; imports only sibling `common/*` and `akanjs/base`, not `Err`.",
        ko: "서버와 클라이언트 양쪽에서 도는 순수 코드이며 외부 의존성이 없습니다. 같은 폴더의 `common/*`과 `akanjs/base`만 import하고, `Err`는 쓸 수 없습니다.",
      }),
      example: l.trans({
        en: "libs/util/common/isHttpUri.ts\n// camelCase file, filename equals the single export",
        ko: "libs/util/common/isHttpUri.ts\n// 파일명은 camelCase, export 하나와 같은 이름",
      }),
    },
    {
      name: "webkit/",
      desc: l.trans({
        en: "Touches `window`, `navigator` or Capacitor, or is a React hook.",
        ko: "`window`, `navigator`, Capacitor를 건드리거나 React hook인 코드입니다.",
      }),
      example: l.trans({
        en: "libs/util/webkit/useGeoLocation.tsx\n// use<Thing>.tsx — .tsx even with no JSX",
        ko: "libs/util/webkit/useGeoLocation.tsx\n// use<Thing>.tsx — JSX가 없어도 .tsx",
      }),
    },
    {
      name: "srvkit/",
      desc: l.trans({
        en: "Touches `node:*`, `Bun`, `process.env`, a secret, or a server SDK.",
        ko: "`node:*`, `Bun`, `process.env`, 비밀값, 서버 SDK 중 하나라도 건드리는 코드입니다.",
      }),
      example: l.trans({
        en: "libs/util/srvkit/cloudflareApi.ts\n// camelCase file, PascalCase class",
        ko: "libs/util/srvkit/cloudflareApi.ts\n// 파일명은 camelCase, 클래스는 PascalCase",
      }),
    },
    {
      name: "ui/",
      desc: l.trans({
        en: "Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.",
        ko: "JSX를 그리거나 레시피로 모양을 정의하되 모델 하나에 묶이지 않는 코드입니다. 모델에 묶인 컴포넌트는 그 모듈에 둡니다.",
      }),
      example: l.trans({
        en: "apps/akan/ui/BrowserMockup.tsx\n// PascalCase component, camelCase sidecar",
        ko: "apps/akan/ui/BrowserMockup.tsx\n// 컴포넌트는 PascalCase, 보조 파일은 camelCase",
      }),
    },
    {
      name: "plugin/",
      desc: l.trans({
        en: "A build-time or CLI-time `AkanPlugin`, registered in `akan.config.ts`.",
        ko: "빌드나 CLI 실행 때 도는 `AkanPlugin`입니다. `akan.config.ts`에 등록합니다.",
      }),
      example: "libs/util/plugin/pushNotification.plugin.ts\n// <name>.plugin.ts",
    },
  ];

  const sideColumns = [
    { key: "server", label: l.trans({ en: "Server", ko: "서버" }), caption: "page · Unit · View" },
    { key: "client", label: l.trans({ en: "Client", ko: "클라이언트" }), caption: '"use client"' },
  ];
  const onBoth = { server: true, client: true };
  const onClient = { server: false, client: true };

  const kindGroups = [
    {
      label: l.trans({
        en: 'No "use client" — server and client',
        ko: '"use client" 없음 — 서버와 클라이언트 모두',
      }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "Render map", ko: "표시용 맵" })}</span>,
          desc: l.trans({
            en: "A shared table from an enum value to a recipe variant name or icon, never to class strings.",
            ko: "상태별 배지 variant 이름이나 아이콘처럼, enum 값을 고르는 공용 표입니다. 클래스 문자열은 담지 않습니다.",
          }),
          marks: onBoth,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Account helper", ko: "계정·라우팅 헬퍼" })}</span>,
          desc: l.trans({
            en: "Reads the signed-in account and sends a guest away, like `getSelf` in `_layout.tsx`.",
            ko: "로그인한 계정을 읽고 비로그인 사용자를 돌려보냅니다. `_layout.tsx`의 `getSelf`가 그 예입니다.",
          }),
          marks: onBoth,
        },
      ],
    },
    {
      label: l.trans({
        en: '"use client" — client components only',
        ko: '"use client" 있음 — 클라이언트 컴포넌트에서만',
      }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "Browser helper", ko: "브라우저 헬퍼" })}</span>,
          desc: l.trans({
            en: "A small browser action: copy text, download a file, read a cookie, open a share link.",
            ko: "텍스트 복사, 파일 다운로드, 쿠키 읽기, 공유 링크 열기 같은 작은 브라우저 동작입니다.",
          }),
          marks: onClient,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Web hook", ko: "웹 hook" })}</span>,
          desc: l.trans({
            en: "A reusable hook over a browser API: viewport, permissions, notifications, messaging.",
            ko: "뷰포트, 권한, 알림, 메시징 같은 브라우저 API를 감싼 재사용 hook입니다.",
          }),
          marks: onClient,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Vendor wrapper", ko: "외부 라이브러리 래퍼" })}</span>,
          desc: l.trans({
            en: "Hides a browser package behind your own function, so pages never import it.",
            ko: "브라우저용 외부 패키지를 직접 만든 함수 뒤에 숨겨, 페이지가 그 패키지를 import하지 않게 합니다.",
          }),
          marks: onClient,
        },
      ],
    },
  ];

  const fileNames: IntroItem[] = [
    {
      name: "use<Thing>.tsx",
      desc: l.trans({
        en: "A React hook. The file is `.tsx` even when it holds no JSX.",
        ko: "React hook입니다. JSX가 없어도 확장자는 `.tsx`입니다.",
      }),
      example: "libs/util/webkit/useGeoLocation.tsx",
    },
    {
      name: "<camelName>.ts",
      desc: l.trans({
        en: "Every other helper, wrapper or map. One export per file, named like the file.",
        ko: "나머지 헬퍼, 래퍼, 맵입니다. 파일 하나에 export 하나를 두고, 이름은 파일명과 같게 합니다.",
      }),
      example: l.trans({
        en: "libs/shared/webkit/downloadFile.ts  // exports downloadFile",
        ko: "libs/shared/webkit/downloadFile.ts  // downloadFile을 export",
      }),
    },
  ];

  const importColumns = [
    { key: "value", label: l.trans({ en: "Value", ko: "값" }), caption: "import { x }" },
    { key: "type", label: l.trans({ en: "Type", ko: "타입" }), caption: "import type { X }" },
  ];
  const valueAndType = { value: true, type: true };
  const typeOnly = { value: false, type: true };

  const importGroups = [
    {
      label: l.trans({ en: "Files that render", ko: "화면 쪽 파일" }),
      rows: [
        {
          name: "page/ · ui/",
          desc: l.trans({
            en: 'Allowed; a server component still calls only exports without "use client".',
            ko: 'import할 수 있습니다. 단, 서버 컴포넌트는 "use client"가 없는 export만 호출합니다.',
          }),
          marks: valueAndType,
        },
        {
          name: "<Model>.*.tsx · *.store.ts",
          desc: l.trans({
            en: "Module components and stores import from the barrel, like `@libs/util/webkit`.",
            ko: "모듈 컴포넌트와 store는 `@libs/util/webkit` 같은 barrel에서 import합니다.",
          }),
          marks: valueAndType,
        },
      ],
    },
    {
      label: l.trans({ en: "Server and shared files", ko: "서버 파일과 공유 파일" }),
      rows: [
        {
          name: "*.service.ts · *.document.ts",
          desc: l.trans({
            en: "Server code runs in Bun with no DOM, so it may only name a webkit type.",
            ko: "서버 코드는 DOM이 없는 Bun에서 돌기 때문에 webkit의 타입만 가져올 수 있습니다.",
          }),
          marks: typeOnly,
        },
        {
          name: "*.signal.ts · *.dictionary.ts",
          desc: l.trans({
            en: "Contract files load on the server too, so the same rule holds.",
            ko: "계약 파일도 서버에서 로드되므로 같은 규칙을 따릅니다.",
          }),
          marks: typeOnly,
        },
        {
          name: "srvkit/",
          desc: l.trans({
            en: "Server-only helpers and adaptors never reach into browser code.",
            ko: "서버 전용 헬퍼와 어댑터는 브라우저 코드를 불러오지 않습니다.",
          }),
          marks: typeOnly,
        },
        {
          name: "common/ · *.constant.ts",
          desc: l.trans({
            en: "Shared files run on both sides, so they reach neither `webkit/` nor `srvkit/`.",
            ko: "공유 파일은 양쪽에서 돌기 때문에 `webkit/`에도 `srvkit/`에도 닿지 않습니다.",
          }),
          marks: typeOnly,
        },
      ],
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="webkit-overview" title={l.trans({ en: "Webkit Overview", ko: "webkit 개요" })}>
        <Docs.Title>{l.trans({ en: "Webkit Overview", ko: "webkit 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>webkit/</code> holds browser code that several screens reuse but that is not a component. It is
                  the browser-side twin of <code>srvkit/</code>, which holds server-only code.
                </span>
              ),
              ko: (
                <span>
                  <code>webkit/</code>에는 여러 화면이 함께 쓰지만 컴포넌트는 아닌 브라우저 코드를 둡니다. 서버 전용
                  코드를 두는 <code>srvkit/</code>의 브라우저 쪽 짝입니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Pages and components then import one name from the webkit barrel instead of carrying the logic themselves.",
              ko: "덕분에 페이지와 컴포넌트는 로직을 직접 들고 있지 않고, webkit barrel에서 이름 하나만 가져다 씁니다.",
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={terms} />

          <Docs.SubSubTitle>{l.trans({ en: "Which folder?", ko: "어느 폴더에 둘까" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Pick the folder by what the code touches, not by what it is for. The <code>common/</code>,{" "}
                  <code>webkit/</code> and <code>srvkit/</code> pages all open with this table.
                </span>
              ),
              ko: (
                <span>
                  폴더는 코드의 용도가 아니라 코드가 건드리는 것으로 고릅니다. <code>common/</code>,{" "}
                  <code>webkit/</code>, <code>srvkit/</code> 문서가 모두 이 표로 시작합니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Folder", ko: "폴더" })} items={layerPlacement} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="what-belongs" title={l.trans({ en: "What Belongs In Webkit", ko: "webkit에 두는 것" })}>
        <Docs.Title>{l.trans({ en: "What Belongs In Webkit", ko: "webkit에 두는 것" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Five kinds of code live here. Whether the file starts with <code>{'"use client"'}</code> decides who
                  can use it:
                </span>
              ),
              ko: (
                <span>
                  여기에는 다섯 종류의 코드를 둡니다. 파일 첫 줄에 <code>{'"use client"'}</code>가 있는지에 따라 쓸 수
                  있는 쪽이 정해집니다:
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Kind", ko: "종류" })}
            columns={sideColumns}
            groups={kindGroups}
            markLabel={l.trans({ en: "Can use it", ko: "사용 가능" })}
            emptyLabel={l.trans({ en: "Cannot use it", ko: "사용 불가" })}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Leave <code>{'"use client"'}</code> off anything a server component reads.
                  </strong>{" "}
                  On the server, each export of a <code>{'"use client"'}</code> file becomes a placeholder: calling it
                  throws, and a map key reads as <code>undefined</code>. That is why render maps and account helpers
                  carry no directive.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    서버 컴포넌트가 읽는 파일에는 <code>{'"use client"'}</code>를 붙이지 않습니다.
                  </strong>{" "}
                  서버에서는 <code>{'"use client"'}</code> 파일의 export가 자리표시자로 바뀌어, 호출하면 에러가 나고
                  맵의 키는 <code>undefined</code>로 읽힙니다. 그래서 표시용 맵과 계정 헬퍼에는{" "}
                  <code>{'"use client"'}</code>가 없습니다.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "Render map", ko: "표시용 맵" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "One status-to-badge table that several modules share:",
              ko: "여러 모듈이 함께 쓰는 상태별 배지 표입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/webkit/icecreamOrderStatusVariant.ts"
            code={`import type { cnst } from "@apps/koyo/client";
import type { BadgeVariants } from "akanjs/ui";

export const icecreamOrderStatusVariant = {
  active: "info",
  processing: "warning",
  served: "success",
  finished: "neutral",
  canceled: "error",
} as const satisfies {
  [key in cnst.IcecreamOrderStatus["value"]]: BadgeVariants["variant"];
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Move it here on the second use.</strong> A lookup one module uses stays an{" "}
                    <code>as const</code> map at the top of that file. It moves to <code>webkit/</code> when a second
                    module needs it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>두 번째 모듈이 쓸 때 옮깁니다.</strong> 한 모듈만 쓰는 표는 그 파일 최상단의{" "}
                    <code>as const</code> 맵으로 둡니다. 다른 모듈도 필요해지면 <code>webkit/</code>으로 옮깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Class strings go in a recipe instead.</strong> A table whose values are classes is a variant
                    axis, so it moves to a recipe in <code>ui/Recipe/</code>, not here.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>클래스 문자열은 레시피에 둡니다.</strong> 값이 클래스인 표는 variant 축이므로 여기가 아니라{" "}
                    <code>ui/Recipe/</code>의 레시피로 옮깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The label comes from the dictionary.</strong> The map holds only the look; the text is{" "}
                    <code>l("icecreamOrderStatus.active")</code>, so nothing user-facing is hard-coded.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>글자는 dictionary에서 가져옵니다.</strong> 맵에는 모양만 두고, 글자는{" "}
                    <code>l("icecreamOrderStatus.active")</code>로 그립니다. 사용자가 읽는 문구는 하드코딩하지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>satisfies</code> checks every status.
                    </strong>{" "}
                    A status added to the enum without a variant here is a type error.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>satisfies</code>가 모든 상태를 확인합니다.
                    </strong>{" "}
                    enum에 상태를 추가하고 여기에 variant를 빠뜨리면 타입 에러가 납니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Account and routing helper", ko: "계정·라우팅 헬퍼" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A helper that reads the signed-in account and sends a guest to the sign-in page:",
              ko: "로그인한 계정을 읽고, 로그인하지 않은 사용자는 로그인 페이지로 보내는 헬퍼입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/webkit/getSignedInUser.ts"
            code={`import type { Self } from "@libs/shared/common";
import { getAccount, router } from "akanjs/client";

export const getSignedInUser = () => {
  const self = getAccount<{ self?: Self }>().self;
  if (!self) router.redirect("/signin");
  return self;
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      No <code>{'"use client"'}</code>.
                    </strong>{" "}
                    <code>_layout.tsx</code> calls it on the server, so a guest is redirected before any HTML is sent.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{'"use client"'}</code>가 없습니다.
                    </strong>{" "}
                    <code>_layout.tsx</code>가 서버에서 호출하므로, 로그인하지 않은 사용자는 HTML이 나가기 전에 로그인
                    페이지로 이동합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>router.redirect</code>, not <code>router.replace</code>.
                    </strong>{" "}
                    <code>redirect</code> works on both sides, while <code>replace</code> only moves a browser tab: on
                    the server the page would render signed-out.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>router.replace</code>가 아니라 <code>router.redirect</code>를 씁니다.
                    </strong>{" "}
                    <code>redirect</code>는 서버와 브라우저 양쪽에서 동작하지만, <code>replace</code>는 브라우저 탭만
                    옮깁니다. 서버에서 부르면 로그아웃 상태 그대로 페이지가 그려집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>libs/shared</code> already ships one.
                    </strong>{" "}
                    Use <code>{'getSelf({ unauthorize: "/signin" })'}</code> and <code>getMe</code> from{" "}
                    <code>@libs/shared/webkit</code> when the app mounts that lib.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>libs/shared</code>에 이미 있습니다.
                    </strong>{" "}
                    앱이 그 lib을 쓴다면 <code>@libs/shared/webkit</code>의{" "}
                    <code>{'getSelf({ unauthorize: "/signin" })'}</code>와 <code>getMe</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Browser helper", ko: "브라우저 헬퍼" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "One browser action that pages would otherwise repeat:",
              ko: "페이지마다 반복될 브라우저 동작 하나를 함수로 둡니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/webkit/copyText.ts"
            code={`"use client";

export const copyText = (value: string) => {
  return navigator.clipboard.writeText(value);
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>{'"use client"'}</code> because it touches <code>navigator</code>.
                    </strong>{" "}
                    Only a client component, such as an <code>onClick</code> handler, can call it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>navigator</code>를 건드리므로 <code>{'"use client"'}</code>가 붙습니다.
                    </strong>{" "}
                    <code>onClick</code> 핸들러처럼 클라이언트 컴포넌트에서만 부를 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Check <code>@libs/shared/webkit</code> first.
                    </strong>{" "}
                    It already ships <code>downloadFile</code>, <code>downloadData</code> for a JSON export and{" "}
                    <code>addFileUntilActive</code>, which uploads a file and waits until it is ready.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      먼저 <code>@libs/shared/webkit</code>을 확인하세요.
                    </strong>{" "}
                    <code>downloadFile</code>, JSON 내보내기용 <code>downloadData</code>, 파일을 올리고 준비될 때까지
                    기다리는 <code>addFileUntilActive</code>가 이미 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Web hook", ko: "웹 hook" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A hook that subscribes to a browser event and cleans up after itself:",
              ko: "브라우저 이벤트를 구독하고, 끝나면 스스로 정리하는 hook입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/webkit/useViewportWidth.tsx"
            code={`"use client";

import { useEffect, useState } from "react";

export const useViewportWidth = () => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const sync = () => setWidth(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return { width };
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Return a named object, never a tuple.</strong> Callers write{" "}
                    <code>{"const { width } = useViewportWidth()"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>튜플이 아니라 이름 있는 객체를 반환합니다.</strong> 호출하는 쪽은{" "}
                    <code>{"const { width } = useViewportWidth()"}</code>로 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Check the hooks that already exist.</strong> <code>akanjs/webkit</code> ships{" "}
                    <code>useDebounce</code>, <code>useThrottle</code>, <code>useInterval</code> and{" "}
                    <code>useEscapeKey</code>. <code>@libs/util/webkit</code> wraps Capacitor and browser APIs in{" "}
                    <code>useCamera</code>, <code>useContact</code>, <code>useGeoLocation</code>,{" "}
                    <code>usePushNotification</code>, <code>useSpeech</code> and <code>useCodepush</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이미 있는 hook부터 확인하세요.</strong> <code>akanjs/webkit</code>에는{" "}
                    <code>useDebounce</code>, <code>useThrottle</code>, <code>useInterval</code>,{" "}
                    <code>useEscapeKey</code>가 있습니다. <code>@libs/util/webkit</code>은 <code>useCamera</code>,{" "}
                    <code>useContact</code>, <code>useGeoLocation</code>, <code>usePushNotification</code>,{" "}
                    <code>useSpeech</code>, <code>useCodepush</code>로 Capacitor와 브라우저 API를 감싸 둡니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only for real state.</strong> If the width only shows or hides markup, a responsive class
                    such as <code>md:hidden</code> keeps both branches on the server.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>진짜 상태가 필요할 때만 씁니다.</strong> 너비로 마크업을 보이고 숨기기만 한다면{" "}
                    <code>md:hidden</code> 같은 반응형 class로 충분하고, 두 경우 모두 서버에서 그려집니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Vendor wrapper", ko: "외부 라이브러리 래퍼" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The <code>downloadFile</code> helper in <code>libs/shared</code> wraps <code>file-saver</code>:
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>의 <code>downloadFile</code>은 <code>file-saver</code>를 감쌉니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/webkit/downloadFile.ts"
            code={`"use client";
import { saveAs } from "file-saver";

export const downloadFile = async (url: string, filename: string) => {
  const res = await window.fetch(url, { method: "GET" });
  saveAs(await res.blob(), filename);
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Pages and module files never import a vendor package.</strong> A third-party import in{" "}
                    <code>page/**</code>, a <code>*.Zone.tsx</code> or a <code>*.store.ts</code> fails lint, so they
                    import <code>downloadFile</code> instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>페이지와 모듈 파일은 외부 패키지를 import하지 않습니다.</strong> <code>page/**</code>,{" "}
                    <code>*.Zone.tsx</code>, <code>*.store.ts</code>에서 외부 패키지를 import하면 lint 에러가 나므로,
                    대신 <code>downloadFile</code>을 import합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A vendor component goes in <code>ui/</code>.
                    </strong>{" "}
                    <code>webkit/</code> exports camelCase functions, hooks and maps. A wrapped component is a
                    PascalCase file in <code>ui/</code>, like <code>libs/util/ui/QRCode.tsx</code> around{" "}
                    <code>qrcode.react</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      외부 컴포넌트를 감쌀 때는 <code>ui/</code>에 둡니다.
                    </strong>{" "}
                    <code>webkit/</code>은 함수, hook, 맵처럼 camelCase 이름만 export합니다. <code>qrcode.react</code>를
                    감싼 <code>libs/util/ui/QRCode.tsx</code>처럼, 컴포넌트 래퍼는 <code>ui/</code>의 PascalCase 파일로
                    둡니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="barrel-optimization" title={l.trans({ en: "Barrel And File Names", ko: "barrel과 파일 이름" })}>
        <Docs.Title>{l.trans({ en: "Barrel And File Names", ko: "barrel과 파일 이름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>webkit/</code> is a barrel folder like <code>ui/</code>: every file is re-exported from one
                  entry. Name each file after the one thing it exports:
                </span>
              ),
              ko: (
                <span>
                  <code>webkit/</code>은 <code>ui/</code>처럼 barrel 폴더라서, 모든 파일이 진입점 하나에서 다시
                  export됩니다. 파일 이름은 그 파일이 export하는 이름 하나를 따릅니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "File name", ko: "파일 이름" })} items={fileNames} />
          <div>
            {l.trans({
              en: "A component then imports the helper by its barrel path:",
              ko: "컴포넌트는 헬퍼를 barrel 경로로 가져옵니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/ui/DownloadButton.tsx"
            code={`"use client";

import { usePage } from "@apps/koyo/client";
import { downloadFile } from "@libs/shared/webkit";
import { Button } from "akanjs/ui";

export const DownloadButton = () => {
  const { l } = usePage();
  return (
    <Button onClick={() => downloadFile("/invoice.pdf", "invoice.pdf")}>
      {l.trans({ en: "Download", ko: "다운로드" })}
    </Button>
  );
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Barrel path only.</strong> Write <code>@libs/shared/webkit</code> or{" "}
                    <code>@apps/koyo/webkit</code>. A deeper path such as <code>@libs/shared/webkit/downloadFile</code>{" "}
                    fails lint in pages and module files.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>barrel 경로만 씁니다.</strong> <code>@libs/shared/webkit</code>이나{" "}
                    <code>@apps/koyo/webkit</code>으로 씁니다. <code>@libs/shared/webkit/downloadFile</code>처럼 더 깊은
                    경로는 페이지와 모듈 파일에서 lint 에러가 납니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The button owns the click.</strong> It needs <code>{'"use client"'}</code> for the{" "}
                    <code>onClick</code>, and <code>Button</code> shows a spinner while the returned promise is pending.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>클릭은 버튼이 맡습니다.</strong> <code>onClick</code> 때문에 <code>{'"use client"'}</code>가
                    필요하고, <code>Button</code>은 반환된 promise가 끝날 때까지 스피너를 보여 줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      The page never sees <code>file-saver</code>.
                    </strong>{" "}
                    It renders <code>{"<DownloadButton />"}</code>; the vendor stays behind <code>webkit/</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      페이지는 <code>file-saver</code>를 모릅니다.
                    </strong>{" "}
                    페이지는 <code>{"<DownloadButton />"}</code>만 그리고, 외부 패키지는 <code>webkit/</code> 뒤에
                    남습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Six rules cover almost every webkit file:",
              ko: "webkit 파일은 거의 다 이 여섯 가지 규칙으로 정리됩니다:",
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Logic in <code>webkit/</code>, components in <code>ui/</code>.
                    </strong>{" "}
                    Web-rendering logic that is not itself a reusable UI component goes here.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      로직은 <code>webkit/</code>, 컴포넌트는 <code>ui/</code>.
                    </strong>{" "}
                    웹 렌더링에 필요하지만 그 자체가 재사용 UI 컴포넌트는 아닌 로직을 여기에 둡니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Browser code in <code>webkit/</code>, server-only code in <code>srvkit/</code>.
                    </strong>{" "}
                    Anything that touches <code>node:*</code>, <code>Bun</code>, <code>process.env</code> or a secret
                    belongs in <code>srvkit/</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      브라우저 코드는 <code>webkit/</code>, 서버 전용 코드는 <code>srvkit/</code>.
                    </strong>{" "}
                    <code>node:*</code>, <code>Bun</code>, <code>process.env</code>, 비밀값을 건드리면{" "}
                    <code>srvkit/</code>에 둡니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Import from the barrel.</strong> <code>@libs/shared/webkit</code>, never a path inside it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>barrel에서 import합니다.</strong> 안쪽 경로가 아니라 <code>@libs/shared/webkit</code>에서
                    가져옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>File name equals export name.</strong> <code>downloadFile.ts</code> exports{" "}
                    <code>downloadFile</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>파일 이름과 export 이름을 맞춥니다.</strong> <code>downloadFile.ts</code>는{" "}
                    <code>downloadFile</code>을 export합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>{'"use client"'}</code> only where the browser is needed.
                    </strong>{" "}
                    Hooks, browser APIs and browser packages need it; anything a server component reads must not have
                    it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{'"use client"'}</code>는 브라우저가 필요한 곳에만 붙입니다.
                    </strong>{" "}
                    hook, 브라우저 API, 브라우저용 패키지에는 필요하고, 서버 컴포넌트가 읽는 파일에는 붙이면 안 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      No <code>{"//!"}</code> comments.
                    </strong>{" "}
                    Bun keeps them through minification, so they ship to every visitor. Write <code>{"// FIXME:"}</code>{" "}
                    instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{"//!"}</code> 주석을 쓰지 않습니다.
                    </strong>{" "}
                    Bun이 압축 뒤에도 남겨 두기 때문에 모든 방문자에게 그대로 전송됩니다. 대신{" "}
                    <code>{"// FIXME:"}</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Who can import webkit/", ko: "webkit/을 import할 수 있는 곳" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Server and shared files may name a webkit type with <code>import type</code>, but never import a
                  value:
                </span>
              ),
              ko: (
                <span>
                  서버 파일과 공유 파일은 <code>import type</code>으로 webkit의 타입만 가져올 수 있고, 값은 import할 수
                  없습니다:
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Importing file", ko: "import하는 파일" })}
            columns={importColumns}
            groups={importGroups}
            markLabel={l.trans({ en: "Allowed", ko: "허용" })}
            emptyLabel={l.trans({ en: "Fails lint", ko: "lint 에러" })}
          />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>webkit/</code> cannot import server code either.
                  </strong>{" "}
                  A value import of <code>srvkit/</code>, a <code>*.service.ts</code>, <code>*.document.ts</code>,{" "}
                  <code>*.signal.ts</code> or <code>*.dictionary.ts</code>, a server entrypoint, or the <code>db</code>{" "}
                  / <code>srv</code> / <code>sig</code> / <code>dict</code> / <code>option</code> /{" "}
                  <code>useServer</code> barrels fails lint. Read models from <code>cnst</code> through the client
                  entrypoint, and use <code>import type</code> when only a type is needed.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>webkit/</code>도 서버 코드를 import할 수 없습니다.
                  </strong>{" "}
                  <code>srvkit/</code>, <code>*.service.ts</code>, <code>*.document.ts</code>, <code>*.signal.ts</code>,{" "}
                  <code>*.dictionary.ts</code>, 서버 진입점, <code>db</code> / <code>srv</code> / <code>sig</code> /{" "}
                  <code>dict</code> / <code>option</code> / <code>useServer</code> barrel을 값으로 import하면 lint
                  에러가 납니다. 모델은 클라이언트 진입점의 <code>cnst</code>에서 읽고, 타입만 필요하면{" "}
                  <code>import type</code>을 씁니다.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 문서" })}</Docs.SubSubTitle>
          <Docs.LinkGrid
            items={[
              {
                href: "/conventions/applib/srvkit",
                title: "srvkit/",
                desc: l.trans({ en: "Where server-only code goes.", ko: "서버 전용 코드를 두는 곳입니다." }),
              },
              {
                href: "/conventions/applib/common",
                title: "common/",
                desc: l.trans({
                  en: "Pure helpers that run on both sides.",
                  ko: "양쪽에서 도는 순수 헬퍼를 두는 곳입니다.",
                }),
              },
              {
                href: "/conventions/applib/ui",
                title: "ui/",
                desc: l.trans({
                  en: "Components that are not bound to one model.",
                  ko: "모델 하나에 묶이지 않는 컴포넌트를 두는 곳입니다.",
                }),
              },
              {
                href: "/references/akanjs/webkit",
                title: "akanjs/webkit",
                desc: l.trans({
                  en: "The hooks and helpers the framework itself ships.",
                  ko: "프레임워크가 직접 제공하는 hook과 헬퍼입니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
