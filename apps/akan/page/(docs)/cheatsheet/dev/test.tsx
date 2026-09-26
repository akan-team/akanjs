import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const termRows = [
    {
      name: "signal test",
      desc: l.trans({
        en: "A test that calls your endpoints through the generated `fetch`, against a real test server.",
        ko: "자동 생성된 `fetch`로 endpoint를 호출해, 실제로 떠 있는 테스트 서버에서 확인하는 테스트입니다.",
      }),
    },
    {
      name: "fixture",
      desc: l.trans({
        en: "A reusable function that prepares what a test needs, such as a record or a signed-in user.",
        ko: "레코드나 로그인한 사용자처럼 테스트에 필요한 것을 준비해 주는 재사용 함수입니다.",
      }),
    },
    {
      name: "agent",
      desc: l.trans({
        en: "A test user bundled with a `fetch` that is already signed in as that user.",
        ko: "테스트용 사용자와, 그 사용자로 이미 로그인된 `fetch`를 한데 묶은 것입니다.",
      }),
    },
  ];

  const helperRows = [
    {
      name: "getOrSetupSignalTestFetch",
      desc: l.trans({
        en: "Returns the test server's signed-out `fetch`, starting the server on the first call.",
        ko: "테스트 서버의 로그인하지 않은 `fetch`를 돌려주며, 처음 부를 때 서버를 띄웁니다.",
      }),
    },
    {
      name: "sampleOf",
      desc: l.trans({
        en: "Fills every field of a constant class with a sample value, using the field's default when set.",
        ko: "constant 클래스의 모든 필드를 샘플 값으로 채우고, 기본값이 있는 필드는 그 기본값을 씁니다.",
      }),
      example: "sampleOf(cnst.ArticleInput)",
    },
    {
      name: "sample",
      desc: l.trans({
        en: "Makes one random value at a time, such as an email or a string of a given length.",
        ko: "이메일이나 정해진 길이의 문자열처럼 랜덤 값을 하나씩 만듭니다.",
      }),
      example: "sample.email() · sample.string({ length: 10 })",
    },
    {
      name: "configureSignalTest",
      href: "#test-file",
      desc: l.trans({
        en: "Changes the test server's settings, covered in the Test File section below.",
        ko: "테스트 서버 설정을 바꾸며, 아래 test 파일 섹션에서 다룹니다.",
      }),
    },
  ];

  const serverOptionRows = [
    {
      key: "storage",
      type: '"memory" | "tempFile"',
      default: '"memory"',
      desc: l.trans({
        en: "`tempFile` keeps SQLite in a temporary file instead of memory, deleted after the run.",
        ko: "`tempFile`은 SQLite를 메모리 대신 임시 파일에 두고, 실행이 끝나면 지웁니다.",
      }),
    },
    {
      key: "port",
      type: "number",
      default: "38080 + worker id",
      desc: l.trans({
        en: "The port the test server listens on.",
        ko: "테스트 서버가 여는 포트입니다.",
      }),
    },
  ];

  const targetRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "Happy path", ko: "정상 흐름" })}</span>,
      desc: l.trans({ en: "Create, update, publish, archive.", ko: "생성, 수정, 발행, 보관." }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Permission", ko: "권한" })}</span>,
      desc: l.trans({
        en: "A guest cannot publish, the owner can edit, an admin can remove.",
        ko: "게스트는 발행할 수 없고, 작성자는 수정할 수 있으며, 관리자는 삭제할 수 있습니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Validation", ko: "입력 검증" })}</span>,
      desc: l.trans({
        en: "Missing title, invalid date, duplicated `accountId`.",
        ko: "title 누락, 잘못된 날짜, 중복된 `accountId`.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "State transition", ko: "상태 전이" })}</span>,
      desc: l.trans({
        en: "`draft` to `published`, `pending` to `approved`.",
        ko: "`draft`에서 `published`로, `pending`에서 `approved`로.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "External dependency", ko: "외부 연동" })}</span>,
      desc: l.trans({
        en: "File upload, payment callback, message publish.",
        ko: "파일 업로드, 결제 콜백, 메시지 발행.",
      }),
    },
  ];

  const commandOptionRows = [
    {
      key: "<target>",
      type: "app | lib | pkg",
      desc: l.trans({
        en: "The app, library or package to test, such as `myapp` or `shared`.",
        ko: "테스트할 app, lib, 패키지의 이름입니다. 예: `myapp`, `shared`.",
      }),
    },
    {
      key: "--write",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "`false` skips writing generated code before an app's tests run.",
        ko: "`false`면 app 테스트를 돌리기 전에 생성 코드를 쓰지 않습니다.",
      }),
    },
  ];

  const commandColumns = [
    { key: "signal", label: l.trans({ en: "Signal tests", ko: "signal 테스트" }), caption: "apps · libs" },
    { key: "pkg", label: l.trans({ en: "Package tests", ko: "패키지 테스트" }), caption: "pkgs" },
  ];

  const commandGroups = [
    {
      label: l.trans({ en: "Use", ko: "쓰는 명령" }),
      rows: [
        {
          name: "akan test <target>",
          desc: l.trans({
            en: "Run from the workspace root. It passes `--isolate` for you.",
            ko: "워크스페이스 루트에서 실행합니다. `--isolate`를 대신 붙여 줍니다.",
          }),
          marks: { signal: true, pkg: true },
        },
        {
          name: "bun test --isolate",
          desc: l.trans({
            en: "Fine inside a package directory, but a signal test cannot find its app this way.",
            ko: "패키지 디렉터리 안에서는 괜찮지만, 이렇게 돌리면 signal 테스트가 자기 app을 찾지 못합니다.",
          }),
          marks: { signal: false, pkg: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Never", ko: "쓰지 않는 명령" }),
      rows: [
        {
          name: "bun test",
          desc: l.trans({
            en: "Without `--isolate`, test files share one global object and break each other.",
            ko: "`--isolate`가 없으면 테스트 파일들이 전역 객체 하나를 같이 써서 서로를 망가뜨립니다.",
          }),
          marks: { signal: false, pkg: false },
        },
      ],
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Testing", ko: "테스트" })}>
        <Docs.Title>{l.trans({ en: "Testing", ko: "테스트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  In an Akan app, start testing from signals. A signal test checks the real business flow through the
                  generated <code>fetch</code> before you spend time on UI details.
                </span>
              ),
              ko: (
                <span>
                  Akan 앱의 테스트는 signal부터 시작합니다. signal 테스트는 UI를 다듬기 전에, 자동 생성된{" "}
                  <code>fetch</code>로 실제 비즈니스 흐름을 확인합니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Always two files", ko: "파일은 항상 두 개" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A signal suite is always two files, and the split is not a matter of taste:",
              ko: "signal 테스트는 항상 두 파일로 나눕니다. 이 구분은 취향 문제가 아닙니다:",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "Fixtures", ko: "fixture" })}</div>
              <code className={chip}>{"<model>.signal.spec.ts"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: (
                    <span>
                      Reusable fixtures built on <code>sampleOf(cnst.XInput)</code>, each with a declared return type
                      and no assertions. Other modules import from it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>sampleOf(cnst.XInput)</code> 위에 만든 재사용 fixture입니다. fixture마다 반환 타입을 밝히고
                      assertion은 넣지 않으며, 다른 모듈이 이 파일에서 import해 씁니다.
                    </span>
                  ),
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "Assertions", ko: "검증" })}</div>
              <code className={chip}>{"<model>.signal.test.ts"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: (
                    <span>
                      <code>{'describe("<Model> Signal")'}</code>, <code>let</code> fixtures at describe scope, one{" "}
                      <code>beforeAll</code>, and <code>it</code> blocks in story order.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>{'describe("<Model> Signal")'}</code>, describe 스코프의 <code>let</code> fixture,{" "}
                      <code>beforeAll</code> 하나, 이야기 순서대로 놓인 <code>it</code> 블록으로 이뤄집니다.
                    </span>
                  ),
                })}
              </div>
            </div>
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Both files sit beside the module they cover.</strong> For example, <code>lib/article/</code>{" "}
                    holds <code>article.signal.spec.ts</code> and <code>article.signal.test.ts</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>두 파일 모두 대상 모듈 옆에 둡니다.</strong> 예를 들어 <code>lib/article/</code>에{" "}
                    <code>article.signal.spec.ts</code>와 <code>article.signal.test.ts</code>가 함께 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One fetch reaches the whole flow.</strong> Signup, permission, validation and state
                    transitions are all checked through it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>fetch 하나로 흐름 전체를 확인합니다.</strong> 회원가입, 권한, 입력 검증, 상태 전이까지 모두
                    같은 fetch로 다룹니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Steps", ko: "순서" })}</Docs.SubSubTitle>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              <Link href="#helper" className="text-primary">
                {l.trans({ en: "Build fixtures in the spec file.", ko: "spec 파일에 fixture를 만듭니다." })}
              </Link>
            </li>
            <li>
              <Link href="#test-file" className="text-primary">
                {l.trans({ en: "Write the assertions in the test file.", ko: "test 파일에 검증을 씁니다." })}
              </Link>
            </li>
            <li>
              <Link href="#command" className="text-primary">
                {l.trans({
                  en: (
                    <span>
                      Run them with <code>akan test</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>akan test</code>로 실행합니다.
                    </span>
                  ),
                })}
              </Link>
            </li>
          </ol>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="helper"
        title={l.trans({ en: "Spec File: Building Fixtures", ko: "spec 파일: fixture 만들기" })}
      >
        <Docs.Title>{l.trans({ en: "Spec File: Building Fixtures", ko: "spec 파일: fixture 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A spec file builds agents and sample data. The <code>fetch</code> it hands back is flat, so a call
                  reads <code>agent.fetch.createArticle(...)</code>, never a namespace per model.
                </span>
              ),
              ko: (
                <span>
                  spec 파일은 agent와 샘플 데이터를 만듭니다. 돌려주는 <code>fetch</code>에는 모든 endpoint가 바로 붙어
                  있어서, 모델별 namespace 없이 <code>agent.fetch.createArticle(...)</code>처럼 부릅니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "akanjs/test helper", ko: "akanjs/test 도우미" })} items={helperRows} />

          <Docs.SubSubTitle>
            {l.trans({ en: "1. Agent types live in one place", ko: "1. agent 타입은 한 곳에서" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Agent types are re-exported and re-typed only in <code>lib/user/user.signal.spec.ts</code>. It binds
                  the shared agents to your app's <code>fetch</code>:
                </span>
              ),
              ko: (
                <span>
                  agent 타입은 <code>lib/user/user.signal.spec.ts</code> 한 곳에서만 다시 export하고 타입을 맞춥니다. 이
                  파일이 공용 agent를 내 app의 <code>fetch</code>에 묶습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/user/user.signal.spec.ts"
            code={`import * as sharedUserSpec from "@libs/shared/lib/user/user.signal.spec";

import type { fetch as appFetch } from "../useServer";

type AppFetch = typeof appFetch;

export type UserAgent = sharedUserSpec.UserAgent<AppFetch>;
export type AdminAgent = sharedUserSpec.AdminAgent<AppFetch>;

export const getUserAgentWithPhone = async (): Promise<UserAgent> =>
  await sharedUserSpec.getUserAgentWithPhone<AppFetch>();

export const getUserAgentWithPassword = async (): Promise<UserAgent> =>
  await sharedUserSpec.getUserAgentWithPassword<AppFetch>();`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Import agent types from here only.</strong> Other specs and tests import{" "}
                    <code>UserAgent</code> and <code>AdminAgent</code> from <code>../user/user.signal.spec</code>, not
                    from the lib that owns them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>agent 타입은 여기서만 import합니다.</strong> 다른 spec과 test는 <code>UserAgent</code>와{" "}
                    <code>AdminAgent</code>를 소유한 lib이 아니라 <code>../user/user.signal.spec</code>에서 가져옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>An agent is a signed-up user with a signed-in fetch.</strong>{" "}
                    <code>getUserAgentWithPhone</code> returns <code>{"{ user, fetch, accessToken, userInput }"}</code>,
                    and <code>getUserAgentWithPassword</code> does the same with an email and password.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>agent는 가입을 마친 사용자와 로그인된 fetch입니다.</strong>{" "}
                    <code>getUserAgentWithPhone</code>은 <code>{"{ user, fetch, accessToken, userInput }"}</code>를
                    돌려주고, <code>getUserAgentWithPassword</code>는 이메일과 비밀번호로 같은 일을 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Two users in one file? Call <code>getUserAgentWithPassword()</code> twice.
                    </strong>{" "}
                    Each call signs up a new random email, while a second <code>getUserAgentWithPhone()</code> reuses
                    the same phone number and fails.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      한 파일에 사용자가 둘 필요하면 <code>getUserAgentWithPassword()</code>를 두 번 부릅니다.
                    </strong>{" "}
                    부를 때마다 새 랜덤 이메일로 가입하지만, <code>getUserAgentWithPhone()</code>을 두 번 부르면 같은
                    전화번호로 다시 가입하려다 실패합니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "2. The model's fixtures", ko: "2. 모델의 fixture" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A model's spec builds on those agents. Every fixture declares its return type:",
              ko: "모델의 spec은 그 agent 위에 fixture를 쌓습니다. fixture마다 반환 타입을 밝힙니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/article/article.signal.spec.ts"
            code={`import { getOrSetupSignalTestFetch, sampleOf } from "akanjs/test";

import * as cnst from "../cnst";
import type { fetch as appFetch } from "../useServer";
import { getUserAgentWithPhone, type UserAgent } from "../user/user.signal.spec";

type AppFetch = typeof appFetch;

export const getWriterAgent = async (): Promise<UserAgent> =>
  await getUserAgentWithPhone();

export const getGuestFetch = async (): Promise<AppFetch> =>
  await getOrSetupSignalTestFetch<AppFetch>();

export const createDraftArticle = async (agent: UserAgent): Promise<cnst.Article> => {
  const articleInput = sampleOf(cnst.ArticleInput);
  return await agent.fetch.createArticle({ ...articleInput, status: "draft" });
};`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Override only what the test is about.</strong> Spread <code>sampleOf(...)</code> and change
                    one field, like <code>{'status: "draft"'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>테스트에서 중요한 필드만 덮어씁니다.</strong> <code>sampleOf(...)</code>를 펼친 뒤{" "}
                    <code>{'status: "draft"'}</code>처럼 필드 하나만 바꿉니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The guest fetch is signed out.</strong> <code>getOrSetupSignalTestFetch()</code> returns the
                    plain <code>fetch</code>, which is how a test plays a visitor.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>guest fetch는 로그인하지 않은 상태입니다.</strong> <code>getOrSetupSignalTestFetch()</code>
                    가 돌려주는 기본 <code>fetch</code>로 방문자를 흉내 냅니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="test-file" title={l.trans({ en: "Test File: Writing Assertions", ko: "test 파일: 검증 쓰기" })}>
        <Docs.Title>{l.trans({ en: "Test File: Writing Assertions", ko: "test 파일: 검증 쓰기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The test file carries every assertion. Fixtures are <code>let</code> bindings at describe scope, so
                  each <code>it</code> picks up where the previous one left off:
                </span>
              ),
              ko: (
                <span>
                  assertion은 모두 test 파일에 둡니다. fixture는 describe 스코프의 <code>let</code> 변수라서, 각{" "}
                  <code>it</code>이 앞의 <code>it</code>이 남긴 상태에서 이어갑니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/article/article.signal.test.ts"
            code={`import { beforeAll, describe, expect, it } from "bun:test";

import type * as cnst from "../cnst";
import type { UserAgent } from "../user/user.signal.spec";
import * as articleSpec from "./article.signal.spec";

describe("Article Signal", () => {
  let writerAgent: UserAgent;
  let article: cnst.Article;

  beforeAll(async () => {
    writerAgent = await articleSpec.getWriterAgent();
  });

  it("creates a draft", async () => {
    article = await articleSpec.createDraftArticle(writerAgent);
    expect(article.status).toBe("draft");
  });

  it("publishes the draft", async () => {
    article = await writerAgent.fetch.publishArticle(article.id);
    expect(article.status).toBe("published");
  });

  it("refuses to publish for anyone but the owner", async () => {
    const guestFetch = await articleSpec.getGuestFetch();
    await expect(guestFetch.publishArticle(article.id)).rejects.toThrow();
  });
});`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      One <code>beforeAll</code> prepares the cast.
                    </strong>{" "}
                    Agents are created once and shared by every <code>it</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>beforeAll</code> 하나에서 등장인물을 준비합니다.
                    </strong>{" "}
                    agent는 한 번 만들어 모든 <code>it</code>이 함께 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>it</code> blocks run in story order.
                    </strong>{" "}
                    Create, then publish, then try what must be refused.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>it</code> 블록은 이야기 순서대로 놓습니다.
                    </strong>{" "}
                    만들고, 발행하고, 거절돼야 하는 호출을 시도하는 순서입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A refusal is <code>await expect(p).rejects.toThrow()</code>.
                    </strong>{" "}
                    When a guard refuses the call, the <code>fetch</code> promise rejects.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      거절은 <code>await expect(p).rejects.toThrow()</code>로 확인합니다.
                    </strong>{" "}
                    guard가 호출을 막으면 <code>fetch</code> promise가 reject됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Each test file starts on an empty database.</strong> Files get their own test server, so
                    they never see each other's data.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>test 파일마다 빈 데이터베이스에서 시작합니다.</strong> 파일마다 테스트 서버가 따로 뜨므로
                    서로의 데이터를 보지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Changing the test server", ko: "테스트 서버 설정 바꾸기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The test server uses an in-memory SQLite database by default. To change a setting, call{" "}
                  <code>configureSignalTest</code> at the top of the test file:
                </span>
              ),
              ko: (
                <span>
                  테스트 서버는 기본으로 메모리 안의 SQLite 데이터베이스를 씁니다. 설정을 바꾸려면 test 파일 맨 위에서{" "}
                  <code>configureSignalTest</code>를 부릅니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/article/article.signal.test.ts"
            code={`import { configureSignalTest } from "akanjs/test";

configureSignalTest({ storage: "tempFile" });`}
          />
          <Docs.OptionTable items={serverOptionRows} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Call it before any fixture runs.</strong> Once the test server has started,{" "}
                    <code>configureSignalTest</code> throws.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>fixture가 실행되기 전에 부릅니다.</strong> 테스트 서버가 이미 떴다면{" "}
                    <code>configureSignalTest</code>는 에러를 던집니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="targets" title={l.trans({ en: "What To Test", ko: "무엇을 테스트할까" })}>
        <Docs.Title>{l.trans({ en: "What To Test", ko: "무엇을 테스트할까" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A signal test file usually covers these five kinds of behaviour:",
              ko: "signal 테스트 파일은 보통 다음 다섯 가지 동작을 확인합니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Kind", ko: "분류" })}
            descLabel={l.trans({ en: "Examples", ko: "예시" })}
            items={targetRows}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="command" title={l.trans({ en: "Command", ko: "실행 명령" })}>
        <Docs.Title>{l.trans({ en: "Command", ko: "실행 명령" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Run tests from the workspace root with <code>akan test</code>. It prepares the target, then runs{" "}
                  <code>bun test --isolate</code> inside it:
                </span>
              ),
              ko: (
                <span>
                  테스트는 워크스페이스 루트에서 <code>akan test</code>로 실행합니다. 대상을 준비한 뒤 그 안에서{" "}
                  <code>bun test --isolate</code>를 실행합니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan test myapp
akan test myapp --write false
akan test shared`}
          />
          <Docs.OptionTable items={commandOptionRows} />

          <Docs.SubSubTitle>
            {l.trans({ en: "Running in another database mode", ko: "다른 데이터베이스 모드로 돌리기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A signal suite runs in <code>single</code> mode. To run it in <code>multiple</code> or{" "}
                  <code>cluster</code>, name the mode and the services it needs:
                </span>
              ),
              ko: (
                <span>
                  signal 테스트는 <code>single</code> 모드로 돕니다. <code>multiple</code>이나 <code>cluster</code>로
                  돌리려면 모드와 그 모드가 쓰는 서비스를 알려 줍니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan dbup --mode cluster
AKAN_TEST_DATABASE_MODE=cluster \\
  AKAN_TEST_REDIS_URL=redis://localhost:6379 \\
  AKAN_TEST_POSTGRES_URL=postgres://akan:akan@localhost:5432/akan \\
  akan test myapp`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>multiple</code> needs <code>AKAN_TEST_REDIS_URL</code>, <code>cluster</code> also{" "}
                      <code>AKAN_TEST_POSTGRES_URL</code>.
                    </strong>{" "}
                    Each test file starts on an emptied Redis database and a Postgres schema of its own, dropped
                    afterwards.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>multiple</code>에는 <code>AKAN_TEST_REDIS_URL</code>이, <code>cluster</code>에는{" "}
                      <code>AKAN_TEST_POSTGRES_URL</code>까지 필요합니다.
                    </strong>{" "}
                    test 파일마다 비운 Redis 데이터베이스와 자기만의 Postgres 스키마에서 시작하고, 스키마는 끝나면
                    지웁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The Postgres user must be able to create schemas and roles.</strong> The one{" "}
                    <code>akan dbup --mode cluster</code> starts can.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Postgres 사용자는 스키마와 role을 만들 수 있어야 합니다.</strong>{" "}
                    <code>akan dbup --mode cluster</code>가 띄우는 Postgres의 사용자는 그럴 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Only <code>AKAN_TEST_DATABASE_MODE</code> picks the mode.
                    </strong>{" "}
                    An <code>AKAN_DATABASE_MODE</code> left in your shell does not reach the suite.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      모드는 <code>AKAN_TEST_DATABASE_MODE</code>로만 정합니다.
                    </strong>{" "}
                    셸에 남아 있는 <code>AKAN_DATABASE_MODE</code>는 테스트에 닿지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Which command to use", ko: "어떤 명령을 쓸까" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Command", ko: "명령" })}
            columns={commandColumns}
            groups={commandGroups}
            markLabel={l.trans({ en: "Works", ko: "동작함" })}
            emptyLabel={l.trans({ en: "Does not work", ko: "동작하지 않음" })}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Signal test target is not configured.</code>
                    </strong>{" "}
                    means a signal test ran without <code>akan test</code>. Run it again through{" "}
                    <code>akan test &lt;app-or-lib&gt;</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Signal test target is not configured.</code>
                    </strong>
                    는 signal 테스트를 <code>akan test</code> 없이 돌렸다는 뜻입니다.{" "}
                    <code>akan test &lt;app-or-lib&gt;</code>로 다시 실행하세요.
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
                    Never run plain <code>bun test</code>.
                  </strong>{" "}
                  Without <code>--isolate</code>, every test file shares one global object and dozens of tests fail from
                  cross-file state pollution. <code>bunfig.toml</code>'s <code>[test] isolate</code> is not honored, and
                  running it from the workspace root also breaks subprocess stdio pipes.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>bun test</code>를 그냥 실행하지 마세요.
                  </strong>{" "}
                  <code>--isolate</code>가 없으면 모든 test 파일이 전역 객체 하나를 같이 써서, 파일 간 상태 오염으로
                  테스트 수십 개가 실패합니다. <code>bunfig.toml</code>의 <code>[test] isolate</code>는 적용되지 않고,
                  워크스페이스 루트에서 실행하면 하위 프로세스의 stdio 파이프까지 깨집니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Create data through signals when possible.</strong> The test then follows the same rules as
                    the app.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>데이터는 되도록 signal로 만듭니다.</strong> 그래야 테스트가 앱과 같은 규칙을 따릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the spec free of assertions.</strong> A fixture that asserts fails somebody else's
                    suite, for a reason their file does not show.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>spec에는 assertion을 두지 않습니다.</strong> assertion이 든 fixture는 다른 사람의 테스트를
                    실패시키는데, 그 이유가 그쪽 파일에는 보이지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Test one important behaviour per <code>it</code> block.
                    </strong>{" "}
                    A failure then names exactly what broke.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>it</code> 블록 하나에는 중요한 동작 하나만 확인합니다.
                    </strong>{" "}
                    그래야 실패했을 때 무엇이 깨졌는지 바로 드러납니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
