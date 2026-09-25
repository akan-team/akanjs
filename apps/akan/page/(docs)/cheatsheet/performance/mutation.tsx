import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const sqlExamples = [
    {
      helper: "plain value (set)",
      update: `{ status: "done" }`,
      sql: `json_set(_doc, '$.status', json(?))`,
    },
    {
      helper: "u.set",
      update: `({ set }) => ({ status: set("done") })`,
      sql: `json_set(_doc, '$.status', json(?))`,
    },
    {
      helper: "u.unset",
      update: `({ unset }) => ({ draft: unset() })`,
      sql: `json_remove(_doc, '$.draft')`,
    },
    {
      helper: "u.inc",
      update: `({ inc }) => ({ views: inc(1) })`,
      sql: `json_set(_doc, '$.views', COALESCE(json_extract(_doc, '$.views'), 0) + ?)`,
    },
    {
      helper: "u.mul",
      update: `({ mul }) => ({ price: mul(1.1) })`,
      sql: `json_set(_doc, '$.price', COALESCE(json_extract(_doc, '$.price'), 0) * ?)`,
    },
    {
      helper: "u.min",
      update: `({ min }) => ({ lowest: min(10) })`,
      sql: `json_set(_doc, '$.lowest', MIN(COALESCE(json_extract(_doc, '$.lowest'), ?), ?))`,
    },
    {
      helper: "u.max",
      update: `({ max }) => ({ highest: max(90) })`,
      sql: `json_set(_doc, '$.highest', MAX(COALESCE(json_extract(_doc, '$.highest'), ?), ?))`,
    },
    {
      helper: "u.push",
      update: `({ push }) => ({ logs: push(entry) })`,
      sql: `json_set(_doc, '$.logs', json_insert(COALESCE(json_extract(_doc, '$.logs'), json('[]')), '$[#]', json(?)))`,
    },
    {
      helper: "u.addToSet",
      update: `({ addToSet }) => ({ tags: addToSet("urgent") })`,
      sql: `json_set(_doc, '$.tags', CASE WHEN EXISTS (SELECT 1 FROM json_each(...) WHERE value = ?) THEN ... ELSE json_insert(..., '$[#]', json(?)) END)`,
    },
    {
      helper: "u.pull",
      update: `({ pull }) => ({ tags: pull("urgent") })`,
      sql: `json_set(_doc, '$.tags', (SELECT json_group_array(value) FROM json_each(...) WHERE value <> ?))`,
    },
    {
      helper: "u.setOnInsert",
      update: `({ setOnInsert }) => ({ status: setOnInsert("new") })`,
      sql: `applied only when upsert inserts a new row`,
    },
    {
      helper: "nested path",
      update: `({ set }) => ({ "profile.city": set("Seoul") })`,
      sql: `json_set(_doc, '$.profile.city', json(?))`,
    },
    {
      helper: "combined",
      update: `({ inc, addToSet }) => ({ views: inc(1), tags: addToSet("hot") })`,
      sql: `json_set(json_set(_doc, '$.views', ... + ?), '$.tags', ...)`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Mutating", ko: "변경" })}>
        <Docs.Title>{l.trans({ en: "Mutating", ko: "변경" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan has two ways to change stored data. Use document methods when you edit one loaded document, and use query updates when you change matching rows directly in the database.",
              ko: "Akan에는 저장된 데이터를 바꾸는 두 가지 방법이 있습니다. 하나의 로드된 document를 수정할 때는 document method를, 조건에 맞는 행을 데이터베이스에서 직접 바꿀 때는 query update를 사용합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Document methods (`.set().save()`, `Model.update`, `Model.remove`) load a document, run save/update/remove hooks, then persist it.",
                ko: "Document method(`.set().save()`, `Model.update`, `Model.remove`)는 document를 로드해 save/update/remove hook을 실행한 뒤 저장합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Query updates (`updateOne`, `updateMany`, `deleteMany`, `bulkWrite`) compile to a single atomic SQL statement and do not load documents.",
                ko: "Query update(`updateOne`, `updateMany`, `deleteMany`, `bulkWrite`)는 하나의 원자적 SQL 문으로 컴파일되며 document를 로드하지 않습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the `u` update helper for operators, the same way `q` is used for query conditions.",
                ko: "query 조건에 `q`를 쓰듯, 변경 연산에는 `u` update helper를 사용합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="styles" title={l.trans({ en: "Two Write Styles", ko: "두 가지 작성법" })}>
        <Docs.Title>{l.trans({ en: "Two Write Styles", ko: "두 가지 작성법" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Pass a plain object for simple value assignments, or a builder function to reach the operator helpers scoped to that call. A bare value is shorthand for `set`.",
              ko: "단순 값 대입은 plain object로, operator가 필요하면 helper가 콜사이트 스코프로 주입되는 builder 함수로 넘깁니다. 값을 그대로 쓰면 `set`의 축약입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Object form (bare value = set)", ko: "Object 형태 (값 = set)" })}
          code={`await this.Post.updateOne({ id }, { status: "published", pinned: true });`}
        />
        <Code.Snippet
          title={l.trans({ en: "Builder form (operators)", ko: "Builder 형태 (operator)" })}
          code={`await this.Post.updateOne({ id }, ({ inc, addToSet }) => ({
  views: inc(1),
  tags: addToSet("hot"),
}));`}
        />
        <Docs.Alert type="info">
          <div>
            {l.trans({
              en: "The builder runs synchronously. Compute awaited values (like a password hash) before the call and reference them inside the builder.",
              ko: "builder는 동기로 실행됩니다. await가 필요한 값(예: 비밀번호 해시)은 호출 전에 계산해 builder 안에서 참조하세요.",
            })}
          </div>
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="counters" title={l.trans({ en: "Counters And Sets", ko: "카운터와 집합" })}>
        <Docs.Title>{l.trans({ en: "Counters And Sets", ko: "카운터와 집합" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Numeric operators (`inc`, `mul`, `min`, `max`) and array operators (`push`, `addToSet`, `pull`) run inside the database, so concurrent writers do not lose each other's changes.",
              ko: "숫자 operator(`inc`, `mul`, `min`, `max`)와 배열 operator(`push`, `addToSet`, `pull`)는 데이터베이스 안에서 실행되므로, 동시에 쓰는 요청끼리 서로의 변경을 잃지 않습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Atomic counters", ko: "원자적 카운터" })}
          code={`// bump a view counter for every matching row in one statement
await this.Post.updateMany({ status: "published" }, ({ inc }) => ({ viewCount: inc(1) }));

// keep a set of tags unique, or remove one
await this.Post.updateOne({ id }, ({ addToSet }) => ({ tags: addToSet("featured") }));
await this.Post.updateOne({ id }, ({ pull }) => ({ tags: pull("featured") }));`}
        />
        <Docs.Alert type="info">
          <div>
            {l.trans({
              en: "`addToSet` and `pull` match array elements by value and are reliable for scalar sets (ids, strings, numbers).",
              ko: "`addToSet`과 `pull`은 배열 요소를 값으로 매칭하며 스칼라 집합(id, 문자열, 숫자)에서 신뢰성 있게 동작합니다.",
            })}
          </div>
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="upsert" title={l.trans({ en: "Upsert", ko: "Upsert" })}>
        <Docs.Title>{l.trans({ en: "Upsert", ko: "Upsert" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "With `{ upsert: true }`, a missing match inserts a new row. Values from the filter seed the document, operators apply from empty defaults, and `setOnInsert` only applies on that insert.",
              ko: "`{ upsert: true }`를 주면 매칭이 없을 때 새 행을 삽입합니다. filter의 값이 document의 기본이 되고, operator는 빈 기본값에서 적용되며, `setOnInsert`는 이 삽입 때만 적용됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Insert or increment", ko: "삽입 또는 증가" })}
          code={`await this.Counter.updateOne(
  { key: "daily-visits" },
  ({ inc, setOnInsert }) => ({ total: inc(1), status: setOnInsert("active") }),
  { upsert: true },
);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="sql" title={l.trans({ en: "How It Becomes SQL", ko: "SQL로 바뀌는 방식" })}>
        <Docs.Title>{l.trans({ en: "How It Becomes SQL", ko: "SQL로 바뀌는 방식" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The adaptor folds every operator into one nested JSON expression on the `_doc` column and always stamps `updatedAt`. The whole update is a single statement the database applies atomically.",
              ko: "adaptor는 모든 operator를 `_doc` 컬럼 위의 하나의 중첩 JSON 표현식으로 접고 항상 `updatedAt`을 갱신합니다. 전체 update는 데이터베이스가 원자적으로 적용하는 단일 문입니다.",
            })}
          </div>
        </Docs.Description>
        <div className="overflow-x-auto">
          <table className="table w-full table-fixed">
            <thead>
              <tr>
                <th className="w-[160px]">{l.trans({ en: "Update helper", ko: "Update helper" })}</th>
                <th className="w-[320px]">{l.trans({ en: "Document update", ko: "Document update" })}</th>
                <th className="w-[440px]">{l.trans({ en: "SQL fragment", ko: "SQL 조각" })}</th>
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
                      <code>{example.update}</code>
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
              en: "These SQL snippets are simplified to show the idea, and reflect the SQLite/libsql dialect. Postgres uses the equivalent jsonb functions. Every operator reads the pre-update document, so all changes in one call see the same original values.",
              ko: "이 SQL 조각들은 개념을 보여주기 위해 단순화한 예시이며 SQLite/libsql dialect 기준입니다. Postgres는 동등한 jsonb 함수를 사용합니다. 모든 operator는 갱신 전 document를 읽으므로, 한 호출 안의 모든 변경은 같은 원본 값을 봅니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Alert type="warning">
          <div className="space-y-2">
            <div className="font-bold">
              {l.trans({
                en: "Query updates do not run document hooks.",
                ko: "Query update는 document hook을 실행하지 않습니다.",
              })}
            </div>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: "`updateOne`, `updateMany`, `deleteMany`, and `bulkWrite` write directly in the database and do not fire save/update/remove hooks.",
                  ko: "`updateOne`, `updateMany`, `deleteMany`, `bulkWrite`는 데이터베이스에 직접 쓰며 save/update/remove hook을 발화하지 않습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "When a per-document rule must always run, use a document path: `Model.update(id, patch)`, `Model.remove(id)`, or `doc.set(...).save()`.",
                  ko: "document마다 항상 실행되어야 하는 규칙이 있다면 document 경로를 사용하세요: `Model.update(id, patch)`, `Model.remove(id)`, 또는 `doc.set(...).save()`.",
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
                en: "Prefer query updates for counters and bulk state changes; prefer document methods when hooks or rich domain logic must run.",
                ko: "카운터나 대량 상태 변경에는 query update를, hook이나 풍부한 도메인 로직이 필요할 때는 document method를 선호하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the builder form instead of importing update helpers at module scope.",
                ko: "update helper를 module scope에서 import하지 말고 builder 형태를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Check `modifiedCount` from the result when a mutation must have matched a row.",
                ko: "변경이 반드시 어떤 행에 적용되어야 한다면 결과의 `modifiedCount`를 확인하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
