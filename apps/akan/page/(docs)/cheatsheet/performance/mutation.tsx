import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const sqlOf = (update: string, sql: string) => `${update}\n// → ${sql}`;

  const pathCards = [
    {
      title: l.trans({ en: "Document Path", ko: "문서 경로" }),
      desc: l.trans({
        en: "Loads the document, changes it and saves it, so hooks run and a removal takes its cascade.",
        ko: "문서를 읽어 와 고친 뒤 저장합니다. 그래서 훅이 실행되고, 삭제라면 cascade도 함께 일어납니다.",
      }),
      code: "await this.updatePost(id, data);",
    },
    {
      title: l.trans({ en: "Query Write", ko: "쿼리 쓰기" }),
      desc: l.trans({
        en: "Sends one atomic SQL statement and loads nothing. Fast and safe under races, but no hook runs.",
        ko: "SQL 문 하나를 원자적으로 보내고 아무것도 읽지 않습니다. 빠르고 동시 요청에도 안전하지만 훅은 실행되지 않습니다.",
      }),
      code: "await this.Post.updateOne(filter, change);",
    },
  ];

  const hookTermRows = [
    {
      name: ["schema.pre", "schema.post"],
      desc: l.trans({
        en: "Schema hooks, registered in `_onSchema`. They run whenever a document is saved or removed.",
        ko: "스키마 훅입니다. `_onSchema`에 등록하고, 문서를 저장하거나 삭제할 때마다 실행됩니다.",
      }),
    },
    {
      name: ["_preCreate", "_postCreate", "_preUpdate", "_postUpdate", "_preRemove", "_postRemove"],
      desc: l.trans({
        en: "Service hooks. Only the service's `create<Model>`, `update<Model>` and `remove<Model>` run them.",
        ko: "서비스 훅입니다. service에 override하며, 생성된 `create<Model>`, `update<Model>`, `remove<Model>`을 거칠 때만 실행됩니다.",
      }),
    },
    {
      name: "cascade",
      desc: l.trans({
        en: "A removal declared on a field: documents linked to the removed one go with it.",
        ko: "field에 선언하는 연쇄 삭제입니다. 지운 문서에 딸린 문서가 함께 지워집니다.",
      }),
    },
  ];

  const hookColumns = [
    { key: "schema", label: l.trans({ en: "Schema hooks", ko: "스키마 훅" }) },
    { key: "service", label: l.trans({ en: "Service hooks", ko: "서비스 훅" }) },
    { key: "cascade", label: "cascade", code: true },
  ];

  const pathGroups = [
    {
      label: l.trans({ en: "Document path: load, change, save", ko: "문서 경로: 읽고, 고치고, 저장" }),
      rows: [
        {
          name: "update<Model>(id, data)",
          desc: l.trans({
            en: "Generated on the service. The default choice for one record.",
            ko: "service에 생성되는 메서드입니다. 레코드 하나를 고칠 때 기본으로 씁니다.",
          }),
          marks: { schema: true, service: true, cascade: false },
        },
        {
          name: "remove<Model>(id)",
          desc: l.trans({
            en: "Generated on the service. Soft-removes the document, then runs the cascade.",
            ko: "service에 생성되는 메서드입니다. 문서를 soft 삭제한 뒤 cascade를 실행합니다.",
          }),
          marks: { schema: true, service: true, cascade: true },
        },
        {
          name: "pickAndWrite(id, data)",
          desc: l.trans({
            en: "On the model: pick, set, save. `pickOneAndWrite(query, data)` picks by query.",
            ko: "model에서 문서를 집어 값을 넣고 저장합니다. `pickOneAndWrite(query, data)`는 쿼리로 집습니다.",
          }),
          marks: { schema: true, service: false, cascade: false },
        },
        {
          name: "doc.set(data).save()",
          desc: l.trans({
            en: "The same thing, spelled out, when you already hold the document.",
            ko: "이미 문서를 들고 있을 때 같은 일을 직접 쓰는 방식입니다.",
          }),
          marks: { schema: true, service: false, cascade: false },
        },
      ],
    },
    {
      label: l.trans({
        en: "Query write: one SQL statement, nothing loaded",
        ko: "쿼리 쓰기: SQL 문 하나, 아무것도 읽지 않음",
      }),
      rows: [
        {
          name: "updateOne · updateMany",
          desc: l.trans({
            en: "Change the newest match, or every match.",
            ko: "가장 최근에 만든 행 하나, 또는 맞는 행 전부를 고칩니다.",
          }),
          marks: { schema: false, service: false, cascade: false },
        },
        {
          name: "removeOne · removeMany",
          desc: l.trans({
            en: "Soft-remove the newest match, or every match.",
            ko: "가장 최근에 만든 행 하나, 또는 맞는 행 전부를 soft 삭제합니다.",
          }),
          marks: { schema: false, service: false, cascade: false },
        },
        {
          name: "updateById · removeById",
          desc: l.trans({
            en: "The same query writes, narrowed to one id.",
            ko: "같은 쿼리 쓰기를 id 하나로 좁힌 것입니다.",
          }),
          marks: { schema: false, service: false, cascade: false },
        },
        {
          name: "update<Filter>(…).set(…)",
          desc: l.trans({
            en: "Generated per filter, like `remove<Filter>`, `updateOne<Filter>` and `removeOne<Filter>`.",
            ko: "필터마다 생성됩니다. `remove<Filter>`, `updateOne<Filter>`, `removeOne<Filter>`도 같습니다.",
          }),
          marks: { schema: false, service: false, cascade: false },
        },
        {
          name: "bulkWrite(operations)",
          desc: l.trans({
            en: "A list of `updateOne` operations, run one after another.",
            ko: "`updateOne` 작업 목록을 하나씩 차례로 실행합니다.",
          }),
          marks: { schema: false, service: false, cascade: false },
        },
      ],
    },
  ];

  const queryWriteNotes = [
    l.trans({
      en: (
        <>
          <strong>Nothing runs after it.</strong> No schema hook, no service hook (<code>_postRemove</code> included)
          and no <code>cascade</code>. A removed row's files, children and counters stay behind, and because removal is
          soft, nothing reports the loss.
        </>
      ),
      ko: (
        <>
          <strong>뒤따라 실행되는 것이 없습니다.</strong> 스키마 훅도, 서비스 훅(<code>_postRemove</code> 포함)도,{" "}
          <code>cascade</code>도 돌지 않습니다. 지운 행의 파일, 자식 문서, 카운터가 그대로 남고, 삭제가 soft라서 아무도
          그 손실을 알려 주지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>updateById</code> and <code>removeById</code> only look like the document call.
          </strong>{" "}
          They are the same query write narrowed to one id, and fire nothing.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>updateById</code>와 <code>removeById</code>는 문서 경로처럼 보일 뿐입니다.
          </strong>{" "}
          id 하나로 좁힌 같은 쿼리 쓰기라서 아무것도 실행하지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>updateOne</code> and <code>removeOne</code> always hit the newest match
          </strong>{" "}
          and return only counts. Use them for "there is at most one of these", never to take the next item off a queue.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>updateOne</code>과 <code>removeOne</code>은 항상 가장 최근에 만든 행을 건드리고
          </strong>{" "}
          개수만 돌려줍니다. "이런 행은 많아야 하나"일 때 쓰는 것이지, 큐에서 다음 항목을 꺼내는 용도가 아닙니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Live lists miss it too.</strong> A <code>.live()</code> slice is fed by the same hooks, so a query
          write never reaches it. The one exception is a row an upsert inserts.
        </>
      ),
      ko: (
        <>
          <strong>live 목록도 알지 못합니다.</strong> <code>.live()</code> slice는 같은 훅으로 변경을 받으므로 쿼리
          쓰기는 전달되지 않습니다. upsert가 새로 넣은 행만 예외입니다.
        </>
      ),
    }),
  ];

  const formRows = [
    {
      form: l.trans({ en: "Object", ko: "객체" }),
      when: l.trans({
        en: "You only assign values. A bare value means `set`.",
        ko: "값만 넣을 때 씁니다. 값을 그대로 쓰면 `set`과 같습니다.",
      }),
      example: `{ status: "published", pinned: true }`,
    },
    {
      form: l.trans({ en: "Builder", ko: "builder 함수" }),
      when: l.trans({
        en: "You need `inc`, `addToSet` or another operator.",
        ko: "`inc`, `addToSet` 같은 연산자가 필요할 때 씁니다.",
      }),
      example: "({ inc }) => ({ viewNum: inc(1) })",
    },
  ];

  const styleNotes = [
    l.trans({
      en: (
        <>
          <strong>The builder's argument holds every operator,</strong> the way <code>q</code> holds the conditions in a
          filter. Destructure only what you use; there is nothing to import.
        </>
      ),
      ko: (
        <>
          <strong>builder가 받는 인자에 연산자가 모두 들어 있습니다.</strong> 필터에서 <code>q</code>가 조건을 담는 것과
          같습니다. 쓰는 것만 꺼내면 되고, import할 것은 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Keys are field paths.</strong> <code>"profile.city"</code> writes inside an object field, and a key
          that names no declared field throws.
        </>
      ),
      ko: (
        <>
          <strong>key는 field 경로입니다.</strong> <code>"profile.city"</code>처럼 쓰면 객체 field 안쪽에 쓰고, 선언하지
          않은 field를 가리키면 에러가 납니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            The four base columns take only <code>set</code> and <code>unset</code>.
          </strong>{" "}
          <code>id</code>, <code>createdAt</code>, <code>updatedAt</code> and <code>removedAt</code> refuse{" "}
          <code>inc</code> and every other operator.
        </>
      ),
      ko: (
        <>
          <strong>
            기본 컬럼 네 개에는 <code>set</code>과 <code>unset</code>만 씁니다.
          </strong>{" "}
          <code>id</code>, <code>createdAt</code>, <code>updatedAt</code>, <code>removedAt</code>은 <code>inc</code>를
          비롯한 다른 연산자를 거절합니다.
        </>
      ),
    }),
  ];

  const counterNotes = [
    l.trans({
      en: (
        <>
          <strong>
            Numbers: <code>inc</code>, <code>mul</code>, <code>min</code>, <code>max</code>.
          </strong>{" "}
          A missing field counts as 0 for <code>inc</code> and <code>mul</code>; <code>min</code> and <code>max</code>{" "}
          just write the value. <code>inc()</code> alone adds 1.
        </>
      ),
      ko: (
        <>
          <strong>
            숫자: <code>inc</code>, <code>mul</code>, <code>min</code>, <code>max</code>.
          </strong>{" "}
          field가 없으면 <code>inc</code>와 <code>mul</code>은 0에서 시작하고, <code>min</code>과 <code>max</code>는
          값을 그대로 씁니다. 인자 없는 <code>inc()</code>는 1을 더합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Arrays: <code>push</code>, <code>addToSet</code>, <code>pull</code>.
          </strong>{" "}
          A missing array starts empty. <code>push</code> always appends, <code>addToSet</code> appends only when the
          value is absent, and <code>pull</code> removes every equal element.
        </>
      ),
      ko: (
        <>
          <strong>
            배열: <code>push</code>, <code>addToSet</code>, <code>pull</code>.
          </strong>{" "}
          배열이 없으면 빈 배열에서 시작합니다. <code>push</code>는 항상 붙이고, <code>addToSet</code>은 없을 때만
          붙이며, <code>pull</code>은 같은 요소를 모두 뺍니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>updateMany</code> reports how many rows it touched
          </strong>{" "}
          in <code>modifiedCount</code>, all in one statement.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>updateMany</code>는 건드린 행 수를
          </strong>{" "}
          <code>modifiedCount</code>로 돌려줍니다. SQL 문 하나로 모두 처리됩니다.
        </>
      ),
    }),
  ];

  const upsertRows = [
    {
      part: `{ key: "daily-visits" }`,
      result: l.trans({
        en: "Plain values in the filter are copied in. Conditions such as `q.oneOf()` are not.",
        ko: "필터에 값으로 쓴 조건은 새 행에 그대로 들어갑니다. `q.oneOf()` 같은 조건은 빠집니다.",
      }),
    },
    {
      part: "total: inc(1)",
      result: l.trans({
        en: "Operators apply to an empty value, so `total` starts at 1.",
        ko: "연산자는 빈 값에 적용되므로 `total`은 1에서 시작합니다.",
      }),
    },
    {
      part: `status: setOnInsert("active")`,
      result: l.trans({
        en: "Written on this insert only. An update that finds a match ignores it.",
        ko: "이 삽입 때만 쓰입니다. 맞는 행을 찾아 고칠 때는 무시됩니다.",
      }),
    },
    {
      part: l.trans({ en: "result", ko: "반환값" }),
      result: l.trans({
        en: "`upsertedId` holds the new id, and `matchedCount` is 0.",
        ko: "`upsertedId`에 새 id가 담기고 `matchedCount`는 0입니다.",
      }),
    },
  ];

  const upsertNotes = [
    l.trans({
      en: (
        <>
          <strong>
            Only <code>updateOne</code>, <code>updateById</code> and <code>bulkWrite</code> upsert.
          </strong>{" "}
          <code>updateMany</code> takes no options.
        </>
      ),
      ko: (
        <>
          <strong>
            upsert는 <code>updateOne</code>, <code>updateById</code>, <code>bulkWrite</code>에서만 됩니다.
          </strong>{" "}
          <code>updateMany</code>는 옵션을 받지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            The insert runs the <code>{'"create"'}</code> schema hooks only.
          </strong>{" "}
          The <code>{'"save"'}</code> hooks and service hooks such as <code>_postCreate</code> do not run.
        </>
      ),
      ko: (
        <>
          <strong>
            삽입할 때는 <code>{'"create"'}</code> 스키마 훅만 실행됩니다.
          </strong>{" "}
          <code>{'"save"'}</code> 훅과 <code>_postCreate</code> 같은 서비스 훅은 실행되지 않습니다.
        </>
      ),
    }),
  ];

  const operatorRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "plain value", ko: "값 그대로" })}</span>,
      desc: l.trans({
        en: "Sets the field. The short form of `set`.",
        ko: "field에 값을 넣습니다. `set`의 줄임입니다.",
      }),
      example: sqlOf(`{ status: "done" }`, `json_set(_doc, '$.status', json(?))`),
    },
    {
      name: "set(value)",
      desc: l.trans({ en: "Sets the field.", ko: "field에 값을 넣습니다." }),
      example: sqlOf(`({ set }) => ({ status: set("done") })`, `json_set(_doc, '$.status', json(?))`),
    },
    {
      name: "unset()",
      desc: l.trans({ en: "Removes the field.", ko: "field를 지웁니다." }),
      example: sqlOf(`({ unset }) => ({ draft: unset() })`, `json_remove(_doc, '$.draft')`),
    },
    {
      name: "inc(by = 1)",
      desc: l.trans({
        en: "Adds `by`. A missing field counts as 0.",
        ko: "`by`만큼 더합니다. field가 없으면 0에서 시작합니다.",
      }),
      example: sqlOf(
        `({ inc }) => ({ viewNum: inc(1) })`,
        `json_set(_doc, '$.viewNum', COALESCE(json_extract(_doc, '$.viewNum'), 0) + ?)`,
      ),
    },
    {
      name: "mul(by)",
      desc: l.trans({
        en: "Multiplies by `by`. A missing field counts as 0.",
        ko: "`by`를 곱합니다. field가 없으면 0으로 봅니다.",
      }),
      example: sqlOf(
        `({ mul }) => ({ price: mul(1.1) })`,
        `json_set(_doc, '$.price', COALESCE(json_extract(_doc, '$.price'), 0) * ?)`,
      ),
    },
    {
      name: "min(value)",
      desc: l.trans({
        en: "Keeps the smaller of the stored value and `value`.",
        ko: "저장된 값과 `value` 중 작은 쪽을 남깁니다.",
      }),
      example: sqlOf(
        `({ min }) => ({ lowest: min(10) })`,
        `json_set(_doc, '$.lowest', MIN(COALESCE(json_extract(_doc, '$.lowest'), ?), ?))`,
      ),
    },
    {
      name: "max(value)",
      desc: l.trans({
        en: "Keeps the larger of the stored value and `value`.",
        ko: "저장된 값과 `value` 중 큰 쪽을 남깁니다.",
      }),
      example: sqlOf(
        `({ max }) => ({ highest: max(90) })`,
        `json_set(_doc, '$.highest', MAX(COALESCE(json_extract(_doc, '$.highest'), ?), ?))`,
      ),
    },
    {
      name: "push(value)",
      desc: l.trans({
        en: "Appends to the array. A missing array starts empty.",
        ko: "배열 끝에 붙입니다. 배열이 없으면 빈 배열에서 시작합니다.",
      }),
      example: sqlOf(
        `({ push }) => ({ logs: push(entry) })`,
        `json_set(_doc, '$.logs', json_insert(COALESCE(json_extract(_doc, '$.logs'), json('[]')), '$[#]', json(?)))`,
      ),
    },
    {
      name: "addToSet(value)",
      desc: l.trans({
        en: "Appends only when no equal element is there yet.",
        ko: "같은 요소가 아직 없을 때만 붙입니다.",
      }),
      example: sqlOf(
        `({ addToSet }) => ({ tags: addToSet("urgent") })`,
        `json_set(_doc, '$.tags', CASE WHEN EXISTS (SELECT 1 FROM json_each(...) WHERE value = ?) THEN ... ELSE json_insert(..., '$[#]', json(?)) END)`,
      ),
    },
    {
      name: "pull(value)",
      desc: l.trans({ en: "Removes every element equal to `value`.", ko: "`value`와 같은 요소를 모두 뺍니다." }),
      example: sqlOf(
        `({ pull }) => ({ tags: pull("urgent") })`,
        `json_set(_doc, '$.tags', (SELECT json_group_array(value) FROM json_each(...) WHERE value <> ?))`,
      ),
    },
    {
      name: "setOnInsert(value)",
      desc: l.trans({
        en: "Sets the field only when an upsert inserts a new row.",
        ko: "upsert가 새 행을 넣을 때만 field에 값을 넣습니다.",
      }),
      example: sqlOf(
        `({ setOnInsert }) => ({ status: setOnInsert("new") })`,
        l.trans({ en: "no SQL; applied only to the upsert insert", ko: "SQL 없음. upsert가 새 행을 넣을 때만 적용" }),
      ),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "nested path", ko: "중첩 경로" })}</span>,
      desc: l.trans({
        en: "A dotted key writes inside an object field.",
        ko: "점으로 이은 key는 객체 field 안쪽에 씁니다.",
      }),
      example: sqlOf(`({ set }) => ({ "profile.city": set("Seoul") })`, `json_set(_doc, '$.profile.city', json(?))`),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "combined", ko: "여러 연산 함께" })}</span>,
      desc: l.trans({
        en: "Several operators nest into one expression.",
        ko: "연산자 여러 개가 표현식 하나로 겹쳐집니다.",
      }),
      example: sqlOf(
        `({ inc, addToSet }) => ({ viewNum: inc(1), tags: addToSet("hot") })`,
        `json_set(json_set(_doc, '$.viewNum', ... + ?), '$.tags', ...)`,
      ),
    },
  ];

  const sqlNotes = [
    l.trans({
      en: (
        <>
          <strong>Simplified, in the SQLite dialect.</strong> Postgres uses the matching <code>jsonb</code> functions.
        </>
      ),
      ko: (
        <>
          <strong>개념만 보이도록 줄인 SQLite 기준 SQL입니다.</strong> Postgres는 같은 일을 하는 <code>jsonb</code>{" "}
          함수를 씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Every operator reads the document as it was before the update,</strong> so all changes in one call see
          the same original values.
        </>
      ),
      ko: (
        <>
          <strong>모든 연산자는 변경 전 문서를 읽습니다.</strong> 그래서 한 호출 안의 변경은 모두 같은 원래 값을 봅니다.
        </>
      ),
    }),
  ];

  const tipNotes = [
    l.trans({
      en: (
        <>
          <strong>Query writes for counters and bulk state changes,</strong> on a model with no removal side effect.
          Take a document path whenever hooks, a cascade or domain logic must run.
        </>
      ),
      ko: (
        <>
          <strong>카운터와 대량 상태 변경에는 쿼리 쓰기를 씁니다.</strong> 단, 삭제 부수효과가 없는 model에서만입니다.
          훅, cascade, 도메인 로직이 돌아야 한다면 문서 경로를 쓰세요.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Put atomic writes on the model class</strong> in <code>{"<model>.document.ts"}</code>, and return{" "}
          <code>!!modifiedCount</code> so the service gets a plain yes or no.
        </>
      ),
      ko: (
        <>
          <strong>원자적 쓰기는 model 클래스에 둡니다.</strong> <code>{"<model>.document.ts"}</code>에 쓰고{" "}
          <code>!!modifiedCount</code>를 돌려주면 service는 성공 여부만 받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Use the builder form</strong> instead of importing update helpers at module scope.
        </>
      ),
      ko: (
        <>
          <strong>builder 형태를 쓰세요.</strong> update 헬퍼를 module scope에서 import하지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>q.search()</code> cannot filter a write.
          </strong>{" "}
          A query write whose filter searches throws; find the ids first, then write by id.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>q.search()</code>는 쓰기의 필터에 쓸 수 없습니다.
          </strong>{" "}
          검색이 들어간 필터로 쓰면 에러가 나므로, id를 먼저 찾은 뒤 id로 씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>bulkWrite</code> runs its operations one by one,
          </strong>{" "}
          each as its own statement, and adds up the counts.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>bulkWrite</code>는 작업을 하나씩 실행합니다.
          </strong>{" "}
          작업마다 SQL 문이 따로 실행되고, 결과의 개수는 합산됩니다.
        </>
      ),
    }),
  ];

  const resultRows = [
    {
      key: "acknowledged",
      type: "boolean",
      desc: l.trans({ en: "`true` once the statement ran.", ko: "SQL 문이 실행되면 `true`입니다." }),
    },
    {
      key: "matchedCount",
      type: "number",
      desc: l.trans({
        en: "Rows the filter matched. 0 when an upsert inserted instead.",
        ko: "필터에 맞은 행 수입니다. upsert로 새로 넣었다면 0입니다.",
      }),
    },
    {
      key: "modifiedCount",
      type: "number",
      desc: l.trans({
        en: "Rows the write changed, counting an upsert's insert.",
        ko: "쓰기가 바꾼 행 수입니다. upsert로 넣은 행도 셉니다.",
      }),
    },
    {
      key: "upsertedId",
      type: "string | null",
      tags: ["optional"],
      desc: l.trans({
        en: "The new row's id when an upsert inserted; otherwise `null` or absent.",
        ko: "upsert로 새 행을 넣었을 때의 id입니다. 아니면 `null`이거나 없습니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Mutating Data", ko: "데이터 변경" })}>
        <Docs.Title>{l.trans({ en: "Mutating Data", ko: "데이터 변경" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "You need to bump a view counter, archive a batch of rows, or edit the one record a user opened. There are two ways to write, and the choice decides whether your hooks run.",
              ko: "조회수를 하나 올리거나, 여러 행을 한꺼번에 보관 처리하거나, 사용자가 연 레코드 하나를 고쳐야 할 때가 있습니다. 쓰는 길은 두 가지이고, 어느 쪽을 고르느냐에 따라 훅이 실행되는지가 갈립니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {pathCards.map(({ title, desc, code }) => (
              <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="mb-1 font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
                <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs">
                  {code}
                </code>
              </div>
            ))}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Which one runs what", ko: "무엇이 실행되는가" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "If a hook or a cascade must run for each document, take a document path. The table uses three words:",
              ko: "문서마다 훅이나 cascade가 돌아야 한다면 문서 경로를 씁니다. 아래 표에는 세 가지 말이 나옵니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={hookTermRows} />
          <Docs.Matrix
            type={l.trans({ en: "Method", ko: "메서드" })}
            columns={hookColumns}
            groups={pathGroups}
            markLabel={l.trans({ en: "Runs", ko: "실행됨" })}
            emptyLabel={l.trans({ en: "Does not run", ko: "실행되지 않음" })}
          />
          <Docs.Alert type="warning">
            <div className="font-bold">
              {l.trans({
                en: "A query write fires no hooks, and therefore no cascade.",
                ko: "쿼리 쓰기는 훅을 실행하지 않고, 따라서 cascade도 일어나지 않습니다.",
              })}
            </div>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {queryWriteNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="styles" title={l.trans({ en: "Two Write Styles", ko: "두 가지 작성법" })}>
        <Docs.Title>{l.trans({ en: "Two Write Styles", ko: "두 가지 작성법" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every query write takes a filter first, then the change. Write the change as a plain object or as a builder function:",
              ko: "쿼리 쓰기는 모두 필터를 먼저 받고, 그다음에 바꿀 내용을 받습니다. 바꿀 내용은 객체나 builder 함수로 씁니다:",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "form", label: l.trans({ en: "Form", ko: "형태" }) },
              { key: "when", label: l.trans({ en: "When", ko: "언제" }) },
              { key: "example", label: l.trans({ en: "Example", ko: "예" }), code: true },
            ]}
            rows={formRows}
          />
          <div>
            {l.trans({
              en: "In a model class, the two look like this:",
              ko: "model 클래스 안에서는 이렇게 씁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/post/post.document.ts"
          code={`export class PostModel extends into(Post, PostFilter, cnst.post, () => ({})) {
  async publish(postId: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      { status: "published", pinned: true },
    );
    return !!modifiedCount;
  }
  async markHot(postId: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      ({ inc, addToSet }) => ({ viewNum: inc(1), tags: addToSet("hot") }),
    );
    return !!modifiedCount;
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {styleNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>The builder runs synchronously.</strong> Compute awaited values, such as a password hash,
                  before the call and reference them inside the builder.
                </span>
              ),
              ko: (
                <span>
                  <strong>builder는 동기로 실행됩니다.</strong> 비밀번호 해시처럼 await가 필요한 값은 호출 전에 계산해
                  두고, builder 안에서는 그 값을 참조만 합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="counters" title={l.trans({ en: "Counters And Sets", ko: "카운터와 집합" })}>
        <Docs.Title>{l.trans({ en: "Counters And Sets", ko: "카운터와 집합" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Numeric and array operators run inside the database. Two requests that bump the same counter at once both count, and neither overwrites the other:",
              ko: "숫자와 배열 연산자는 데이터베이스 안에서 실행됩니다. 같은 카운터를 동시에 올리는 두 요청도 둘 다 반영되고, 서로의 변경을 덮어쓰지 않습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/post/post.document.ts"
          code={`export class PostModel extends into(Post, PostFilter, cnst.post, () => ({})) {
  async addViewToPublished() {
    const { modifiedCount } = await this.Post.updateMany(
      { status: "published" },
      ({ inc }) => ({ viewNum: inc(1) }),
    );
    return modifiedCount;
  }
  async addTag(postId: string, tag: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      ({ addToSet }) => ({ tags: addToSet(tag) }),
    );
    return !!modifiedCount;
  }
  async subTag(postId: string, tag: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      ({ pull }) => ({ tags: pull(tag) }),
    );
    return !!modifiedCount;
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {counterNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Keep sets to plain values.</strong> <code>addToSet</code> and <code>pull</code> compare
                  elements by value: reliable for ids, strings and numbers, not for objects.
                </span>
              ),
              ko: (
                <span>
                  <strong>집합에는 단순 값만 담으세요.</strong> <code>addToSet</code>과 <code>pull</code>은 요소를
                  값으로 비교하므로 id, 문자열, 숫자에서는 믿을 수 있지만 객체에서는 그렇지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="upsert" title={l.trans({ en: "Upsert", ko: "Upsert" })}>
        <Docs.Title>{l.trans({ en: "Upsert", ko: "Upsert" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An upsert changes the match, or inserts a new row when nothing matches. Pass{" "}
                  <code>{"{ upsert: true }"}</code> as the third argument:
                </span>
              ),
              ko: (
                <span>
                  upsert는 맞는 행을 고치고, 맞는 행이 없으면 새 행을 넣습니다. 세 번째 인자로{" "}
                  <code>{"{ upsert: true }"}</code>를 넘깁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/stat/stat.document.ts"
          code={`export class StatModel extends into(Stat, StatFilter, cnst.stat, () => ({})) {
  async addDailyVisit() {
    const { modifiedCount } = await this.Stat.updateOne(
      { key: "daily-visits" },
      ({ inc, setOnInsert }) => ({
        total: inc(1),
        status: setOnInsert("active"),
      }),
      { upsert: true },
    );
    return !!modifiedCount;
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "When nothing matches, each part of the call ends up here:",
              ko: "맞는 행이 없으면 호출의 각 부분은 이렇게 쓰입니다:",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "part", label: l.trans({ en: "Part of the call", ko: "호출의 부분" }), code: true },
              { key: "result", label: l.trans({ en: "In the new row", ko: "새 행에서는" }) },
            ]}
            rows={upsertRows}
          />
          <ul className={bulletList}>
            {upsertNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
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
                  Every operator folds into one nested JSON expression on the <code>_doc</code> column, and{" "}
                  <code>updatedAt</code> is stamped on every write. The database applies the whole update as one
                  statement.
                </span>
              ),
              ko: (
                <span>
                  모든 연산자는 <code>_doc</code> 컬럼 위의 JSON 표현식 하나로 겹쳐지고, 쓸 때마다{" "}
                  <code>updatedAt</code>이 갱신됩니다. 데이터베이스는 이 변경 전체를 SQL 문 하나로 적용합니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Operator", ko: "연산자" })}
            descLabel={l.trans({ en: "What it does · SQL", ko: "하는 일 · SQL" })}
            items={operatorRows}
          />
          <ul className={bulletList}>
            {sqlNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips And Pitfalls", ko: "팁과 주의할 점" })}>
        <Docs.Title>{l.trans({ en: "Tips And Pitfalls", ko: "팁과 주의할 점" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            {tipNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "What a write returns", ko: "쓰기가 돌려주는 값" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Every query write resolves to the same result. Check <code>modifiedCount</code> when the write must
                  have hit a row:
                </span>
              ),
              ko: (
                <span>
                  쿼리 쓰기는 모두 같은 모양의 결과를 돌려줍니다. 쓰기가 반드시 어떤 행에 닿아야 한다면{" "}
                  <code>modifiedCount</code>를 확인하세요:
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={resultRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 읽기" })}</Docs.SubSubTitle>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/performance/query",
                title: l.trans({ en: "Querying", ko: "쿼리" }),
                desc: l.trans({
                  en: (
                    <span>
                      The filters and <code>q</code> conditions a write matches with.
                    </span>
                  ),
                  ko: (
                    <span>
                      쓰기가 행을 고를 때 쓰는 필터와 <code>q</code> 조건입니다.
                    </span>
                  ),
                }),
              },
              {
                href: "/conventions/module/document#schema-hooks",
                title: l.trans({ en: "Schema Hooks", ko: "스키마 훅" }),
                desc: l.trans({
                  en: (
                    <span>
                      <code>schema.pre</code> and <code>schema.post</code> in <code>_onSchema</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>_onSchema</code> 안의 <code>schema.pre</code>와 <code>schema.post</code>입니다.
                    </span>
                  ),
                }),
              },
              {
                href: "/conventions/module/service#lifecycle-hooks",
                title: l.trans({ en: "Service Hooks", ko: "서비스 훅" }),
                desc: l.trans({
                  en: (
                    <span>
                      <code>_preUpdate</code>, <code>_postRemove</code> and the rest.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>_preUpdate</code>, <code>_postRemove</code> 등입니다.
                    </span>
                  ),
                }),
              },
              {
                href: "/conventions/module/constant#cascade-fields",
                title: l.trans({ en: "Cascade Remove", ko: "cascade 삭제" }),
                desc: l.trans({
                  en: (
                    <span>
                      What <code>{"remove<Model>"}</code> takes along with it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>{"remove<Model>"}</code>이 함께 지우는 것입니다.
                    </span>
                  ),
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
