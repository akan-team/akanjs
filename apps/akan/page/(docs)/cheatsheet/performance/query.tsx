import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const sqlExamples = [
    {
      helper: "plain equality",
      query: `{ status: "done" }`,
      sql: `json_extract(_doc, '$.status') = ?`,
    },
    {
      helper: "q.eq",
      query: `{ priority: q.eq("high") }`,
      sql: `json_extract(_doc, '$.priority') = ?`,
    },
    {
      helper: "q.ne",
      query: `{ status: q.ne("archived") }`,
      sql: `json_extract(_doc, '$.status') != ?`,
    },
    {
      helper: "q.oneOf",
      query: `{ status: q.oneOf(["done", "reviewing"]) }`,
      sql: `json_extract(_doc, '$.status') IN (?, ?)`,
    },
    {
      helper: "q.notOneOf",
      query: `{ status: q.notOneOf(["archived", "deleted"]) }`,
      sql: `json_extract(_doc, '$.status') NOT IN (?, ?)`,
    },
    {
      helper: "q.gt",
      query: `{ score: q.gt(80) }`,
      sql: `json_extract(_doc, '$.score') > ?`,
    },
    {
      helper: "q.gte",
      query: `{ progress: q.gte(50) }`,
      sql: `json_extract(_doc, '$.progress') >= ?`,
    },
    {
      helper: "q.lt",
      query: `{ retryCount: q.lt(3) }`,
      sql: `json_extract(_doc, '$.retryCount') < ?`,
    },
    {
      helper: "q.lte",
      query: `{ dueAt: q.lte(to) }`,
      sql: `json_extract(_doc, '$.dueAt') <= ?`,
    },
    {
      helper: "q.between",
      query: `{ updatedAt: q.between(from, to) }`,
      sql: `json_extract(_doc, '$.updatedAt') BETWEEN ? AND ?`,
    },
    {
      helper: "q.exists",
      query: `q.exists("assignee")`,
      sql: `json_type(_doc, '$.assignee') IS NOT NULL`,
    },
    {
      helper: "q.missing",
      query: `q.missing("deletedAt")`,
      sql: `json_type(_doc, '$.deletedAt') IS NULL`,
    },
    {
      helper: "q.empty",
      query: `q.empty("removedAt")`,
      sql: `json_extract(_doc, '$.removedAt') IS NULL OR json_extract(_doc, '$.removedAt') = ''`,
    },
    {
      helper: "q.has",
      query: `{ tags: q.has("urgent") }`,
      sql: `EXISTS (SELECT 1 FROM json_each(json_extract(_doc, '$.tags')) WHERE value = ?)`,
    },
    {
      helper: "q.contains",
      query: `{ title: q.contains("release") }`,
      sql: `json_extract(_doc, '$.title') LIKE ?`,
    },
    {
      helper: "q.all",
      query: `q.all({ project }, { status: "active" })`,
      sql: `(json_extract(_doc, '$.project') = ?) AND (json_extract(_doc, '$.status') = ?)`,
    },
    {
      helper: "q.any",
      query: `q.any({ status: "done" }, { status: "reviewing" })`,
      sql: `(json_extract(_doc, '$.status') = ?) OR (json_extract(_doc, '$.status') = ?)`,
    },
    {
      helper: "q.not",
      query: `q.not({ status: "archived" })`,
      sql: `NOT (json_extract(_doc, '$.status') = ?)`,
    },
    {
      helper: "q.when true",
      query: `q.when(userIds.length, { user: q.oneOf(userIds) })`,
      sql: `json_extract(_doc, '$.user') IN (?, ...)`,
    },
    {
      helper: "q.when false",
      query: `q.when(false, { user })`,
      sql: `1 = 1`,
    },
    {
      helper: "nested path",
      query: `{ "profile.city": "Seoul" }`,
      sql: `json_extract(_doc, '$.profile.city') = ?`,
    },
    {
      helper: "array field",
      query: `{ watchers: q.has(userId) }`,
      sql: `EXISTS (SELECT 1 FROM json_each(json_extract(_doc, '$.watchers')) WHERE value = ?)`,
    },
    {
      helper: "q.raw",
      query: `q.raw("json_extract(_doc, '$.score') > ?", [minScore])`,
      sql: `(json_extract(_doc, '$.score') > ?)`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Querying", ko: "쿼리" })}>
        <Docs.Title>{l.trans({ en: "Querying", ko: "쿼리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "In Akan, database queries usually live in `document.ts` filters. Pages and services ask for a named filter instead of rebuilding the same condition everywhere.",
              ko: "Akan에서 데이터베이스 쿼리는 보통 `document.ts`의 filter에 둡니다. Page와 service는 같은 조건을 매번 만들지 않고 이름 붙은 filter를 호출합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use `filter().arg()` for required inputs.",
                ko: "필수 입력은 `filter().arg()`로 받습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `filter().opt()` for optional inputs.",
                ko: "선택 입력은 `filter().opt()`로 받습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the `q` helper for readable conditions.",
                ko: "읽기 쉬운 조건을 위해 `q` helper를 사용합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="basic" title={l.trans({ en: "Basic Filter", ko: "기본 filter" })}>
        <Docs.Title>{l.trans({ en: "Basic Filter", ko: "기본 filter" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start with the query your screen needs. For example, a project page often needs active tasks in that project.",
              ko: "화면에 필요한 query에서 시작하세요. 예를 들어 project page는 해당 project의 활성 task 목록이 필요합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Tasks in project", ko: "Project의 task" })}
          code={`export class TaskFilter extends from(cnst.Task, (filter) => ({
  query: {
    inProject: filter()
      .arg("projectId", ID)
      .query((projectId, q) =>
        q.all(
          { project: projectId },
          q.not({ status: "archived" }),
        ),
      ),
  },
  sort: {},
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="optional" title={l.trans({ en: "Optional Conditions", ko: "선택 조건" })}>
        <Docs.Title>{l.trans({ en: "Optional Conditions", ko: "선택 조건" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Optional filters should add conditions only when the user actually selected something. `q.when` keeps that logic compact.",
              ko: "선택 filter는 사용자가 실제로 선택한 값이 있을 때만 조건을 붙여야 합니다. `q.when`을 쓰면 그 로직이 짧아집니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Filter by assignees", ko: "담당자 조건" })}
          code={`inProjectWithAssignees: filter()
  .arg("projectId", ID)
  .opt("assigneeIds", [ID])
  .query((projectId, assigneeIds, q) =>
    q.all(
      { project: projectId },
      q.when(assigneeIds?.length, {
        assignee: q.oneOf(assigneeIds),
      }),
    ),
  ),`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="range" title={l.trans({ en: "Range And OR", ko: "범위와 OR" })}>
        <Docs.Title>{l.trans({ en: "Range And OR", ko: "범위와 OR" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `q.between` for periods and `q.any` for OR. This keeps date dashboards and status boards readable.",
              ko: "기간 조건에는 `q.between`, OR 조건에는 `q.any`를 사용하세요. 날짜 dashboard와 상태 board를 읽기 쉽게 유지할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Dashboard period", ko: "Dashboard 기간" })}
          code={`inPeriod: filter()
  .arg("projectId", ID)
  .arg("from", Date)
  .arg("to", Date)
  .query((projectId, from, to, q) =>
    q.all(
      { project: projectId },
      { updatedAt: q.between(from, to) },
      q.any({ status: "done" }, { status: "reviewing" }),
    ),
  ),`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="raw" title={l.trans({ en: "Raw Query", ko: "Raw query" })}>
        <Docs.Title>{l.trans({ en: "Raw Query", ko: "Raw query" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use raw query only when the helper cannot express the condition. Keep it as a small SQL fragment and always pass values as parameters.",
              ko: "Helper로 표현하기 어려운 조건에만 raw query를 사용하세요. 작은 SQL fragment로 유지하고 값은 항상 parameter로 넘기세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Score threshold", ko: "점수 조건" })}
          code={`popular: filter()
  .arg("minScore", Number)
  .query((minScore, q) =>
    q.all(
      { status: "published" },
      q.raw("json_extract(_doc, '$.score') > ?", [minScore]),
    ),
  ),`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="sql" title={l.trans({ en: "How It Becomes SQL", ko: "SQL로 바뀌는 방식" })}>
        <Docs.Title>{l.trans({ en: "How It Becomes SQL", ko: "SQL로 바뀌는 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan stores most model data as document fields, then turns filter objects into SQL where clauses. You write in document shape, the adaptor compiles it for the database.",
              ko: "Akan은 대부분의 model 데이터를 document field로 저장하고, filter object를 SQL where clause로 바꿉니다. 개발자는 document 모양으로 쓰고, adaptor가 database용으로 컴파일합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="overflow-x-auto">
          <table className="table w-full table-fixed">
            <thead>
              <tr>
                <th className="w-[160px]">{l.trans({ en: "Query helper", ko: "Query helper" })}</th>
                <th className="w-[300px]">{l.trans({ en: "Document query", ko: "Document query" })}</th>
                <th className="w-[420px]">{l.trans({ en: "SQL condition text", ko: "SQL 조건문 텍스트" })}</th>
              </tr>
            </thead>
            <tbody>
              {sqlExamples.map((example) => (
                <tr key={example.helper}>
                  <td className="align-top font-semibold">
                    <code>{example.helper}</code>
                  </td>
                  <td className="align-top">
                    <pre className="whitespace-pre-wrap rounded bg-base-200 p-2 text-xs">
                      <code>{example.query}</code>
                    </pre>
                  </td>
                  <td className="align-top">
                    <pre className="whitespace-pre-wrap rounded bg-base-200 p-2 text-xs">
                      <code>{example.sql}</code>
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These SQL snippets are simplified to show the idea. Akan keeps values parameterized, so user input should be passed as values instead of being pasted into raw SQL strings.",
              ko: "이 SQL 조각들은 개념을 보여주기 위해 단순화한 예시입니다. Akan은 값을 parameter로 유지하므로, 사용자 입력은 raw SQL 문자열에 붙이지 말고 값으로 전달해야 합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Alert type="info">
          <div className="space-y-2">
            <div className="font-bold">
              {l.trans({
                en: "Why does Akan store most model data as JSON document fields?",
                ko: "Akan은 왜 대부분의 model 데이터를 JSON document 형태로 저장하나요?",
              })}
            </div>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "Schema changes are lighter. Adding a small field usually does not require a table migration, so product code can move faster.",
                  ko: "스키마 변경이 가볍습니다. 작은 field를 추가할 때 보통 table migration이 필요 없어서 제품 코드를 더 빠르게 움직일 수 있습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Akan prefers query-first document design before low-level query tuning. Data that is read together can stay together, reducing extra joins and service glue code.",
                  ko: "Akan은 낮은 수준의 query 튜닝보다 query-first document 설계를 먼저 봅니다. 함께 읽는 데이터는 함께 두어 추가 join과 service glue code를 줄일 수 있습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Business models often contain nested settings, histories, options, and snapshots. JSON fields keep those shapes natural while still allowing SQL filters for important paths.",
                  ko: "비즈니스 모델에는 nested setting, history, option, snapshot이 자주 들어갑니다. JSON field는 이런 모양을 자연스럽게 유지하면서도 중요한 경로에는 SQL filter를 적용할 수 있습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "You can denormalize intentionally for list/detail screens, then add indexes only to the paths that become hot.",
                  ko: "목록/상세 화면에 맞춰 의도적으로 denormalize하고, 트래픽이 많아진 경로에만 index를 추가할 수 있습니다.",
                })}
              </li>
            </ul>
          </div>
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Name filters after screens or use cases: `inProject`, `inPeriod`, `forDashboard`.",
                ko: "Filter 이름은 화면이나 사용 사례 기준으로 지으세요. `inProject`, `inPeriod`, `forDashboard`처럼요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep page code free of query-building details.",
                ko: "Page code에는 query 조건 조립을 넣지 않는 것이 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Prefer helper queries before raw SQL.",
                ko: "Raw SQL보다 helper query를 먼저 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Add indexes for filters that become important traffic paths.",
                ko: "중요 트래픽 경로가 된 filter에는 index를 추가하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
