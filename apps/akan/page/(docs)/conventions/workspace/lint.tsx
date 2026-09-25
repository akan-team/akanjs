import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="format-lint" title={l.trans({ en: "Format And Lint", ko: "포맷과 린트" })}>
        <Docs.Title>{l.trans({ en: "Format And Lint", ko: "포맷과 린트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan lint is mostly here to keep the workspace easy to read and hard to break. In day-to-day work, you only need to remember a few habits: let the formatter handle style, keep client-only code out of server files, avoid random external imports in convention files, and run lint before sharing work.",
              ko: "Akan lint는 워크스페이스를 읽기 쉽고 깨지기 어렵게 유지하기 위한 장치입니다. 평소 작업에서는 몇 가지만 기억하면 됩니다. 스타일은 formatter에 맡기고, client 전용 코드는 server 파일에 넣지 말고, convention 파일에서 임의의 외부 import를 피하고, 작업을 공유하기 전에 lint를 실행하세요.",
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: l.trans({ en: "Let format decide", ko: "포맷은 도구에 맡기기" }),
                desc: l.trans({
                  en: "Use 2-space indentation, double quotes, organized imports, and the formatter's class ordering.",
                  ko: "2칸 indentation, double quote, import 정리, class 정렬은 formatter 기준을 따릅니다.",
                }),
              },
              {
                title: l.trans({ en: "Keep server files server-safe", ko: "서버 파일은 서버답게" }),
                desc: l.trans({
                  en: "Do not add useState, useEffect, st, or top-level use client to files that should render on the server.",
                  ko: "서버에서 렌더링되어야 하는 파일에는 useState, useEffect, st, top-level use client를 넣지 않습니다.",
                }),
              },
              {
                title: l.trans({ en: "Keep imports intentional", ko: "Import는 의도적으로" }),
                desc: l.trans({
                  en: "Convention files should import from relative paths, Akan packages, or workspace aliases before reaching for external packages.",
                  ko: "컨벤션 파일은 외부 패키지를 바로 가져오기보다 relative path, Akan package, workspace alias를 우선 사용합니다.",
                }),
              },
              {
                title: l.trans({ en: "Run it before sharing", ko: "공유 전 실행" }),
                desc: l.trans({
                  en: "Use lint on the app or library you touched, and use lintAll before broad checks.",
                  ko: "수정한 앱이나 라이브러리에 lint를 실행하고, 넓은 범위 확인 전에는 lintAll을 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
                <div className="font-bold text-base-content">{title}</div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="fix-errors"
        title={l.trans({ en: "Akan Lint Errors And Fixes", ko: "Akan lint 에러와 고치는 법" })}
      >
        <Docs.Title>{l.trans({ en: "Akan Lint Errors And Fixes", ko: "Akan lint 에러와 고치는 법" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some lint errors are not about style. They happen when server UI, client UI, service code, or shared utilities are mixed in the wrong place. Use the examples below as the default shape: keep server pages simple, move browser interaction into client components, and wrap external tools behind internal modules.",
              ko: "일부 lint 에러는 스타일 문제가 아닙니다. server UI, client UI, service code, shared utility가 잘못된 위치에 섞였을 때 발생합니다. 아래 예시를 기본 형태로 생각하세요. server page는 단순하게 유지하고, 브라우저 상호작용은 client component로 옮기고, 외부 도구는 내부 모듈 뒤로 감싸서 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-6">
          {[
            {
              id: "client-hooks",
              title: l.trans({ en: "Client hooks in a server file", ko: "서버 파일에서 client hook을 쓴 경우" }),
              desc: l.trans({
                en: "This happens when a server page or server-oriented component imports useState, useEffect, useMemo, useRef, or another React client hook.",
                ko: "server page나 서버 성격의 component에서 useState, useEffect, useMemo, useRef 같은 React client hook을 import할 때 발생합니다.",
              }),
              before: [
                {
                  title: "page.tsx",
                  code: `import { useState } from "react";

export default function Page() {
  const [liked, setLiked] = useState(false);

  return <button onClick={() => setLiked(true)}>Like</button>;
}`,
                },
              ],
              after: [
                {
                  title: "page.tsx",
                  code: `import { LikeButton } from "./LikeButton";

export default function Page() {
  return <LikeButton />;
}`,
                },
                {
                  title: "LikeButton.tsx",
                  code: `"use client";

import { useState } from "react";

export function LikeButton() {
  const [liked, setLiked] = useState(false);

  return <button onClick={() => setLiked(true)}>Like</button>;
}`,
                },
              ],
            },
            {
              id: "use-client",
              title: l.trans({ en: "Adding use client to a server file", ko: "서버 파일에 use client를 추가한 경우" }),
              desc: l.trans({
                en: "Do not turn a whole page into a client component just because one small part needs browser interaction.",
                ko: "작은 일부에 브라우저 상호작용이 필요하다고 해서 page 전체를 client component로 바꾸지 마세요.",
              }),
              before: [
                {
                  title: "page.tsx",
                  code: `"use client";

import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return <DashboardView />;
}`,
                },
              ],
              after: [
                {
                  title: "page.tsx",
                  code: `import { ScrollReset } from "./ScrollReset";

export default function Page() {
  return (
    <>
      <ScrollReset />
      <DashboardView />
    </>
  );
}`,
                },
                {
                  title: "ScrollReset.tsx",
                  code: `"use client";

import { useEffect } from "react";

export function ScrollReset() {
  useEffect(() => window.scrollTo(0, 0), []);
  return null;
}`,
                },
              ],
            },
            {
              id: "function-props",
              title: l.trans({ en: "Passing function props from server UI", ko: "서버 UI에서 함수 prop을 넘긴 경우" }),
              desc: l.trans({
                en: "Server components should pass data, not event behavior. Move callbacks such as onClick into a client component.",
                ko: "server component는 이벤트 동작이 아니라 데이터를 넘겨야 합니다. onClick 같은 callback은 client component 안으로 옮기세요.",
              }),
              before: [
                {
                  title: "page.tsx",
                  code: `export default function Page() {
  return <OrderCard onCancel={() => cancelOrder()} />;
}`,
                },
              ],
              after: [
                {
                  title: "page.tsx",
                  code: `import { OrderCardAction } from "./OrderCardAction";

export default function Page() {
  return <OrderCardAction orderId="order_123" />;
}`,
                },
                {
                  title: "OrderCardAction.tsx",
                  code: `"use client";

export function OrderCardAction({ orderId }: { orderId: string }) {
  return <button onClick={() => cancelOrder(orderId)}>Cancel</button>;
}`,
                },
              ],
            },
            {
              id: "external-imports",
              title: l.trans({ en: "Importing external packages directly", ko: "외부 패키지를 직접 import한 경우" }),
              desc: l.trans({
                en: "Convention files should not depend on random external packages directly. Put the dependency behind an internal util or library file first.",
                ko: "convention 파일은 임의의 외부 패키지에 직접 의존하지 않는 것이 좋습니다. 먼저 내부 util이나 library 파일로 감싸서 사용하세요.",
              }),
              before: [
                {
                  title: "order.service.ts",
                  code: `import { serve } from "akanjs/service";
import { customAlphabet } from "nanoid";

import * as db from "../db";

export class OrderService extends serve(db.order, () => ({
  createOrderCode() {
    const createId = customAlphabet("1234567890", 8);
    return createId();
  },
})) {}`,
                },
              ],
              after: [
                {
                  title: "order.service.ts",
                  code: `import { serve } from "akanjs/service";
import { createNumberId } from "@libs/util/id";

import * as db from "../db";

export class OrderService extends serve(db.order, () => ({
  createOrderCode() {
    return createNumberId(8);
  },
})) {}`,
                },
                {
                  title: "@libs/util/id.ts",
                  code: `import { customAlphabet } from "nanoid";

export function createNumberId(size: number) {
  return customAlphabet("1234567890", size)();
}`,
                },
              ],
            },
            {
              id: "private-methods",
              title: l.trans({ en: "Using JavaScript private methods", ko: "JavaScript private method를 쓴 경우" }),
              desc: l.trans({
                en: "In service classes, use TypeScript private methods with an underscore name instead of JavaScript #private methods. Other classes can use #private methods.",
                ko: "service class에서는 JavaScript #private method 대신 underscore 이름을 가진 TypeScript private method를 사용하세요. Service를 제외한 다른 class에서는 #private method를 사용할 수 있습니다.",
              }),
              before: [
                {
                  title: "order.service.ts",
                  code: `import { serve } from "akanjs/service";

import * as db from "../db";

export class OrderService extends serve(db.order, () => ({
  async #syncOrderStock() {
    return fetchOrderStock();
  },
  async refreshOrderStock() {
    return this.#syncOrderStock();
  },
})) {}`,
                },
              ],
              after: [
                {
                  title: "order.service.ts",
                  code: `import { serve } from "akanjs/service";

import * as db from "../db";

export class OrderService extends serve(db.order, () => ({
  private async _syncOrderStock() {
    return fetchOrderStock();
  },
  async refreshOrderStock() {
    return this._syncOrderStock();
  },
})) {}`,
                },
              ],
            },
          ].map(({ id, title, desc, before, after }) => (
            <div key={id} className="rounded-2xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <div className="rounded-xl border border-error/30 bg-error/5 p-3">
                  <div className="mb-3 font-bold text-error">❌ Before</div>
                  <div className="space-y-3">
                    {before.map(({ title: snippetTitle, code }) => (
                      <Code.Snippet key={snippetTitle} title={snippetTitle} code={code} />
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                  <div className="mb-3 font-bold text-success">✅ After</div>
                  <div className="space-y-3">
                    {after.map(({ title: snippetTitle, code }) => (
                      <Code.Snippet key={snippetTitle} title={snippetTitle} code={code} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <Docs.Alert>
            {[
              l.trans({
                en: "Allowed exceptions exist for some framework patterns, but when you are writing ordinary app code, prefer the After shape first.",
                ko: "일부 framework 패턴에는 예외가 있지만, 일반적인 앱 코드를 작성할 때는 먼저 After 형태를 기본값으로 생각하세요.",
              }),
              l.trans({
                en: "If console output is intentional, use console.info, console.warn, or console.error instead of console.log.",
                ko: "의도적인 console 출력은 console.log 대신 console.info, console.warn, console.error를 사용하세요.",
              }),
            ].join(" ")}
          </Docs.Alert>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="commands" title={l.trans({ en: "Commands", ko: "명령어" })}>
        <Docs.Title>{l.trans({ en: "Commands", ko: "명령어" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use workspace lint commands for normal development. Use direct Biome checks when you want to verify one file or debug a formatting issue.",
              ko: "일반 개발 중에는 workspace lint 명령을 사용하세요. 특정 파일 하나를 검증하거나 포맷 문제를 디버깅할 때는 Biome check를 직접 사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Lint commands"
          language="bash"
          code={`akan lint apps/myapp
akan lintAll
bunx biome check "apps/myapp/page/akanjs/(docs)/conventions/workspace/lint.tsx"`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
