import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "인터페이스: Endpoint | Akan.js" : "Interface: Endpoint | Akan.js";
    const description =
      lang === "ko"
        ? "CRUD 위에 업무 동작 하나를 얹습니다. service와 document 규칙에서 Util 버튼까지."
        : "One clear business action on top of CRUD, from service and document rules to a Util button.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
    const bulletList = "my-4 list-disc space-y-2 pl-5";

    const termRows = [
      {
        name: "endpoint",
        desc: l.trans({
          en: "A server function the client calls by name. You declare it in `<model>.signal.ts`.",
          ko: "클라이언트가 이름으로 부르는 서버 함수입니다. `<model>.signal.ts`에 선언합니다.",
        }),
      },
      {
        name: "guard",
        desc: l.trans({
          en: "A class that decides who may call an endpoint. It runs before the handler.",
          ko: "누가 endpoint를 부를 수 있는지 정하는 클래스입니다. 핸들러보다 먼저 실행됩니다.",
        }),
      },
      {
        name: "service",
        desc: l.trans({
          en: "The server class in `<model>.service.ts` that loads, checks and saves.",
          ko: "`<model>.service.ts`의 서버 클래스입니다. 불러오고, 확인하고, 저장합니다.",
        }),
      },
      {
        name: "document chain method",
        desc: l.trans({
          en: "A method on the document class that checks and changes one record, then returns `this`.",
          ko: "document 클래스의 메서드로, 레코드 하나를 검사하고 바꾼 뒤 `this`를 반환합니다.",
        }),
      },
      {
        name: "store action",
        desc: l.trans({
          en: "A client method called as `st.do.x()`. It calls `fetch` and updates the screen.",
          ko: "`st.do.x()`로 부르는 클라이언트 메서드입니다. `fetch`를 호출하고 화면을 갱신합니다.",
        }),
      },
      {
        name: "Util",
        desc: l.trans({
          en: "A small client component in `<Model>.Util.tsx` for one domain action.",
          ko: "도메인 동작 하나를 담은 작은 클라이언트 컴포넌트로, `<Model>.Util.tsx`에 둡니다.",
        }),
      },
    ];

    const flowRows = [
      {
        name: "Post.Util.tsx",
        desc: l.trans({
          en: (
            <span>
              <strong>Button.</strong> The user clicks it, and it only calls the store action.
            </span>
          ),
          ko: (
            <span>
              <strong>버튼.</strong> 사용자가 누르는 곳이고, store action만 호출합니다.
            </span>
          ),
        }),
        example: "st.do.publishPost(postId)",
      },
      {
        name: "post.store.ts",
        desc: l.trans({
          en: (
            <span>
              <strong>Store action.</strong> Calls the generated fetch function, stores the result, shows a toast.
            </span>
          ),
          ko: (
            <span>
              <strong>Store action.</strong> 생성된 fetch 함수를 호출하고, 결과를 상태에 저장하고, 토스트를 띄웁니다.
            </span>
          ),
        }),
        example: "fetch.publishPost(postId)",
      },
      {
        name: "post.signal.ts",
        desc: l.trans({
          en: (
            <span>
              <strong>Endpoint.</strong> Runs the guards, then hands the work to the service.
            </span>
          ),
          ko: (
            <span>
              <strong>Endpoint.</strong> guard를 실행한 뒤 실제 일을 service에 넘깁니다.
            </span>
          ),
        }),
        example: "this.postService.publish(postId, self.id)",
      },
      {
        name: "post.service.ts",
        desc: l.trans({
          en: (
            <span>
              <strong>Service.</strong> Loads the post, checks it belongs to the caller, and saves it.
            </span>
          ),
          ko: (
            <span>
              <strong>Service.</strong> 게시글을 불러오고, 호출한 사람의 것인지 확인하고, 저장합니다.
            </span>
          ),
        }),
        example: "post.publish().save()",
      },
      {
        name: "post.document.ts",
        desc: l.trans({
          en: (
            <span>
              <strong>Document.</strong> Checks that the post is ready, then changes its state.
            </span>
          ),
          ko: (
            <span>
              <strong>Document.</strong> 게시글이 발행할 준비가 됐는지 검사하고 상태를 바꿉니다.
            </span>
          ),
        }),
        example: 'this.status = "published"',
      },
    ];

    const argRows = [
      {
        name: ".param(name, Type)",
        desc: l.trans({
          en: "A required path segment: one scalar or `enumOf`, not a model or array. No optional arg before it.",
          ko: "필수 URL 경로 구간입니다. scalar나 `enumOf` 하나만 받고(model·배열 불가), 선택 인자보다 앞에 둡니다.",
        }),
        example: '.param("postId", ID)',
      },
      {
        name: ".body(name, Type, options?)",
        desc: l.trans({
          en: "A request-body value, mostly for mutations. `{ nullable: true }` makes it optional.",
          ko: "요청 본문(body) 값이며 주로 mutation에서 씁니다. `{ nullable: true }`면 선택 인자가 됩니다.",
        }),
        example: '.body("data", cnst.PostInput)',
      },
      {
        name: ".search(name, Type)",
        desc: l.trans({
          en: "A query-string value. Always optional, so `exec` may receive `undefined`.",
          ko: "URL 쿼리 문자열 값입니다. 항상 선택 인자라서 `exec`가 `undefined`를 받을 수 있습니다.",
        }),
        example: '.search("keyword", String)',
      },
      {
        name: ".with(InternalArg, options?)",
        desc: l.trans({
          en: "Server-filled, never sent by the client. Without `{ nullable: true }`, a `null` refuses the call.",
          ko: "서버가 채우는 값이라 클라이언트는 보내지 않습니다. `{ nullable: true }`가 없으면 `null`일 때 호출을 거절합니다.",
        }),
        example: ".with(Self)",
      },
    ];

    const optionRows = [
      {
        key: "guards",
        type: "GuardCls[]",
        default: l.trans({ en: "none", ko: "없음" }),
        desc: l.trans({
          en: "Guard classes that must all pass, run in order before the handler.",
          ko: "핸들러보다 먼저 순서대로 실행되며, 모두 통과해야 하는 guard 클래스입니다.",
        }),
      },
      {
        key: "timeout",
        type: "number (ms)",
        default: l.trans({ en: "30 s (client)", ko: "30초 (클라이언트)" }),
        desc: l.trans({
          en: "Declare it for work over 30 s. Past it the caller gets `base.error.gatewayTimeout`.",
          ko: "30초보다 오래 걸리는 작업에 선언합니다. 시간이 지나면 호출자는 `base.error.gatewayTimeout`을 받습니다.",
        }),
      },
      {
        key: "mcp",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "`false` keeps it away from AI agents. Guards and HTTP stay the same.",
          ko: "`false`면 AI 에이전트 목록에서만 빠집니다. guard와 HTTP 제공은 그대로입니다.",
        }),
      },
      {
        key: "nullable",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "Allows a `null` return. Without it, `exec` may not return `null`.",
          ko: "`null` 반환을 허용합니다. 이 옵션이 없으면 `exec`는 `null`을 반환할 수 없습니다.",
        }),
      },
    ];

    const placeColumns = [
      { key: "guard", label: "Guard", caption: "post.signal.ts" },
      { key: "service", label: "Service", caption: "post.service.ts" },
      { key: "document", label: "Document", caption: "post.document.ts" },
    ];

    const placeGroups = [
      {
        label: l.trans({ en: "Who is calling", ko: "누가 부르는가" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "may call at all", ko: "부를 자격이 있는가" })}</span>,
            desc: l.trans({
              en: "Request policy. `guards: [Every]` refuses anyone who is not signed in.",
              ko: "요청 정책입니다. `guards: [Every]`는 로그인하지 않은 호출을 거절합니다.",
            }),
            marks: { guard: true, service: false, document: false },
          },
          {
            name: <span className="font-sans">{l.trans({ en: "owns this post", ko: "이 게시글의 주인인가" })}</span>,
            desc: l.trans({
              en: "The service checks ownership again, even after a guard passed.",
              ko: "guard를 통과했더라도 service가 소유권을 한 번 더 확인합니다.",
            }),
            marks: { guard: false, service: true, document: false },
          },
        ],
      },
      {
        label: l.trans({ en: "What is changing", ko: "무엇이 바뀌는가" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "rule across documents", ko: "여러 document에 걸친 규칙" })}
              </span>
            ),
            desc: l.trans({
              en: "Load every document the rule reads, then save, then notify.",
              ko: "규칙이 읽는 document를 모두 불러온 뒤 저장하고, 그다음 알립니다.",
            }),
            marks: { guard: false, service: true, document: false },
          },
          {
            name: <span className="font-sans">{l.trans({ en: "state precondition", ko: "상태 전제 조건" })}</span>,
            desc: l.trans({
              en: "The post needs a title and content before it becomes `published`.",
              ko: "게시글이 `published`가 되려면 제목과 내용이 있어야 합니다.",
            }),
            marks: { guard: false, service: false, document: true },
          },
        ],
      },
    ];

    const relatedLinks = [
      {
        href: "/cheatsheet/interface/crud",
        title: l.trans({ en: "CRUD", ko: "CRUD" }),
        desc: l.trans({
          en: "The create, update and remove actions every model already has.",
          ko: "모든 모델이 이미 가진 생성, 수정, 삭제 동작입니다.",
        }),
      },
      {
        href: "/conventions/module/signal#endpoint-options",
        title: l.trans({ en: "Every endpoint option", ko: "endpoint 옵션 전체" }),
        desc: l.trans({
          en: "cache, method, path, prefix and the rest of the options object.",
          ko: "cache, method, path, prefix 등 옵션 객체의 나머지 항목입니다.",
        }),
      },
      {
        href: "/cheatsheet/interface/mcp",
        title: l.trans({ en: "MCP server", ko: "MCP 서버" }),
        desc: l.trans({
          en: "How guarded endpoints become tools an AI agent can call.",
          ko: "guard가 붙은 endpoint가 AI 에이전트의 툴이 되는 방식입니다.",
        }),
      },
      {
        href: "/cheatsheet/interface/agent-chat",
        title: l.trans({ en: "Agent chat", ko: "에이전트 채팅" }),
        desc: l.trans({
          en: "Let the in-page agent press the same button with st.tool.",
          ko: "st.tool로 페이지 안의 에이전트도 같은 버튼을 누르게 합니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Endpoint Actions", ko: "업무 동작 Endpoint" })}>
          <Docs.Title>{l.trans({ en: "Endpoint Actions", ko: "업무 동작 Endpoint" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every model already comes with create, update and remove. When a screen needs one clear business action on top — publish, approve, reject, archive, send a notification — you write an endpoint for it.",
                ko: "모든 모델에는 생성, 수정, 삭제가 이미 있습니다. 화면에 발행, 승인, 거절, 보관, 알림 발송 같은 분명한 업무 동작이 하나 더 필요하면 그때 endpoint를 씁니다.",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "CRUD — generated", ko: "CRUD — 자동 생성" })}
                </div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "Comes with every model. You write no endpoint for it.",
                    ko: "모든 모델에 딸려 옵니다. 따로 endpoint를 쓰지 않습니다.",
                  })}
                </div>
                <code className={chip}>createPost · updatePost · removePost</code>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Endpoint — you write it", ko: "Endpoint — 직접 작성" })}
                </div>
                <div className="mt-1 text-foreground/70 text-sm">
                  {l.trans({
                    en: "One business action, named with a verb.",
                    ko: "업무 동작 하나를 동사 이름으로 만듭니다.",
                  })}
                </div>
                <code className={chip}>publishPost · approveTicket · archiveProject</code>
              </div>
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    The rule of thumb: <strong>one button, one store action, one endpoint, one service method.</strong>
                  </span>
                ),
                ko: (
                  <span>
                    기억할 규칙은 하나입니다.{" "}
                    <strong>버튼 하나, store action 하나, endpoint 하나, service 메서드 하나.</strong>
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="flow" title={l.trans({ en: "The Flow", ko: "흐름 한눈에 보기" })}>
          <Docs.Title>{l.trans({ en: "The Flow", ko: "흐름 한눈에 보기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Here is a post's Publish button, followed from the click to the database. Each layer does one job and hands the rest down:",
                ko: "게시글의 발행 버튼을 클릭부터 데이터베이스까지 따라가 봅니다. 각 계층은 자기 일 하나만 하고 나머지를 아래로 넘깁니다:",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "File", ko: "파일" })}
              descLabel={l.trans({ en: "What it does", ko: "하는 일" })}
              items={flowRows}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>You never write the client call.</strong> <code>fetch.publishPost</code> is generated from
                      the endpoint you declare in the signal.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>클라이언트 호출 코드는 쓰지 않습니다.</strong> <code>fetch.publishPost</code>는 signal에
                      선언한 endpoint에서 자동으로 생깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The model name comes back at the edges.</strong> The document and service say{" "}
                      <code>publish()</code>; the signal, store and dictionary say <code>publishPost</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>모델 이름은 바깥 계층에서 다시 붙습니다.</strong> document와 service는{" "}
                      <code>publish()</code>, signal과 store와 dictionary는 <code>publishPost</code>라고 씁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="endpoint" title={l.trans({ en: "Declare Endpoint", ko: "Endpoint 선언하기" })}>
          <Docs.Title>{l.trans({ en: "Declare Endpoint", ko: "Endpoint 선언하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Keep the endpoint thin: take the arguments, name the guards, and call the service. The endpoint goes in the Endpoint class of the model's signal file:",
                ko: "Endpoint는 얇게 둡니다. 인자를 받고, guard를 적고, service를 호출하면 끝입니다. 모델의 signal 파일에서 Endpoint 클래스 안에 씁니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/post/post.signal.ts"
              code={`import { Admin, Every, Self } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class PostInternal extends internal(srv.post, () => ({})) {}

export class PostSlice extends slice(
  srv.post,
  { guards: { root: Admin, get: Public, cru: Admin } },
  () => ({}),
) {}

export class PostEndpoint extends endpoint(srv.post, ({ mutation }) => ({
  publishPost: mutation(cnst.Post, { guards: [Every] })
    .param("postId", ID)
    .with(Self)
    .exec(async function (postId, self) {
      return await this.postService.publish(postId, self.id);
    }),
})) {}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>mutation</code> changes data, <code>query</code> only reads.
                      </strong>{" "}
                      Both come from the <code>endpoint()</code> callback, and the first argument is the return type.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>mutation</code>은 데이터를 바꾸고, <code>query</code>는 읽기만 합니다.
                      </strong>{" "}
                      둘 다 <code>endpoint()</code> 콜백에서 받고, 첫 인자는 반환 타입입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>.with(Self)</code> is the signed-in user.
                      </strong>{" "}
                      The server fills it in, so never take the acting user's id from the client.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>.with(Self)</code>는 로그인한 사용자입니다.
                      </strong>{" "}
                      서버가 채워 주므로, 호출한 사용자의 id를 클라이언트에서 받지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>exec</code> gets the arguments in order.
                      </strong>{" "}
                      First the client arguments, then the <code>.with()</code> values. Write it as a{" "}
                      <code>function</code>, not an arrow, so <code>this.postService</code> resolves.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>exec</code>는 인자를 선언 순서대로 받습니다.
                      </strong>{" "}
                      클라이언트 인자가 먼저, 그다음 <code>.with()</code> 값이 옵니다. <code>this.postService</code>를
                      쓰려면 화살표 함수가 아니라 <code>function</code>으로 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Declare all three classes, even when empty.</strong> <code>PostInternal</code>,{" "}
                      <code>PostSlice</code> and <code>PostEndpoint</code> sit together, and the slice's{" "}
                      <code>root</code> guard is always <code>Admin</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>세 클래스는 비어 있어도 모두 선언합니다.</strong> <code>PostInternal</code>,{" "}
                      <code>PostSlice</code>, <code>PostEndpoint</code>를 함께 두고, slice의 <code>root</code> guard는
                      항상 <code>Admin</code>입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Arguments", ko: "인자" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Builder", ko: "빌더" })} items={argRows} />

            <Docs.SubSubTitle>{l.trans({ en: "Common options", ko: "자주 쓰는 옵션" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The second argument of <code>mutation()</code> or <code>query()</code> is the options object:
                  </span>
                ),
                ko: (
                  <span>
                    <code>mutation()</code>이나 <code>query()</code>의 두 번째 인자가 옵션 객체입니다:
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={optionRows} />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The first guard that refuses answers the call.</strong> The guards after it and the
                      handler never run.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>처음 거절한 guard가 응답합니다.</strong> 그 뒤의 guard와 핸들러는 실행되지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A timeout answers the caller; it does not stop the work.</strong> The handler still runs
                      to the end, with nobody waiting for its result.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>timeout은 호출자에게 답할 뿐, 작업을 멈추지 않습니다.</strong> 핸들러는 결과를 기다리는
                      쪽이 없어도 끝까지 실행됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Every custom endpoint names its own guards.</strong> The slice's guard map covers only the
                    generated CRUD, never <code>publishPost</code>. An endpoint without <code>guards</code> is open to
                    anyone over HTTP and is left out of the MCP catalogue; so is a mutation guarded only by{" "}
                    <code>Public</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>직접 만든 endpoint는 모두 자기 guard를 따로 적습니다.</strong> slice의 guard map은 자동
                    생성된 CRUD에만 적용되고 <code>publishPost</code>에는 닿지 않습니다. <code>guards</code>가 없는
                    endpoint는 HTTP로 누구나 부를 수 있고 MCP 카탈로그에서도 빠집니다. <code>Public</code> guard만 단
                    mutation도 마찬가지로 빠집니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="service"
          title={l.trans({ en: "Put Rules In Service And Document", ko: "규칙은 service와 document에" })}
        >
          <Docs.Title>
            {l.trans({ en: "Put Rules In Service And Document", ko: "규칙은 service와 document에" })}
          </Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Business rules never go in the button or the endpoint. Where each check goes depends on what it looks at:",
                ko: "업무 규칙은 버튼에도 endpoint에도 두지 않습니다. 각 검사를 어디에 둘지는 무엇을 보는 검사인지로 정합니다:",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "The check", ko: "검사 내용" })}
              columns={placeColumns}
              groups={placeGroups}
              markLabel={l.trans({ en: "Goes here", ko: "여기에 둡니다" })}
              emptyLabel={l.trans({ en: "Not here", ko: "여기가 아닙니다" })}
            />

            <Docs.SubSubTitle>
              {l.trans({ en: "1. Document: the state change", ko: "1. Document: 상태 바꾸기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A post can be published only when it has a title and content. That check lives on the record itself:",
                ko: "게시글은 제목과 내용이 있을 때만 발행할 수 있습니다. 이 검사는 레코드 자신에게 둡니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/post/post.document.ts"
              code={`import { by } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class Post extends by(cnst.Post) {
  // draft -> published
  publish() {
    if (!this.title || !this.content) throw new Err("post.error.notReady");
    this.status = "published";
    return this;
  }
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Validate, change, return.</strong> Check first, change <code>this</code>, and end with{" "}
                      <code>return this</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>검사하고, 바꾸고, 반환합니다.</strong> 먼저 검사하고 <code>this</code>를 바꾼 뒤{" "}
                      <code>return this</code>로 끝냅니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It never saves.</strong> The caller saves once, so chain methods can be combined.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>저장은 하지 않습니다.</strong> 호출한 쪽이 한 번만 저장하므로 체인 메서드를 이어 붙일 수
                      있습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "2. Service: load, check, save", ko: "2. Service: 불러오고, 확인하고, 저장하기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The service loads the post, checks it belongs to the caller, then runs the chain and saves:",
                ko: "service는 게시글을 불러오고, 호출한 사람의 것인지 확인한 뒤, 체인을 실행하고 저장합니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/post/post.service.ts"
              code={`import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class PostService extends serve(db.post, () => ({})) {
  async publish(postId: string, userId: string) {
    const post = await this.getPost(postId);
    if (post.author !== userId) throw new Err("post.error.notAuthor");
    return await post.publish().save();
  }
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>getPost</code> comes with <code>serve(db.post)</code>.
                      </strong>{" "}
                      Every model service gets a <code>get&lt;Model&gt;(id)</code> loader.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>getPost</code>는 <code>serve(db.post)</code>가 줍니다.
                      </strong>{" "}
                      모든 모델 service에는 <code>get&lt;Model&gt;(id)</code> 로더가 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Two gates, not one.</strong> <code>Every</code> only checks that someone is signed in; the
                      service checks the post is theirs.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>관문은 하나가 아니라 둘입니다.</strong> <code>Every</code>는 로그인 여부만 보고, 게시글의
                      주인인지는 service가 확인합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep the tail explicit.</strong> Write <code>return await …save()</code> as it is.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>마지막 줄은 그대로 씁니다.</strong> <code>return await …save()</code>의 <code>await</code>
                      를 빼지 않습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "3. Dictionary: register the keys", ko: "3. Dictionary: key 등록하기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    A key like <code>post.error.notReady</code> exists only once the module dictionary registers it as
                    an <code>[en, ko]</code> pair:
                  </span>
                ),
                ko: (
                  <span>
                    <code>post.error.notReady</code> 같은 key는 module dictionary에 <code>[en, ko]</code> 쌍으로
                    등록해야 생깁니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/post/post.dictionary.ts"
              code={`import { modelDictionary } from "akanjs/dictionary";

import type { Post, PostInsight, PostStatus } from "./post.constant";
import type { PostFilter } from "./post.document";
import type { PostEndpoint, PostSlice } from "./post.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Post", "게시글"]).desc([
      "A post a member writes",
      "회원이 작성하는 게시글",
    ]),
  )
  .model<Post>((t) => ({ // [!code collapse:14]
    title: t(["Title", "제목"]).desc(["Title of the post", "게시글 제목"]),
    content: t(["Content", "내용"]).desc(["Body of the post", "게시글 본문"]),
    status: t(["Status", "상태"]).desc(["Publish state", "발행 상태"]),
    author: t(["Author", "작성자"]).desc(["Who wrote it", "작성한 사용자"]),
  }))
  .insight<PostInsight>((t) => ({}))
  .query<PostFilter>((fn) => ({}))
  .sort<PostFilter>((t) => ({}))
  .enum<PostStatus>("postStatus", (t) => ({
    draft: t(["Draft", "초안"]).desc(["Not public yet", "아직 비공개"]),
    published: t(["Published", "발행됨"]).desc(["Public", "공개됨"]),
  }))
  .slice<PostSlice>((fn) => ({}))
  .endpoint<PostEndpoint>((fn) => ({
    publishPost: fn(["Publish Post", "게시글 발행"])
      .desc([
        "Publish a draft post so readers can see it",
        "초안 게시글을 발행해 독자에게 공개합니다",
      ])
      .arg((t) => ({
        postId: t(["Post ID", "게시글 ID"]).desc([
          "The post to publish",
          "발행할 게시글",
        ]),
      })),
  }))
  .error({
    notReady: [
      "Post is not ready to publish",
      "게시글을 발행할 준비가 되지 않았습니다.",
    ],
    notAuthor: [
      "Only the author can publish this post",
      "작성자만 이 게시글을 발행할 수 있습니다.",
    ],
  })
  .translate({
    publishSuccess: ["Post published", "게시글을 발행했습니다."],
  });`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>.error()</code> keys
                      </strong>{" "}
                      are thrown as <code>new Err("post.error.notReady")</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>.error()</code> key
                      </strong>
                      는 <code>new Err("post.error.notReady")</code>로 던집니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>.endpoint()</code> labels
                      </strong>{" "}
                      are read with <code>l("post.signal.publishPost")</code>. <code>.arg()</code> names every argument.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>.endpoint()</code> 라벨
                      </strong>
                      은 <code>l("post.signal.publishPost")</code>로 읽습니다. <code>.arg()</code>에는 인자를 모두
                      적습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>.translate()</code> keys
                      </strong>{" "}
                      feed toasts such as <code>msg.success("post.publishSuccess")</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>.translate()</code> key
                      </strong>
                      는 <code>msg.success("post.publishSuccess")</code> 같은 토스트에 씁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Refuse with <code>new Err("&lt;module&gt;.error.&lt;key&gt;")</code>, never{" "}
                      <code>throw new Error</code>.
                    </strong>{" "}
                    A raw <code>Error</code> carries no key the dictionary could translate for the reader, and lint
                    rejects it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      거절은 <code>new Err("&lt;module&gt;.error.&lt;key&gt;")</code>로 합니다.{" "}
                      <code>throw new Error</code>는 쓰지 않습니다.
                    </strong>{" "}
                    그냥 <code>Error</code>에는 dictionary가 번역할 key가 없고, lint도 막습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="store" title={l.trans({ en: "Call It From Store", ko: "Store에서 호출하기" })}>
          <Docs.Title>{l.trans({ en: "Call It From Store", ko: "Store에서 호출하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Client components do not call <code>fetch</code> themselves; a store action does. A custom endpoint
                    gets no generated action, so write one:
                  </span>
                ),
                ko: (
                  <span>
                    클라이언트 컴포넌트는 <code>fetch</code>를 직접 부르지 않고, store action이 부릅니다. 직접 만든
                    endpoint에는 자동 생성되는 action이 없으므로 하나 작성합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/post/post.store.ts"
              code={`import { store } from "akanjs/store";

import { fetch, msg, sig } from "../useClient";

export class PostStore extends store(sig.post, () => ({})) {
  async publishPost(postId: string) {
    this.setPost(await fetch.publishPost(postId));
    msg.success("post.publishSuccess");
  }
}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>About three lines.</strong> <code>await fetch.x()</code>, a generated setter such as{" "}
                      <code>this.setPost()</code>, then the toast.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>본문은 세 줄 정도입니다.</strong> <code>await fetch.x()</code>,{" "}
                      <code>this.setPost()</code> 같은 자동 생성 setter, 그리고 토스트 순서입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>More fits here too.</strong> After the endpoint succeeds, the action can also close a
                      modal or refresh data.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>후처리도 여기에 둡니다.</strong> endpoint가 성공한 뒤 모달 닫기나 데이터 갱신도 이
                      action이 함께 처리합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>An action returns nothing.</strong> Write the result into state with a setter or{" "}
                      <code>{"this.set({ … })"}</code>; a returned value never reaches the caller.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>action은 값을 반환하지 않습니다.</strong> 결과는 setter나 <code>{"this.set({ … })"}</code>
                      로 상태에 씁니다. 반환한 값은 호출한 쪽에 닿지 않습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="util" title={l.trans({ en: "Make One Util", ko: "Util 하나로 만들기" })}>
          <Docs.Title>{l.trans({ en: "Make One Util", ko: "Util 하나로 만들기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Put the button in <code>Post.Util.tsx</code>. Every card, detail page and admin page can then reuse
                    the same action:
                  </span>
                ),
                ko: (
                  <span>
                    버튼은 <code>Post.Util.tsx</code>에 둡니다. 그러면 카드, 상세 페이지, 관리자 페이지 어디서든 같은
                    action을 재사용할 수 있습니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/myapp/lib/post/Post.Util.tsx"
              code={`"use client";
import { st, usePage } from "@apps/myapp/client";
import { buttonRecipe } from "akanjs/ui";

interface PublishProps {
  className?: string;
  postId: string;
}
export const Publish = ({ className, postId }: PublishProps) => {
  const { l } = usePage();
  return (
    <button
      type="button"
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={() => st.do.publishPost(postId)}
    >
      {l("post.signal.publishPost")}
    </button>
  );
};`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Always a client component.</strong> <code>{'"use client"'}</code> sits on line 1 because
                      the button has an <code>onClick</code> and uses the store.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>항상 클라이언트 컴포넌트입니다.</strong> 버튼에 <code>onClick</code>이 있고 store를 쓰므로
                      첫 줄에 <code>{'"use client"'}</code>를 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Named for the verb.</strong> Export <code>Publish</code>, not{" "}
                      <code>PublishPostButton</code>; a page renders{" "}
                      <code>{"<Post.Util.Publish postId={post.id} />"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이름은 동사만 씁니다.</strong> <code>PublishPostButton</code>이 아니라{" "}
                      <code>Publish</code>로 export하고, page에서는{" "}
                      <code>{"<Post.Util.Publish postId={post.id} />"}</code>로 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Take an id, not a model.</strong> A Util prop typed as <code>cnst.Post</code> fails lint;
                      pass <code>postId: string</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>모델이 아니라 id를 받습니다.</strong> Util prop 타입을 <code>cnst.Post</code>로 두면
                      lint에 걸립니다. <code>postId: string</code>을 넘깁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "팁과 주의할 점" })}>
          <Docs.Title>{l.trans({ en: "Tips", ko: "팁과 주의할 점" })}</Docs.Title>
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Start endpoint names with a verb:</strong> <code>publishPost</code>,{" "}
                      <code>approveTicket</code>, <code>archiveProject</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>Endpoint 이름은 동사로 시작합니다.</strong> <code>publishPost</code>,{" "}
                      <code>approveTicket</code>, <code>archiveProject</code>처럼 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep rules out of the button.</strong> They belong in the service or the document.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>업무 규칙은 버튼에 두지 않습니다.</strong> service나 document에 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Seen the same action twice?</strong> Make it a Util component before you copy the button.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>같은 action이 두 번 보이면</strong> 버튼을 복사하기 전에 Util 컴포넌트로 만듭니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>Never reuse a generated CRUD name.</strong> <code>post</code>, <code>lightPost</code>,{" "}
                    <code>createPost</code>, <code>updatePost</code>, <code>removePost</code>, <code>viewPost</code>,{" "}
                    <code>editPost</code> and <code>mergePost</code> already exist. Declaring one again in the Endpoint
                    class fails lint.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>자동 생성된 CRUD 이름은 다시 쓰지 않습니다.</strong> <code>post</code>,{" "}
                    <code>lightPost</code>, <code>createPost</code>, <code>updatePost</code>, <code>removePost</code>,{" "}
                    <code>viewPost</code>, <code>editPost</code>, <code>mergePost</code>는 이미 있습니다. Endpoint
                    클래스에 다시 선언하면 lint 에러가 납니다.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 읽기" })}</Docs.SubSubTitle>
            <Docs.LinkGrid items={relatedLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
