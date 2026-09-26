import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const sqlOf = (query: string, sql: string) => `${query}\n// → ${sql}`;

  const blockRows = [
    {
      name: "filter()",
      desc: l.trans({
        en: "Starts one named query inside `from(cnst.Task, (filter) => …)`.",
        ko: "`from(cnst.Task, (filter) => …)` 안에서 이름 붙은 쿼리 하나를 시작합니다.",
      }),
    },
    {
      name: ".arg(name, Type)",
      desc: l.trans({
        en: 'A required input, such as `.arg("projectId", ID)`.',
        ko: '필수 입력입니다. 예: `.arg("projectId", ID)`.',
      }),
    },
    {
      name: ".opt(name, Type)",
      desc: l.trans({
        en: "An optional input. It comes after every `.arg()` and is `undefined` when left out.",
        ko: "선택 입력입니다. 모든 `.arg()` 뒤에 오고, 넘기지 않으면 `undefined`입니다.",
      }),
    },
    {
      name: ".query((...args, q) => …)",
      desc: l.trans({
        en: "Gets the inputs in declared order, then `q`, and returns the condition.",
        ko: "입력을 선언한 순서대로 받고 마지막에 `q`를 받아 조건을 반환합니다.",
      }),
    },
    {
      name: "q",
      desc: l.trans({
        en: "The condition helper: `q.all`, `q.oneOf`, `q.between`, `q.when` and more.",
        ko: "조건 헬퍼입니다. `q.all`, `q.oneOf`, `q.between`, `q.when` 등이 있습니다.",
      }),
    },
    {
      name: "sort",
      desc: l.trans({
        en: "Named orders beside the built-in `latest`, `oldest` and `relevance`. Write `{}` if you add none.",
        ko: "기본 제공되는 `latest`, `oldest`, `relevance` 외에 추가하는 정렬입니다. 없으면 `{}`로 둡니다.",
      }),
    },
  ];

  const methodRows = [
    {
      name: "listInProject",
      desc: l.trans({
        en: "Every match. A last argument `{ sort, skip, limit }` pages it.",
        ko: "조건에 맞는 문서 전부입니다. 마지막 인자 `{ sort, skip, limit }`로 페이지를 나눕니다.",
      }),
    },
    {
      name: "findInProject",
      desc: l.trans({ en: "The first match, or `null`.", ko: "첫 번째로 맞는 문서입니다. 없으면 `null`입니다." }),
    },
    {
      name: "pickInProject",
      desc: l.trans({
        en: "The first match. Throws when there is none.",
        ko: "첫 번째로 맞는 문서입니다. 없으면 에러를 던집니다.",
      }),
    },
    {
      name: "countInProject",
      desc: l.trans({ en: "How many documents match.", ko: "맞는 문서의 수입니다." }),
    },
    {
      name: "existsInProject",
      desc: l.trans({ en: "The id of one match, or `null`.", ko: "맞는 문서 하나의 id입니다. 없으면 `null`입니다." }),
    },
    {
      name: "queryInProject",
      desc: l.trans({
        en: "The condition itself, not yet run. A slice's `exec` returns this.",
        ko: "아직 실행하지 않은 조건 자체입니다. slice의 `exec`는 이것을 반환합니다.",
      }),
    },
  ];

  const whereRows = [
    {
      name: "_doc",
      desc: l.trans({
        en: "A JSON column holding every declared field; SQLite reads one with `json_extract(_doc, '$.field')`.",
        ko: "모델이 선언한 field를 모두 담는 JSON 컬럼입니다. SQLite에서는 `json_extract(_doc, '$.field')`로 읽습니다.",
      }),
    },
    {
      name: ["id", "createdAt", "updatedAt", "removedAt"],
      desc: l.trans({
        en: 'Four real columns, compared directly: `"updatedAt" >= ?`.',
        ko: '실제 컬럼 네 개입니다. `"updatedAt" >= ?`처럼 바로 비교합니다.',
      }),
    },
  ];

  const compareRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "plain value", ko: "값 그대로" })}</span>,
      desc: l.trans({
        en: "Equals. Several keys in one object are joined with AND.",
        ko: "같다는 뜻입니다. 객체 하나에 key가 여러 개면 AND로 묶입니다.",
      }),
      example: sqlOf(`{ status: "done" }`, `json_extract(_doc, '$.status') = ?`),
    },
    {
      name: "q.eq",
      desc: l.trans({
        en: "Equals, spelled out. Same as a plain value.",
        ko: "같음을 명시해서 쓴 형태로, 값을 그대로 쓴 것과 같습니다.",
      }),
      example: sqlOf(`{ priority: q.eq("high") }`, `json_extract(_doc, '$.priority') = ?`),
    },
    {
      name: "q.ne",
      desc: l.trans({ en: "Not equal.", ko: "같지 않습니다." }),
      example: sqlOf(`{ status: q.ne("archived") }`, `json_extract(_doc, '$.status') != ?`),
    },
    {
      name: "q.oneOf",
      desc: l.trans({
        en: "Equals any value in the list. An empty list matches nothing.",
        ko: "목록의 값 중 하나와 같습니다. 빈 목록은 아무것도 찾지 않습니다.",
      }),
      example: sqlOf(`{ status: q.oneOf(["done", "reviewing"]) }`, `json_extract(_doc, '$.status') IN (?, ?)`),
    },
    {
      name: "q.notOneOf",
      desc: l.trans({
        en: "Equals none of the values. An empty list matches everything.",
        ko: "목록의 어떤 값과도 같지 않습니다. 빈 목록은 모두 찾습니다.",
      }),
      example: sqlOf(`{ status: q.notOneOf(["archived", "deleted"]) }`, `json_extract(_doc, '$.status') NOT IN (?, ?)`),
    },
    {
      name: "q.gt",
      desc: l.trans({ en: "Greater than.", ko: "주어진 값보다 큽니다." }),
      example: sqlOf(`{ score: q.gt(80) }`, `json_extract(_doc, '$.score') > ?`),
    },
    {
      name: "q.gte",
      desc: l.trans({ en: "Greater than or equal to.", ko: "크거나 같습니다." }),
      example: sqlOf(`{ progress: q.gte(50) }`, `json_extract(_doc, '$.progress') >= ?`),
    },
    {
      name: "q.lt",
      desc: l.trans({ en: "Less than.", ko: "주어진 값보다 작습니다." }),
      example: sqlOf(`{ retryCount: q.lt(3) }`, `json_extract(_doc, '$.retryCount') < ?`),
    },
    {
      name: "q.lte",
      desc: l.trans({ en: "Less than or equal to.", ko: "작거나 같습니다." }),
      example: sqlOf(`{ dueAt: q.lte(to) }`, `json_extract(_doc, '$.dueAt') <= ?`),
    },
    {
      name: "q.between",
      desc: l.trans({ en: "Inside a range, both ends included.", ko: "범위 안에 있습니다. 양 끝값도 포함합니다." }),
      example: sqlOf(
        `{ dueAt: q.between(from, to) }`,
        `json_extract(_doc, '$.dueAt') >= ? AND json_extract(_doc, '$.dueAt') <= ?`,
      ),
    },
  ];

  const presenceRows = [
    {
      name: "q.exists",
      desc: l.trans({
        en: "The key is in the stored JSON, even when it holds `null`.",
        ko: "저장된 JSON에 key가 있습니다. 값이 `null`이어도 해당합니다.",
      }),
      example: sqlOf(`q.exists("assignee")`, `json_type(_doc, '$.assignee') IS NOT NULL`),
    },
    {
      name: "q.missing",
      desc: l.trans({
        en: "The key is absent from the stored JSON. Use it only for rows older than the field.",
        ko: "저장된 JSON에 key가 없습니다. field보다 먼저 쓰인 행을 찾을 때만 씁니다.",
      }),
      example: sqlOf(`q.missing("deletedAt")`, `json_type(_doc, '$.deletedAt') IS NULL`),
    },
    {
      name: "q.empty",
      desc: l.trans({
        en: "Has no value: the key is absent or holds `null`.",
        ko: "값이 없습니다. key가 없거나 `null`을 담고 있습니다.",
      }),
      example: sqlOf(
        `q.empty("assignee")`,
        `json_type(_doc, '$.assignee') IS NULL OR json_type(_doc, '$.assignee') = 'null'`,
      ),
    },
  ];

  const arrayRows = [
    {
      name: "q.has",
      desc: l.trans({ en: "The array field contains the value.", ko: "배열 field가 그 값을 담고 있습니다." }),
      example: sqlOf(
        `{ tags: q.has("urgent") }`,
        `EXISTS (SELECT 1 FROM json_each(json_extract(_doc, '$.tags')) WHERE json_each.value = ?)`,
      ),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "array field", ko: "배열 field" })}</span>,
      desc: l.trans({
        en: "On an array field, a plain value or `q.oneOf` also checks the items.",
        ko: "배열 field에서는 값 그대로나 `q.oneOf`도 항목 안을 검사합니다.",
      }),
      example: sqlOf(
        `{ watchers: userId }`,
        `EXISTS (SELECT 1 FROM json_each(json_extract(_doc, '$.watchers')) WHERE json_each.value = ?)`,
      ),
    },
    {
      name: "q.contains",
      desc: l.trans({
        en: "The text includes the value, bound as `%release%`.",
        ko: "텍스트가 그 값을 포함합니다. 값은 `%release%`로 바인딩됩니다.",
      }),
      example: sqlOf(`{ title: q.contains("release") }`, `json_extract(_doc, '$.title') LIKE ?`),
    },
    {
      name: "q.search",
      desc: l.trans({
        en: "Full-text search over `text`-role fields, compiled to a JOIN. Works in every database mode.",
        ko: "`text` 역할 field의 전문 검색으로, WHERE가 아닌 JOIN이 됩니다. 모든 데이터베이스 모드에서 동작합니다.",
      }),
      example: sqlOf(
        `q.search(text, { prefix: true })`,
        `JOIN (SELECT … FROM search_fts … WHERE search_fts MATCH ?) …`,
      ),
    },
  ];

  const combineRows = [
    {
      name: "q.all",
      desc: l.trans({
        en: "Every condition holds. `null`, `undefined` and `false` entries are skipped.",
        ko: "모든 조건이 참입니다. `null`, `undefined`, `false` 항목은 건너뜁니다.",
      }),
      example: sqlOf(
        `q.all({ project }, { status: "active" })`,
        `(json_extract(_doc, '$.project') = ?) AND (json_extract(_doc, '$.status') = ?)`,
      ),
    },
    {
      name: "q.any",
      desc: l.trans({ en: "At least one condition holds.", ko: "조건 중 하나 이상이 참입니다." }),
      example: sqlOf(
        `q.any({ status: "done" }, { status: "reviewing" })`,
        `(json_extract(_doc, '$.status') = ?) OR (json_extract(_doc, '$.status') = ?)`,
      ),
    },
    {
      name: "q.not",
      desc: l.trans({ en: "The condition does not hold.", ko: "조건이 거짓입니다." }),
      example: sqlOf(`q.not({ status: "archived" })`, `NOT (json_extract(_doc, '$.status') = ?)`),
    },
    {
      name: "q.when",
      desc: l.trans({
        en: "Adds the query when the condition is truthy, and nothing when it is falsy.",
        ko: "조건이 참이면 쿼리를 붙이고, 거짓이면 아무것도 붙이지 않습니다.",
      }),
      example: `${sqlOf(`q.when(userIds.length, { user: q.oneOf(userIds) })`, `json_extract(_doc, '$.user') IN (?, ...)`)}\n${sqlOf(`q.when(false, { user })`, `1 = 1`)}`,
    },
  ];

  const pathRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "nested path", ko: "중첩 경로" })}</span>,
      desc: l.trans({
        en: "A dotted key reaches into a nested object.",
        ko: "점으로 이은 key로 중첩 객체 안을 봅니다.",
      }),
      example: sqlOf(`{ "profile.city": "Seoul" }`, `json_extract(_doc, '$.profile.city') = ?`),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "base column", ko: "기본 컬럼" })}</span>,
      desc: l.trans({
        en: "`id`, `createdAt`, `updatedAt` and `removedAt` are compared as real columns.",
        ko: "`id`, `createdAt`, `updatedAt`, `removedAt`은 실제 컬럼으로 비교합니다.",
      }),
      example: sqlOf(`{ updatedAt: q.gte(from) }`, `"updatedAt" >= ?`),
    },
    {
      name: "q.raw",
      desc: l.trans({
        en: "Your own SQL fragment, wrapped in parentheses; write it in your database's dialect.",
        ko: "직접 쓴 SQL 조각입니다. 괄호로 감싸져 그대로 들어가므로, 쓰는 데이터베이스의 문법으로 씁니다.",
      }),
      example: sqlOf(`q.raw("json_extract(_doc, '$.score') > ?", [minScore])`, `(json_extract(_doc, '$.score') > ?)`),
    },
  ];

  const sqlGroups = [
    { title: l.trans({ en: "Compare Values", ko: "값 비교" }), rows: compareRows },
    { title: l.trans({ en: "Presence", ko: "값의 유무" }), rows: presenceRows },
    { title: l.trans({ en: "Arrays And Text", ko: "배열과 텍스트" }), rows: arrayRows },
    { title: l.trans({ en: "Combine Conditions", ko: "조건 조합" }), rows: combineRows },
    { title: l.trans({ en: "Paths And Raw SQL", ko: "경로와 raw SQL" }), rows: pathRows },
  ];

  const whyCards = [
    {
      title: l.trans({ en: "Lighter Schema Changes", ko: "가벼운 스키마 변경" }),
      desc: l.trans({
        en: "Adding a small field usually needs no table migration, so product code moves faster.",
        ko: "작은 field를 더할 때 보통 테이블 마이그레이션이 필요 없어서, 제품 코드를 더 빨리 바꿀 수 있습니다.",
      }),
    },
    {
      title: l.trans({ en: "Query-First Design", ko: "쿼리 우선 설계" }),
      desc: l.trans({
        en: "Data read together is stored together, which saves extra joins and service glue code.",
        ko: "함께 읽는 데이터를 함께 저장해서, 추가 join과 service의 연결 코드가 줄어듭니다.",
      }),
    },
    {
      title: l.trans({ en: "Natural Nested Shapes", ko: "자연스러운 중첩 구조" }),
      desc: l.trans({
        en: "Settings, histories, options and snapshots keep their shape, and important paths stay filterable.",
        ko: "설정, 이력, 옵션, 스냅샷이 제 모양을 유지하면서도, 중요한 경로는 그대로 필터링할 수 있습니다.",
      }),
    },
    {
      title: l.trans({ en: "Index Only What Gets Hot", ko: "자주 쓰는 경로에만 인덱스" }),
      desc: l.trans({
        en: "Denormalize on purpose for list and detail screens, then index only the paths that carry traffic.",
        ko: "목록과 상세 화면에 맞춰 일부러 비정규화하고, 트래픽이 몰리는 경로에만 인덱스를 추가합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Querying", ko: "쿼리" })}>
        <Docs.Title>{l.trans({ en: "Querying", ko: "쿼리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  In Akan, a database query is a named filter in <code>{"<model>.document.ts"}</code>. Services and
                  slices call it by name instead of rebuilding the same condition in every place.
                </span>
              ),
              ko: (
                <span>
                  Akan에서 데이터베이스 쿼리는 <code>{"<model>.document.ts"}</code>에 이름을 붙여 둔 필터입니다.
                  service와 slice는 같은 조건을 곳곳에서 다시 만들지 않고 그 이름으로 호출합니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Building Blocks", ko: "구성 요소" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Piece", ko: "요소" })} items={blockRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="basic" title={l.trans({ en: "Basic Filter", ko: "기본 필터" })}>
        <Docs.Title>{l.trans({ en: "Basic Filter", ko: "기본 필터" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start from the list your screen needs. A project page, for example, shows the tasks of one project that are not archived.",
              ko: "화면에 필요한 목록에서 시작합니다. 예를 들어 프로젝트 페이지는 그 프로젝트에서 보관되지 않은 태스크 목록을 보여 줍니다.",
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "1. Declare It In document.ts", ko: "1. document.ts에 선언하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Add the filter to the model's filter class:",
              ko: "모델의 filter 클래스에 필터를 추가합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/task/task.document.ts"
          code={`import { ID } from "akanjs/base";
import { from } from "akanjs/document";

import * as cnst from "../cnst";

export class TaskFilter extends from(cnst.Task, (filter) => ({
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
        <Docs.Description>
          <Docs.SubSubTitle>
            {l.trans({ en: "2. Name It In The Dictionary", ko: "2. dictionary에 이름 붙이기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Give the filter and each of its arguments an <code>[en, ko]</code> label. A missing entry is a type
                  error:
                </span>
              ),
              ko: (
                <span>
                  필터와 각 인자에 <code>[en, ko]</code> 라벨을 붙입니다. 빠진 항목이 있으면 타입 에러가 납니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/task/task.dictionary.ts"
          code={`  .query<TaskFilter>((fn) => ({
    inProject: fn(["In Project", "프로젝트별 조회"]).arg((t) => ({
      projectId: t(["Project", "프로젝트"]).desc([
        "Project to list tasks of",
        "태스크를 조회할 프로젝트",
      ]),
    })),
  }))`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "3. Call It By Name", ko: "3. 이름으로 호출하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Each filter becomes a set of methods on the model and the service, named after it:",
              ko: "필터마다 그 이름을 딴 메서드가 model과 service에 생깁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/task/task.service.ts"
          code={`import { serve } from "akanjs/service";

import * as db from "../db";

export class TaskService extends serve(db.task, () => ({})) {
  async summarizeProject(projectId: string) {
    const [recentTasks, taskNum] = await Promise.all([
      this.taskModel.listInProject(projectId, { sort: "latest", limit: 20 }),
      this.taskModel.countInProject(projectId),
    ]);
    return { recentTasks, taskNum };
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "The methods you will reach for most:",
              ko: "가장 자주 쓰는 메서드는 다음과 같습니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Method", ko: "메서드" })}
            descLabel={l.trans({ en: "Returns", ko: "반환값" })}
            items={methodRows}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Eight more follow the same naming:</strong> <code>listIds</code>, <code>findId</code>,{" "}
                    <code>pickId</code>, <code>insight</code>, and the query-level writes <code>remove</code>,{" "}
                    <code>removeOne</code>, <code>update</code> and <code>updateOne</code>, which run no hooks.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>같은 규칙으로 여덟 개가 더 있습니다.</strong> <code>listIds</code>, <code>findId</code>,{" "}
                    <code>pickId</code>, <code>insight</code>, 그리고 hook 없이 쿼리로 바로 쓰는 <code>remove</code>,{" "}
                    <code>removeOne</code>, <code>update</code>, <code>updateOne</code>입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A service call has no page size.</strong> Without <code>limit</code>,{" "}
                    <code>listInProject()</code> returns every match, so pass one for lists that grow.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>service에서 부르면 페이지 크기가 없습니다.</strong> <code>limit</code> 없이 부른{" "}
                    <code>listInProject()</code>는 맞는 문서를 전부 반환하므로, 계속 늘어나는 목록에는 꼭 넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>sort</code> names a sort key.
                    </strong>{" "}
                    Use <code>latest</code>, <code>oldest</code> or a key from the filter's <code>sort</code> map; an
                    unknown key is refused.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>sort</code>에는 정렬 키 이름을 넣습니다.
                    </strong>{" "}
                    <code>latest</code>, <code>oldest</code> 또는 필터의 <code>sort</code>에 선언한 키를 쓰고, 없는 키는
                    거절됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="optional" title={l.trans({ en: "Optional Conditions", ko: "선택 조건" })}>
        <Docs.Title>{l.trans({ en: "Optional Conditions", ko: "선택 조건" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An optional input should add its condition only when the user actually picked something.{" "}
                  <code>q.when(condition, query)</code> adds <code>query</code> when <code>condition</code> is truthy,
                  and nothing otherwise:
                </span>
              ),
              ko: (
                <span>
                  선택 입력은 사용자가 실제로 무언가를 골랐을 때만 조건을 붙여야 합니다.{" "}
                  <code>q.when(condition, query)</code>는 <code>condition</code>이 참일 때만 <code>query</code>를
                  붙이고, 아니면 아무것도 붙이지 않습니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/task/task.document.ts"
          code={`inProjectWithAssignees: filter()
  .arg("projectId", ID)
  .opt("assigneeIds", [ID])
  .query((projectId, assigneeIds, q) =>
    q.all(
      { project: projectId },
      q.when(assigneeIds?.length, {
        assignee: q.oneOf(assigneeIds ?? []),
      }),
    ),
  ),`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>q.when</code> builds its query even when the condition is false.
                    </strong>{" "}
                    <code>q.oneOf(undefined)</code> throws, which is why the snippet passes{" "}
                    <code>assigneeIds ?? []</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>q.when</code>은 조건이 거짓이어도 두 번째 인자를 먼저 만듭니다.
                    </strong>{" "}
                    <code>q.oneOf(undefined)</code>는 에러를 던지므로, 위 코드는 <code>assigneeIds ?? []</code>를
                    넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      An <code>undefined</code> value throws.
                    </strong>{" "}
                    <code>{"{ assignee: assigneeId }"}</code> with no <code>assigneeId</code> is refused, so wrap it in{" "}
                    <code>q.when</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>undefined</code> 값은 에러입니다.
                    </strong>{" "}
                    <code>assigneeId</code>가 없으면 <code>{"{ assignee: assigneeId }"}</code>는 거절되므로{" "}
                    <code>q.when</code>으로 감쌉니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>q.oneOf([])</code> matches nothing.
                    </strong>{" "}
                    Checking <code>?.length</code>, not just presence, keeps an empty pick from emptying the list.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>q.oneOf([])</code>는 아무것도 찾지 않습니다.
                    </strong>{" "}
                    값이 있는지만 보지 말고 <code>?.length</code>까지 확인해야 빈 선택이 목록을 비워 버리지 않습니다.
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
                    “Has no value” is <code>q.empty</code>, never <code>q.missing</code>.
                  </strong>{" "}
                  <code>q.missing</code> means the key is absent from the stored JSON. A document read and saved again
                  gets an explicit <code>null</code> from the read, so the key is there from then on. Use{" "}
                  <code>q.missing</code> only to find rows written before the field was declared.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    “값이 없다”는 <code>q.empty</code>이고, <code>q.missing</code>이 아닙니다.
                  </strong>{" "}
                  <code>q.missing</code>은 저장된 JSON에 key 자체가 없다는 뜻입니다. 한 번 읽고 다시 저장한 document에는
                  읽을 때 생긴 명시적 <code>null</code>이 들어가서, 그때부터 key가 있습니다. <code>q.missing</code>은 그
                  field를 선언하기 전에 쓰인 행을 찾을 때만 씁니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="range" title={l.trans({ en: "Range And OR", ko: "범위와 OR" })}>
        <Docs.Title>{l.trans({ en: "Range And OR", ko: "범위와 OR" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Use <code>q.between</code> for a period and <code>q.any</code> for OR. Date dashboards and status
                  boards stay readable:
                </span>
              ),
              ko: (
                <span>
                  기간에는 <code>q.between</code>, OR 조건에는 <code>q.any</code>를 씁니다. 날짜 대시보드와 상태 보드가
                  읽기 쉬워집니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/task/task.document.ts"
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
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Both ends are included.</strong> <code>q.between(from, to)</code> compiles to{" "}
                    <code>{">= from AND <= to"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>양 끝값이 포함됩니다.</strong> <code>q.between(from, to)</code>는{" "}
                    <code>{">= from AND <= to"}</code>로 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Pass dates as they arrive.</strong> A <code>Date</code> argument reaches the query as a{" "}
                    <code>Dayjs</code>, and dates are compared as epoch milliseconds.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>날짜는 받은 그대로 넘깁니다.</strong> <code>Date</code> 인자는 <code>Dayjs</code>로
                    들어오고, 날짜는 epoch 밀리초로 비교됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One object with several keys is already AND.</strong>{" "}
                    <code>{'{ project: projectId, status: "done" }'}</code> needs no <code>q.all</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>key가 여러 개인 객체 하나는 이미 AND입니다.</strong>{" "}
                    <code>{'{ project: projectId, status: "done" }'}</code>에는 <code>q.all</code>이 필요 없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="raw" title={l.trans({ en: "Raw Query", ko: "Raw 쿼리" })}>
        <Docs.Title>{l.trans({ en: "Raw Query", ko: "Raw 쿼리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Reach for <code>q.raw</code> only when no helper can express the condition. Keep it one small SQL
                  fragment, and pass every value as a parameter:
                </span>
              ),
              ko: (
                <span>
                  헬퍼로 표현할 수 없는 조건에만 <code>q.raw</code>를 씁니다. 작은 SQL 조각 하나로 유지하고, 값은 모두
                  파라미터로 넘깁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/post/post.document.ts"
          code={`aboveScore: filter()
  .arg("minScore", Float)
  .query((minScore, q) =>
    q.all(
      { status: "published" },
      q.raw("json_extract(_doc, '$.score') > ?", [minScore]),
    ),
  ),`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Values go in the array, never in the string.</strong> Each <code>?</code> binds the next
                    value, so user input never becomes SQL.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>값은 문자열이 아니라 배열에 넣습니다.</strong> <code>?</code>마다 다음 값이 바인딩되므로
                    사용자 입력이 SQL이 되는 일이 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One fragment, one condition.</strong> It is wrapped in parentheses and joined like any other
                    condition, and a fragment containing <code>;</code> is refused.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>조각 하나에 조건 하나.</strong> 괄호로 감싸져 다른 조건처럼 이어지고, <code>;</code>가 든
                    조각은 거절됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Write it for your database.</strong> The snippet is SQLite / libsql. Postgres keeps{" "}
                    <code>_doc</code> as <code>jsonb</code> and reads a field as text, so the same condition is{" "}
                    <code>{`("_doc" #>> '{score}')::numeric > ?`}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>쓰는 데이터베이스에 맞춰 작성합니다.</strong> 위 코드는 SQLite / libsql 문법입니다.
                    Postgres는 <code>_doc</code>을 <code>jsonb</code>로 두고 field를 텍스트로 읽으므로, 같은 조건은{" "}
                    <code>{`("_doc" #>> '{score}')::numeric > ?`}</code>입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A raw fragment is not translated between databases.</strong> An app that runs on both SQLite
                  and Postgres avoids <code>q.raw</code>, or writes the fragment per database.
                </span>
              ),
              ko: (
                <span>
                  <strong>raw 조각은 데이터베이스에 맞춰 바뀌지 않습니다.</strong> SQLite와 Postgres 양쪽에서 도는 앱은{" "}
                  <code>q.raw</code>를 쓰지 않거나, 데이터베이스마다 조각을 따로 씁니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="sql" title={l.trans({ en: "How It Becomes SQL", ko: "SQL로 바뀌는 방식" })}>
        <Docs.Title>{l.trans({ en: "How It Becomes SQL", ko: "SQL로 바뀌는 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Akan keeps a model's fields in one JSON column, <code>_doc</code>, and compiles a filter object into a
                  SQL <code>WHERE</code> clause. You write in the document's shape; the database adaptor writes the SQL.
                </span>
              ),
              ko: (
                <span>
                  Akan은 모델의 field를 JSON 컬럼 하나, <code>_doc</code>에 담고, filter 객체를 SQL <code>WHERE</code>{" "}
                  절로 컴파일합니다. 개발자는 document 모양으로 쓰고, SQL은 데이터베이스 adaptor가 씁니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Where A Field Lives", ko: "field가 저장되는 곳" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Column", ko: "컬럼" })} items={whereRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Removed documents never match.</strong> Every read adds <code>{'"removedAt" IS NULL'}</code>
                    , so you never write that condition yourself.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>삭제한 document는 결과에 나오지 않습니다.</strong> 모든 조회에{" "}
                    <code>{'"removedAt" IS NULL'}</code>이 붙으므로 이 조건은 직접 쓰지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The SQL below is simplified SQLite / libsql.</strong> Postgres compiles the same filter to{" "}
                    <code>jsonb</code> operators such as <code>{"_doc #> '{status}'"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>아래 SQL은 단순화한 SQLite / libsql 형태입니다.</strong> Postgres에서는 같은 필터가{" "}
                    <code>{"_doc #> '{status}'"}</code> 같은 <code>jsonb</code> 연산자로 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Values stay parameters.</strong> Every <code>?</code> is bound separately, so user input is
                    never pasted into the SQL text.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>값은 파라미터로 남습니다.</strong> <code>?</code>마다 따로 바인딩되므로, 사용자 입력이 SQL
                    문자열에 붙여 넣어지지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          {sqlGroups.map((group) => (
            <div key={group.title}>
              <Docs.SubSubTitle>{group.title}</Docs.SubSubTitle>
              <Docs.IntroTable
                type={l.trans({ en: "Helper", ko: "헬퍼" })}
                descLabel={l.trans({ en: "Meaning and SQL", ko: "의미와 SQL" })}
                items={group.rows}
              />
            </div>
          ))}
          <Docs.SubSubTitle>{l.trans({ en: "Why A JSON Document?", ko: "왜 JSON document인가요?" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {whyCards.map((card) => (
              <div key={card.title} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{card.title}</div>
                <div className="mt-1 text-foreground/70 text-sm">{card.desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Query Habits", ko: "쿼리 작성 습관" })}>
        <Docs.Title>{l.trans({ en: "Query Habits", ko: "쿼리 작성 습관" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Four habits keep filters easy to find and fast to run:",
              ko: "필터를 찾기 쉽고 빠르게 유지하는 네 가지 습관입니다:",
            })}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Name filters with a preposition.</strong> <code>inProject</code>, <code>inPeriod</code> and{" "}
                    <code>byStatuses</code> say what the list is scoped to; never <code>getXInY</code> or{" "}
                    <code>listX</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>필터 이름은 전치사로 시작합니다.</strong> <code>inProject</code>, <code>inPeriod</code>,{" "}
                    <code>byStatuses</code>처럼 목록의 범위를 말하고, <code>getXInY</code>나 <code>listX</code>는 쓰지
                    않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep query building out of pages.</strong> Pages and services call the filter by name, so
                    each condition lives in one place.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>page에서 쿼리를 조립하지 않습니다.</strong> page와 service는 필터를 이름으로 부르므로,
                    조건은 한 곳에만 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Prefer helpers to raw SQL.</strong> Helpers work on both SQLite and Postgres and bind every
                    value for you.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>raw SQL보다 헬퍼를 먼저 씁니다.</strong> 헬퍼는 SQLite와 Postgres 모두에서 동작하고 값을
                    알아서 바인딩합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>q.contains</code> reads every row.
                    </strong>{" "}
                    It is a <code>{"LIKE '%…%'"}</code> scan that no index can serve; a search box wants{" "}
                    <code>q.search</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>q.contains</code>는 모든 행을 읽습니다.
                    </strong>{" "}
                    인덱스를 쓸 수 없는 <code>{"LIKE '%…%'"}</code> 스캔이므로, 검색창에는 <code>q.search</code>를
                    씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Index The Hot Paths", ko: "자주 쓰는 경로에 인덱스" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  When a filter becomes a busy traffic path, index the fields it compares in the model's{" "}
                  <code>_onSchema</code>:
                </span>
              ),
              ko: (
                <span>
                  트래픽이 몰리는 필터가 생기면, 그 필터가 비교하는 field에 인덱스를 겁니다. 인덱스는 모델의{" "}
                  <code>_onSchema</code>에서 선언합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/task/task.document.ts"
          code={`import { by, from, into, type SchemaOf } from "akanjs/document";

export class TaskModel extends into(Task, TaskFilter, cnst.task, () => ({})) {
  static override _onSchema(schema: SchemaOf<TaskModel, Task>) {
    schema.index({ project: 1, status: 1 });
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The index is built on the expression the filter compiles to.</strong> On SQLite,{" "}
                    <code>{"schema.index({ project: 1 })"}</code> indexes{" "}
                    <code>{"json_extract(_doc, '$.project')"}</code>, which <code>{"{ project }"}</code> then uses;
                    Postgres indexes its own form of the same expression.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>인덱스는 필터가 쓰는 식 그대로 만들어집니다.</strong> SQLite에서{" "}
                    <code>{"schema.index({ project: 1 })"}</code>는 <code>{"json_extract(_doc, '$.project')"}</code>에
                    인덱스를 걸고, <code>{"{ project }"}</code> 조건이 그 인덱스를 씁니다. Postgres는 같은 식을 Postgres
                    문법으로 바꾼 형태에 인덱스를 겁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Sort keys are indexed for you.</strong> Each order in the filter's <code>sort</code> map
                    gets an index together with <code>removedAt</code>; the fields you filter on do not.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>정렬 키에는 인덱스가 자동으로 걸립니다.</strong> 필터의 <code>sort</code>에 선언한 정렬마다{" "}
                    <code>removedAt</code>과 함께 인덱스가 생기지만, 조건에 쓰는 field에는 생기지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/conventions/module/document#schema-hooks",
                title: l.trans({ en: "Indexes And Hooks", ko: "인덱스와 훅" }),
                desc: l.trans({
                  en: (
                    <span>
                      The full <code>_onSchema</code> API, including unique indexes.
                    </span>
                  ),
                  ko: (
                    <span>
                      unique 인덱스를 포함한 <code>_onSchema</code> 전체 API입니다.
                    </span>
                  ),
                }),
              },
              {
                href: "/cheatsheet/general/search",
                title: l.trans({ en: "Text Search", ko: "텍스트 검색" }),
                desc: l.trans({
                  en: (
                    <span>
                      <code>q.search</code> and the <code>text</code> field role.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>q.search</code>와 field의 <code>text</code> 역할입니다.
                    </span>
                  ),
                }),
              },
              {
                href: "/cheatsheet/performance/mutation",
                title: l.trans({ en: "Mutating", ko: "변경" }),
                desc: l.trans({
                  en: "Atomic updates written with the same query helpers.",
                  ko: "같은 쿼리 헬퍼로 쓰는 원자적 업데이트입니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
