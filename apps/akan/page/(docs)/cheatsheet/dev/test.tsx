import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Testing", ko: "Testing" })}>
        <Docs.Title>{l.trans({ en: "Testing", ko: "Testing" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "In Akan apps, start testing from signals. A signal test checks the real business flow through the generated fetch API before you spend time on UI details.",
              ko: "Akan app에서는 signal 테스트부터 시작하세요. Signal test는 UI 세부사항보다 먼저 generated fetch API를 통해 실제 business flow를 확인합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Test signup, permission, validation, and state transitions at the API layer.",
                ko: "Signup, permission, validation, state transition을 API layer에서 테스트합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Move repeated setup into small helper functions.",
                ko: "반복되는 준비 작업은 작은 helper 함수로 분리합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep long scenarios as several clear steps.",
                ko: "긴 scenario는 명확한 여러 step으로 나눕니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="helper" title={l.trans({ en: "Spec Helper", ko: "Spec helper" })}>
        <Docs.Title>{l.trans({ en: "Spec Helper", ko: "Spec helper" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A spec helper creates test users, agents, and sample data. The test file can then read like a user story instead of a setup script.",
              ko: "Spec helper는 test user, agent, sample data를 만듭니다. 그러면 test file은 setup script가 아니라 user story처럼 읽힙니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="article.signal.spec.ts"
          code={`export const getUserAgent = async () => {
  const agent = await createTestAgent();
  await agent.fetch.user.signup({ accountId: "user1", password: "pass" });
  await agent.fetch.user.signin({ accountId: "user1", password: "pass" });
  return agent;
};

export const createArticle = async (agent, title = "Hello") => {
  return agent.fetch.article.create({ title, body: "First post" });
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="test-file" title={l.trans({ en: "Test File", ko: "Test file" })}>
        <Docs.Title>{l.trans({ en: "Test File", ko: "Test file" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The test file imports helpers, prepares an agent, calls signals through fetch, and checks the result.",
              ko: "Test file은 helper를 import하고 agent를 준비한 뒤 fetch를 통해 signal을 호출하고 결과를 확인합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="article.signal.test.ts"
          code={`import { beforeAll, describe, expect, it } from "bun:test";
import { createArticle, getUserAgent } from "./article.signal.spec";

describe("article signal", () => {
  let agent;

  beforeAll(async () => {
    agent = await getUserAgent();
  });

  it("publishes a draft article", async () => {
    const article = await createArticle(agent);

    const published = await agent.fetch.article.publish(article.id);

    expect(published.status).toBe("published");
  });
});`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="targets" title={l.trans({ en: "What To Test", ko: "무엇을 테스트할까" })}>
        <Docs.Title>{l.trans({ en: "What To Test", ko: "무엇을 테스트할까" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Happy path: create, update, publish, archive.",
                ko: "Happy path: create, update, publish, archive.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Permission: guest cannot publish, owner can edit, admin can remove.",
                ko: "Permission: guest는 publish 불가, owner는 edit 가능, admin은 remove 가능.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Validation: missing title, invalid date, duplicated accountId.",
                ko: "Validation: title 누락, 잘못된 date, accountId 중복.",
              })}
            </li>
            <li>
              {l.trans({
                en: "State transition: draft to published, pending to approved.",
                ko: "State transition: draft에서 published, pending에서 approved.",
              })}
            </li>
            <li>
              {l.trans({
                en: "External dependency: file upload, payment callback, message publish.",
                ko: "External dependency: file upload, payment callback, message publish.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="command" title={l.trans({ en: "Command", ko: "명령어" })}>
        <Docs.Title>{l.trans({ en: "Command", ko: "명령어" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Run app tests from the workspace root. Add `--write false` when you want to avoid writing snapshots or generated output during a check.",
              ko: "Workspace root에서 app test를 실행합니다. 점검 중 snapshot이나 generated output 쓰기를 막고 싶으면 `--write false`를 붙입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Run tests", ko: "테스트 실행" })}
          code={`akan test myapp
akan test myapp --write false`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Create data through signals when possible so the test uses the same rules as the app.",
                ko: "가능하면 signal로 데이터를 만들어 app과 같은 rule을 타게 하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use helpers for setup, but keep assertions in the test file.",
                ko: "Setup은 helper로 빼되 assertion은 test file에 남겨두세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Test one important behavior per `it` block.",
                ko: "`it` block 하나에는 중요한 behavior 하나만 테스트하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
