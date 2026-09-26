import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const termRows = [
    {
      name: "filter",
      desc: l.trans({
        en: "A named, reusable query such as `inProject`. Each one generates fourteen methods.",
        ko: "`inProject`처럼 이름 붙인 재사용 쿼리입니다. 하나마다 메서드 열네 개가 생깁니다.",
      }),
    },
    {
      name: "document",
      desc: l.trans({
        en: "One loaded record: a class instance with `set()`, `save()` and your own chain methods.",
        ko: "불러온 레코드 하나입니다. `set()`, `save()`와 직접 만든 체인 메서드를 가진 인스턴스입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "chain method", ko: "체인 메서드" })}</span>,
      desc: l.trans({
        en: "A document method that changes `this` and returns it, so calls chain before one `save()`.",
        ko: "`this`를 바꾸고 그대로 반환하는 document 메서드입니다. 이어 부른 뒤 `save()`는 한 번만 합니다.",
      }),
    },
    {
      name: "model",
      desc: l.trans({
        en: "The class for work on the whole collection. A service reaches it as `this.ticketModel`.",
        ko: "컬렉션 전체를 다루는 클래스입니다. service에서는 `this.ticketModel`로 접근합니다.",
      }),
    },
    {
      name: "this.Ticket",
      desc: l.trans({
        en: "The table facade inside the model class: `pickById`, `find`, `updateOne` and more.",
        ko: "model 클래스 안에서 쓰는 테이블 파사드입니다. `pickById`, `find`, `updateOne` 등을 제공합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "hook", ko: "훅" })}</span>,
      desc: l.trans({
        en: "A function that runs before or after a document is written.",
        ko: "document를 쓰기 전이나 쓴 뒤에 실행되는 함수입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "query-level write", ko: "쿼리 단위 쓰기" })}</span>,
      desc: l.trans({
        en: "One UPDATE over every match. Fast, but no hook runs.",
        ko: "매치된 전부에 UPDATE를 한 번 실행합니다. 빠르지만 훅은 실행되지 않습니다.",
      }),
    },
  ];

  const classRows = [
    {
      name: "TicketFilter",
      desc: l.trans({
        en: "Named queries and sort orders. Each query becomes fourteen methods on the model and the service.",
        ko: "이름 붙인 쿼리와 정렬 순서입니다. 쿼리 하나가 model과 service에 메서드 열네 개로 생깁니다.",
      }),
      example: "from(cnst.Ticket, (filter) => ({ query: {}, sort: {} }))",
    },
    {
      name: "Ticket",
      desc: l.trans({
        en: "One loaded record. Its chain methods change state and return the document itself.",
        ko: "불러온 레코드 하나입니다. 체인 메서드로 상태를 바꾸고 document 자신을 반환합니다.",
      }),
      example: "by(cnst.Ticket)",
    },
    {
      name: "TicketModel",
      desc: l.trans({
        en: "Work on the whole collection: atomic writes, loaders, indexes and hooks.",
        ko: "컬렉션 전체를 다룹니다. 원자적 쓰기, 로더, 인덱스, 훅이 여기 있습니다.",
      }),
      example: "into(Ticket, TicketFilter, cnst.ticket, () => ({}))",
    },
  ];

  const builderRows = [
    {
      name: "filter()",
      desc: l.trans({ en: "Starts one named query.", ko: "이름 붙인 쿼리 하나를 시작합니다." }),
    },
    {
      name: ".arg(name, Type)",
      desc: l.trans({
        en: "A required argument. Every required argument comes before the optional ones.",
        ko: "필수 인자입니다. 필수 인자는 모두 선택 인자보다 앞에 둡니다.",
      }),
    },
    {
      name: ".opt(name, Type)",
      desc: l.trans({
        en: "An optional argument. Omitted, it is `undefined` or `null`, so add its condition only when set.",
        ko: "선택 인자입니다. 생략하면 `undefined`나 `null`이 들어오므로, 값이 있을 때만 조건을 더합니다.",
      }),
    },
    {
      name: ".arg(name, ID, { ref })",
      desc: l.trans({
        en: 'Names the model an id points at, e.g. `{ ref: "user" }`, so the admin panel shows a picker.',
        ko: 'id가 가리키는 모델을 `{ ref: "user" }`처럼 알려 줍니다. 그러면 admin 패널이 선택기를 보여 줍니다.',
      }),
    },
    {
      name: ".query((...args, q) => …)",
      desc: l.trans({
        en: "Returns the condition. The `q` helpers arrive as the last parameter.",
        ko: "조건을 반환합니다. `q` 헬퍼는 마지막 매개변수로 들어옵니다.",
      }),
    },
    {
      name: "sort: { key: { field: -1 } }",
      desc: l.trans({
        en: 'A named order, picked by key as `{ sort: "highPriority" }`. `-1` is descending.',
        ko: '이름 붙인 정렬입니다. `{ sort: "highPriority" }`처럼 키로 고릅니다. `-1`은 내림차순입니다.',
      }),
    },
  ];

  const helperRows = [
    {
      name: ["q.all", "q.any", "q.not"],
      desc: l.trans({
        en: "AND, OR and NOT. `all` and `any` skip `false` and `null`; an `{}` inside `any` matches every row.",
        ko: "AND, OR, NOT으로 묶습니다. `all`과 `any`는 `false`와 `null`을 건너뛰고, `any` 안의 `{}`는 모든 행과 매치합니다.",
      }),
      example: "q.any({ owner: userId }, { assignee: userId })",
    },
    {
      name: ["q.eq", "q.ne"],
      desc: l.trans({
        en: "Equal or not equal. A bare value such as `{ status }` already means equal.",
        ko: "같음, 다름입니다. `{ status }`처럼 값만 써도 같음입니다.",
      }),
    },
    {
      name: ["q.oneOf", "q.notOneOf"],
      desc: l.trans({
        en: "In or not in a list. An empty `oneOf` matches nothing; an empty `notOneOf` matches everything.",
        ko: "목록 안에 있음, 없음입니다. 빈 `oneOf`는 아무것도, 빈 `notOneOf`는 모든 행과 매치합니다.",
      }),
      example: "{ status: q.oneOf(statuses) }",
    },
    {
      name: ["q.gt", "q.gte", "q.lt", "q.lte", "q.between"],
      desc: l.trans({ en: "Range comparisons for numbers and dates.", ko: "숫자와 날짜의 범위 비교입니다." }),
      example: "{ price: q.gte(minPrice) }",
    },
    {
      name: ["q.has"],
      desc: l.trans({
        en: "An array field contains this element. A bare value on an array field means the same.",
        ko: "배열 필드가 이 원소를 포함합니다. 배열 필드에 값만 써도 같은 뜻입니다.",
      }),
      example: "{ tags: q.has(tag) }",
    },
    {
      name: ["q.contains"],
      desc: l.trans({ en: "A text field contains this substring.", ko: "문자열 필드가 이 부분 문자열을 포함합니다." }),
      example: "{ title: q.contains(word) }",
    },
    {
      name: ["q.empty(path)"],
      desc: l.trans({
        en: 'The field has no value: absent or `null`. This is the one for "has no value".',
        ko: '필드에 값이 없습니다. 키가 없거나 `null`입니다. "값이 없음"은 이것으로 찾습니다.',
      }),
      example: 'q.empty("assignee")',
    },
    {
      name: ["q.exists(path)", "q.missing(path)"],
      desc: l.trans({
        en: "The key is stored, or absent. `missing` is for rows written before the field existed.",
        ko: "키가 저장되어 있음, 없음입니다. `missing`은 필드가 생기기 전에 쓴 행을 찾을 때 씁니다.",
      }),
    },
    {
      name: ["q.when"],
      desc: l.trans({
        en: "Returns the query when the condition is truthy, `{}` otherwise.",
        ko: "조건이 참이면 쿼리를, 아니면 `{}`를 반환합니다.",
      }),
      example: 'q.when(onlyOpen, { status: "opened" })',
    },
    {
      name: ["q.search"],
      href: "#text-search-query",
      desc: l.trans({
        en: "Full-text match over fields with a `text` role. See Text Search Query below.",
        ko: "`text` 역할을 가진 필드에서 전문 검색을 합니다. 아래 텍스트 검색 쿼리 섹션을 보세요.",
      }),
    },
    {
      name: ["q.raw(sql, params)"],
      desc: l.trans({
        en: "A raw SQL fragment with bound parameters. It ties the query to one database dialect.",
        ko: "파라미터를 바인딩한 SQL 조각입니다. 쿼리가 특정 데이터베이스 방언에 묶입니다.",
      }),
    },
  ];

  const readMethods = [
    {
      key: "list<Filter>",
      type: "Promise<Doc[]>",
      desc: l.trans({
        en: "Every match. Options: `sort`, `skip`, `limit`, `select`.",
        ko: "매치된 전부입니다. 옵션: `sort`, `skip`, `limit`, `select`.",
      }),
    },
    {
      key: "listIds<Filter>",
      type: "Promise<string[]>",
      desc: l.trans({ en: "The same, ids only.", ko: "같은 결과를 id로만 읽습니다." }),
    },
    {
      key: "find<Filter>",
      type: "Promise<Doc | null>",
      desc: l.trans({ en: "One match or `null`.", ko: "매치 하나 또는 `null`입니다." }),
    },
    {
      key: "findId<Filter>",
      type: "Promise<string | null>",
      desc: l.trans({ en: "The same, id only.", ko: "같은 결과를 id로만 읽습니다." }),
    },
    {
      key: "pick<Filter>",
      type: "Promise<Doc>",
      desc: l.trans({ en: "One match; throws when there is none.", ko: "매치 하나입니다. 없으면 에러를 던집니다." }),
    },
    {
      key: "pickId<Filter>",
      type: "Promise<string>",
      desc: l.trans({ en: "The same, id only.", ko: "같은 결과를 id로만 읽습니다." }),
    },
    {
      key: "exists<Filter>",
      type: "Promise<string | null>",
      desc: l.trans({
        en: "The matching id or `null` — not a boolean.",
        ko: "매치된 id 또는 `null`입니다. boolean이 아닙니다.",
      }),
    },
    {
      key: "count<Filter>",
      type: "Promise<number>",
      desc: l.trans({ en: "How many match.", ko: "매치 개수입니다." }),
    },
    {
      key: "insight<Filter>",
      type: "Promise<Insight>",
      desc: l.trans({
        en: "Every counter the Insight class declares.",
        ko: "Insight 클래스가 선언한 카운터 전부입니다.",
      }),
    },
    {
      key: "query<Filter>",
      type: "QueryOf<Doc>",
      desc: l.trans({
        en: "Builds the query without running it, synchronously. A slice's `exec` returns this.",
        ko: "쿼리를 실행하지 않고 동기로 만들기만 합니다. slice의 `exec`가 이것을 반환합니다.",
      }),
    },
  ];

  const writeMethods = [
    {
      key: "remove<Filter>",
      type: "Promise<UpdateResult>",
      desc: l.trans({
        en: "One atomic UPDATE marking every match removed.",
        ko: "원자적 UPDATE 한 번으로 매치 전부를 삭제 표시합니다.",
      }),
    },
    {
      key: "removeOne<Filter>",
      type: "Promise<UpdateResult>",
      desc: l.trans({ en: "The same, on the newest match only.", ko: "같은 동작을 가장 최근 매치 하나에만 합니다." }),
    },
    {
      key: "update<Filter>",
      type: "UpdateChain<Doc>",
      desc: l.trans({
        en: "A chain; the patch goes on a terminal `.set(patch)`.",
        ko: "체인입니다. patch는 마지막 `.set(patch)`에 넘깁니다.",
      }),
    },
    {
      key: "updateOne<Filter>",
      type: "UpdateChain<Doc>",
      desc: l.trans({ en: "The same, on the newest match only.", ko: "같은 동작을 가장 최근 매치 하나에만 합니다." }),
    },
  ];

  const crudMethods = [
    {
      key: "get<Model>(id)",
      type: "Promise<Doc>",
      desc: l.trans({
        en: "Loads through the id loader and throws when the document does not exist.",
        ko: "id 로더로 불러오고, document가 없으면 에러를 던집니다.",
      }),
    },
    {
      key: "load<Model>(id?)",
      type: "Promise<Doc | null>",
      desc: l.trans({
        en: "The same, but resolves to `null` instead of throwing, also for an empty id.",
        ko: "같지만, 에러 대신 `null`을 반환합니다. id가 비어 있어도 `null`입니다.",
      }),
    },
    {
      key: "load<Model>Many(ids)",
      type: "Promise<Doc[]>",
      desc: l.trans({
        en: "Loads several ids in one batched query.",
        ko: "여러 id를 쿼리 한 번에 묶어 불러옵니다.",
      }),
    },
    {
      key: "create<Model>(data)",
      type: "Promise<Doc>",
      desc: l.trans({
        en: "Inserts one document. The `save` and `create` hooks run.",
        ko: "document 하나를 추가합니다. `save`, `create` 훅이 실행됩니다.",
      }),
    },
    {
      key: "update<Model>(id, data)",
      type: "Promise<Doc>",
      desc: l.trans({
        en: "Patches and saves one document. The `save` and `update` hooks run.",
        ko: "document 하나를 고쳐 저장합니다. `save`, `update` 훅이 실행됩니다.",
      }),
    },
    {
      key: "remove<Model>(id)",
      type: "Promise<Doc>",
      desc: l.trans({
        en: "Soft-deletes one document by stamping `removedAt`. The `remove` hooks run.",
        ko: "`removedAt`을 찍어 document 하나를 소프트 삭제합니다. `remove` 훅이 실행됩니다.",
      }),
    },
  ];

  const searchOptions = [
    {
      key: "prefix",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Treats the last word as a prefix, which a search-as-you-type box needs.",
        ko: "마지막 단어를 접두사로 취급합니다. 입력하면서 검색하는 입력창에 필요합니다.",
      }),
    },
    {
      key: "columns",
      type: '("title" | "desc" | "tag" | "filter")[]',
      desc: l.trans({
        en: 'Limits the match to some columns, e.g. `{ columns: ["title"] }`. Omitted, all four match.',
        ko: '일부 컬럼으로 검색 범위를 좁힙니다. 예: `{ columns: ["title"] }`. 생략하면 네 컬럼 모두 검색합니다.',
      }),
    },
    {
      key: "weights",
      type: "number[]",
      default: "[10, 1, 3, 0]",
      desc: l.trans({
        en: "Ranking weights in the order title, desc, tag, filter: four finite, non-negative numbers.",
        ko: "title, desc, tag, filter 순서의 순위 가중치입니다. 음수가 아닌 유한한 숫자 네 개를 넘깁니다.",
      }),
    },
  ];

  const facadeRows = [
    {
      name: ["pickById", "pickOne"],
      desc: l.trans({
        en: "One document, or throw. The second argument is a bare projection, e.g. `{ secret: true }`.",
        ko: "document 하나를 반환하고, 없으면 에러를 던집니다. 두 번째 인자는 `{ secret: true }` 같은 projection입니다.",
      }),
    },
    {
      name: ["findById", "findOne", "find"],
      desc: l.trans({
        en: "`null` or a list instead of throwing. `find` chains `.sort()`, `.skip()` and `.limit()`.",
        ko: "에러 대신 `null`이나 목록을 반환합니다. `find`에는 `.sort()`, `.skip()`, `.limit()`을 이어 붙입니다.",
      }),
    },
    {
      name: ["count", "exists"],
      desc: l.trans({
        en: "A number, or the matching id or `null`. `countDocuments` is the deprecated name.",
        ko: "개수, 또는 매치된 id나 `null`입니다. `countDocuments`는 이제 쓰지 않는 옛 이름입니다.",
      }),
    },
    {
      name: ["pickAndWrite", "pickOneAndWrite"],
      desc: l.trans({
        en: "Load, `set()` and `save()` in one call, so the save hooks run.",
        ko: "불러오고 `set()`하고 `save()`까지 한 번에 합니다. 그래서 save 훅이 실행됩니다.",
      }),
      example: 'await this.Story.pickAndWrite(storyId, { status: "approved" })',
    },
    {
      name: ["updateOne", "updateMany", "removeOne", "removeMany"],
      desc: l.trans({
        en: "Query-level writes: one statement, no hooks. `One` hits the newest match.",
        ko: "쿼리 단위 쓰기입니다. 문장 하나로 실행되고 훅은 없습니다. `One`은 가장 최근 매치를 건드립니다.",
      }),
    },
    {
      name: ["updateById", "removeById"],
      desc: l.trans({
        en: "The same hookless writes, narrowed to one id. Not the document path.",
        ko: "같은 훅 없는 쓰기를 id 하나로 좁힌 것입니다. document 경로가 아닙니다.",
      }),
    },
    {
      name: ["new this.Story(data)"],
      desc: l.trans({
        en: "Builds an unsaved document. Its `save()` inserts it and runs the `save` and `create` hooks.",
        ko: "저장되지 않은 document를 만듭니다. `save()`하면 추가되고 `save`, `create` 훅이 실행됩니다.",
      }),
      example: "return await new this.Story(data).save();",
    },
    {
      name: ["sample", "sampleOne"],
      desc: l.trans({ en: "Random documents that match the query.", ko: "쿼리에 맞는 document를 무작위로 고릅니다." }),
    },
    {
      name: ["bulkWrite"],
      desc: l.trans({
        en: "Several `updateOne` operations in one call, each optionally upserting.",
        ko: "`updateOne` 여러 개를 한 번에 실행합니다. 각각 upsert를 켤 수 있습니다.",
      }),
    },
  ];

  const loaderRows = [
    {
      name: 'byField("sku")',
      desc: l.trans({
        en: "One document per value of a field: the match for that key, or `null`.",
        ko: "필드 값 하나당 document 하나입니다. 그 키에 맞는 document나 `null`을 돌려줍니다.",
      }),
    },
    {
      name: 'byArrayField("tags")',
      desc: l.trans({
        en: "One document whose array field contains the key.",
        ko: "배열 필드에 그 키가 들어 있는 document 하나입니다.",
      }),
    },
    {
      name: 'byQuery(["shop", "orderNumber"] as const)',
      desc: l.trans({
        en: "One document per combination of several fields.",
        ko: "여러 필드 값의 조합 하나당 document 하나입니다.",
      }),
    },
  ];

  const indexOptions = [
    {
      key: "unique",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Refuses a second document with the same values in these fields.",
        ko: "이 필드들의 값이 같은 document를 두 번 넣지 못하게 합니다.",
      }),
    },
    {
      key: "name",
      type: "string",
      default: "<table>_<fields>_<position>",
      desc: l.trans({
        en: "Fixes the index name. The default depends on the index's position in `_onSchema`.",
        ko: "인덱스 이름을 고정합니다. 기본 이름은 `_onSchema` 안에서의 순서에 따라 달라집니다.",
      }),
    },
  ];

  const hookColumns = [
    { key: "create", label: "create", code: true, caption: "create<Model>" },
    { key: "update", label: "update", code: true, caption: "update<Model> · save()" },
    { key: "remove", label: "remove", code: true, caption: "remove<Model>" },
    { key: "bulk", label: l.trans({ en: "query-level", ko: "쿼리 단위" }), caption: "update<Filter>" },
  ];
  const hookGroups = [
    {
      label: '`schema.pre("…", fn)` · `schema.post("…", fn)`',
      rows: [
        {
          name: '"save"',
          desc: l.trans({
            en: "Every document write except a removal.",
            ko: "삭제를 뺀 모든 document 쓰기에서 실행됩니다.",
          }),
          marks: { create: true, update: true, remove: false, bulk: false },
        },
        {
          name: '"create"',
          desc: l.trans({ en: "Only when a document is inserted.", ko: "document를 새로 넣을 때만 실행됩니다." }),
          marks: { create: true, update: false, remove: false, bulk: false },
        },
        {
          name: '"update"',
          desc: l.trans({
            en: "When an existing document is saved.",
            ko: "이미 있는 document를 저장할 때 실행됩니다.",
          }),
          marks: { create: false, update: true, remove: false, bulk: false },
        },
        {
          name: '"remove"',
          desc: l.trans({
            en: "When `remove<Model>(id)` stamps `removedAt`.",
            ko: "`remove<Model>(id)`가 `removedAt`을 찍을 때 실행됩니다.",
          }),
          marks: { create: false, update: false, remove: true, bulk: false },
        },
      ],
    },
  ];

  const placeColumns = [
    { key: "filter", label: "Filter", caption: "from()" },
    { key: "document", label: "Document", caption: "by()" },
    { key: "model", label: "Model", caption: "into()" },
    { key: "service", label: "Service", caption: "serve()" },
  ];
  const inFilter = { filter: true, document: false, model: false, service: false };
  const inDocument = { filter: false, document: true, model: false, service: false };
  const inModel = { filter: false, document: false, model: true, service: false };
  const inService = { filter: false, document: false, model: false, service: true };
  const placeGroups = [
    {
      label: l.trans({ en: "Reading", ko: "조회" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "reusable condition", ko: "재사용 조건" })}</span>,
          desc: l.trans({
            en: "A list or lookup you would otherwise repeat in service methods.",
            ko: "그대로 두면 service 메서드마다 반복될 목록 조회나 단건 조회입니다.",
          }),
          marks: inFilter,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "sort order", ko: "정렬 순서" })}</span>,
          desc: l.trans({
            en: "A named order such as `highPriority`.",
            ko: "`highPriority` 같은 이름 붙인 정렬입니다.",
          }),
          marks: inFilter,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "frequent lookup", ko: "자주 하는 조회" })}</span>,
          desc: l.trans({
            en: "A loader for a key you look up often, or an index for a query you run often.",
            ko: "자주 찾는 키에는 로더를, 자주 실행하는 쿼리에는 인덱스를 둡니다.",
          }),
          marks: inModel,
        },
      ],
    },
    {
      label: l.trans({ en: "Writing", ko: "쓰기" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "state transition", ko: "상태 전이" })}</span>,
          desc: l.trans({
            en: "One record moves between states: `open()`, `approve()`.",
            ko: "레코드 하나의 상태가 바뀝니다. `open()`, `approve()` 같은 메서드입니다.",
          }),
          marks: inDocument,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "state precondition", ko: "상태 전제 조건" })}</span>,
          desc: l.trans({
            en: "The chain method throws `Err` when the record is in the wrong state.",
            ko: "레코드가 맞지 않는 상태면 체인 메서드가 `Err`를 던집니다.",
          }),
          marks: inDocument,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "counter · bulk write", ko: "카운터 · 일괄 쓰기" })}</span>,
          desc: l.trans({
            en: "One UPDATE through the facade, returning `!!modifiedCount`.",
            ko: "파사드로 UPDATE를 한 번 실행하고 `!!modifiedCount`를 반환합니다.",
          }),
          marks: inModel,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "derived field · index", ko: "파생 필드 · 인덱스" })}</span>,
          desc: l.trans({
            en: "Small persistence work in `_onSchema`.",
            ko: "`_onSchema`에서 하는 작은 저장 관련 작업입니다.",
          }),
          marks: inModel,
        },
      ],
    },
    {
      label: l.trans({ en: "Orchestrating", ko: "조율" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "cross-document rule", ko: "document 간 규칙" })}</span>,
          desc: l.trans({
            en: "Load every document involved, then throw `Err` or save.",
            ko: "관련된 document를 모두 불러온 뒤, `Err`를 던지거나 저장합니다.",
          }),
          marks: inService,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "side effect of a write", ko: "쓰기의 부수효과" })}</span>,
          desc: l.trans({
            en: "`_postCreate`, `_postRemove` and the other service hooks.",
            ko: "`_postCreate`, `_postRemove` 같은 service 훅에 둡니다.",
          }),
          marks: inService,
        },
      ],
    },
  ];

  const relatedLinks = [
    {
      href: "/conventions/module/constant",
      title: "model.constant.ts",
      desc: l.trans({
        en: "Field types, and the text roles that search reads.",
        ko: "필드 타입과, 검색이 읽는 text 역할을 다룹니다.",
      }),
    },
    {
      href: "/conventions/module/service",
      title: "model.service.ts",
      desc: l.trans({
        en: "Who calls these methods, and the service hooks around them.",
        ko: "이 메서드를 부르는 쪽과, 그 주변의 service 훅을 다룹니다.",
      }),
    },
    {
      href: "/conventions/scalar/document",
      title: "scalar.document.ts",
      desc: l.trans({
        en: "The document file of an embedded value object.",
        ko: "내장 값 객체(scalar)의 document 파일입니다.",
      }),
    },
    {
      href: "/cheatsheet/general/search",
      title: l.trans({ en: "Text Search", ko: "텍스트 검색" }),
      desc: l.trans({
        en: "Search from marking the fields to publishing a slice.",
        ko: "필드 표시부터 slice 공개까지, 검색을 처음부터 끝까지 만듭니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="document-overview" title="model.document.ts">
        <Docs.Title>model.document.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>model.document.ts</code> decides how a stored model is queried and changed.{" "}
                  <code>model.constant.ts</code> says what the data looks like; this file holds the reusable queries,
                  the state changes and the database helpers that services call.
                </span>
              ),
              ko: (
                <span>
                  <code>model.document.ts</code>는 저장된 모델을 어떻게 조회하고 바꿀지 정합니다. 데이터의 모양은{" "}
                  <code>model.constant.ts</code>가 정하고, 이 파일에는 service가 호출하는 재사용 쿼리, 상태 변경,
                  데이터베이스 헬퍼가 들어갑니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Open it when a service repeats the same query, when a record moves between states, or when a table needs a counter, a loader or an index.",
              ko: "service가 같은 쿼리를 반복할 때, 레코드의 상태가 바뀔 때, 테이블에 카운터나 로더, 인덱스가 필요할 때 이 파일을 엽니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="standard-document-shape"
        title={l.trans({ en: "Standard Document Shape", ko: "표준 document 구조" })}
      >
        <Docs.Title>{l.trans({ en: "Standard Document Shape", ko: "표준 document 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A database module's document file declares three classes, always in this order. A complete file with one query and one chain method looks like this:",
              ko: "데이터베이스 모듈의 document 파일은 클래스 세 개를 늘 이 순서로 선언합니다. 쿼리 하나와 체인 메서드 하나를 넣은 완성된 파일은 이렇습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.document.ts"
          code={`import { ID } from "akanjs/base";
import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    inProject: filter()
      .arg("project", ID)
      .query((project) => ({ project })),
  },
  sort: {},
})) {}

export class Ticket extends by(cnst.Ticket) {
  open() {
    this.status = "opened";
    return this;
  }
}

export class TicketModel extends into(
  Ticket,
  TicketFilter,
  cnst.ticket,
  () => ({}),
) {}`}
        />
        <Docs.Description>
          <Docs.IntroTable type={l.trans({ en: "Class", ko: "클래스" })} items={classRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The order is fixed.</strong> <code>TicketFilter</code> → <code>Ticket</code> →{" "}
                    <code>TicketModel</code>, and <code>{"sort: {}"}</code> is written even when it is empty.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>순서는 고정입니다.</strong> <code>TicketFilter</code> → <code>Ticket</code> →{" "}
                    <code>TicketModel</code> 순서이고, 비어 있어도 <code>{"sort: {}"}</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Names follow the constant.</strong> The three class names come from <code>cnst.Ticket</code>
                    ; <code>into()</code> takes the lowercase <code>cnst.ticket</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이름은 constant를 따릅니다.</strong> 세 클래스 이름은 <code>cnst.Ticket</code>에서 오고,{" "}
                    <code>into()</code>에는 소문자 <code>cnst.ticket</code>을 넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      The fourth argument of <code>into()</code> declares loaders.
                    </strong>{" "}
                    Write <code>{"() => ({})"}</code> when there are none.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>into()</code>의 네 번째 인자는 로더 선언입니다.
                    </strong>{" "}
                    로더가 없으면 <code>{"() => ({})"}</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>An empty module keeps all three.</strong> A new module starts with three empty classes; they
                    mark where each kind of code goes.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>빈 모듈도 세 클래스를 모두 둡니다.</strong> 새 모듈은 본문이 빈 세 클래스로 시작하고, 이
                    클래스들이 코드가 들어갈 자리를 표시합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="query-sort-methods"
        title={l.trans({ en: "Queries, Sorts And Generated Methods", ko: "쿼리, 정렬, 자동 생성 메서드" })}
      >
        <Docs.Title>
          {l.trans({ en: "Queries, Sorts And Generated Methods", ko: "쿼리, 정렬, 자동 생성 메서드" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Write a condition you use often once, as a named query, and call the generated methods from services
                  and signals. A query named <code>inProject</code> becomes <code>listInProject</code>,{" "}
                  <code>countInProject</code>, <code>existsInProject</code> and eleven more:
                </span>
              ),
              ko: (
                <span>
                  자주 쓰는 조건은 이름 붙인 쿼리로 한 번만 쓰고, service와 signal에서는 자동 생성된 메서드를
                  호출합니다. <code>inProject</code>라는 쿼리는 <code>listInProject</code>, <code>countInProject</code>,{" "}
                  <code>existsInProject</code> 외 열한 개의 메서드가 됩니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.document.ts"
          code={`export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    inProject: filter()
      .arg("project", ID)
      .opt("statuses", [cnst.TicketStatus])
      .query((project, statuses, q) => ({
        project,
        ...(statuses?.length ? { status: q.oneOf(statuses) } : {}),
      })),
  },
  sort: {
    highPriority: { priority: -1 },
  },
})) {}`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Building a query", ko: "쿼리 만들기" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Builder", ko: "빌더" })} items={builderRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Already built in:</strong> the <code>any</code> query (every row not removed) and the{" "}
                    <code>latest</code>, <code>oldest</code> and <code>relevance</code> sorts. Add only the rules your
                    business needs.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이미 들어 있는 것:</strong> <code>any</code> 쿼리(삭제되지 않은 전체)와 <code>latest</code>,{" "}
                    <code>oldest</code>, <code>relevance</code> 정렬입니다. 비즈니스에 필요한 규칙만 더합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never put <code>undefined</code> in a query.
                    </strong>{" "}
                    <code>{"{ status: undefined }"}</code> throws, so leave the key out when an optional argument is
                    missing.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      쿼리에 <code>undefined</code>를 넣지 않습니다.
                    </strong>{" "}
                    <code>{"{ status: undefined }"}</code>는 에러를 던지므로, 선택 인자가 없으면 키를 아예 뺍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Sort keys are checked.</strong> A key the filter does not declare is refused, not quietly
                    replaced by another order.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>정렬 키는 검사됩니다.</strong> filter에 없는 키를 넘기면 다른 정렬로 슬쩍 바뀌지 않고
                    거절됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "The q helpers", ko: "q 헬퍼" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Most helpers sit in a field's position, as in <code>{"{ status: q.oneOf(list) }"}</code>. The three
                  presence checks take a field path instead.
                </span>
              ),
              ko: (
                <span>
                  대부분의 헬퍼는 <code>{"{ status: q.oneOf(list) }"}</code>처럼 필드 자리에 둡니다. 값이 있는지 보는 세
                  헬퍼만 필드 경로를 받습니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Helper", ko: "헬퍼" })} items={helperRows} />

          <Docs.SubSubTitle>
            {l.trans({ en: "Fourteen generated methods", ko: "자동 생성되는 메서드 열네 개" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Every query generates fourteen methods, identically on the model and the service. Ten of them only read:",
              ko: "쿼리 하나마다 메서드 열네 개가 model과 service에 똑같이 생깁니다. 그중 열 개는 읽기만 합니다:",
            })}
          </div>
          <Docs.OptionTable items={readMethods} />
          <div>
            {l.trans({
              en: (
                <span>
                  The other four are <strong>query-level writes</strong>: one statement straight to the database, with
                  no hook:
                </span>
              ),
              ko: (
                <span>
                  나머지 네 개는 <strong>쿼리 단위 쓰기</strong>입니다. 문장 하나로 데이터베이스에 바로 가며 훅을
                  실행하지 않습니다:
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={writeMethods} />
          <div>{l.trans({ en: "In a service they read like this:", ko: "service에서는 이렇게 씁니다:" })}</div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.service.ts"
          code={`const tickets = await this.listInProject(projectId, {
  sort: "highPriority",
  limit: 20,
});
const firstTicket = await this.findInProject(projectId);
const ticket = await this.pickInProject(projectId);

const count: number = await this.countInProject(projectId);
const ticketId: string | null = await this.existsInProject(projectId);
const ticketInsight: db.TicketInsight = await this.insightInProject(projectId);

await this.updateInProject(projectId).set({ status: "archived" });`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>count</code> and <code>insight</code> read the same query.
                    </strong>{" "}
                    <code>count</code> returns a number; <code>insight</code> returns every counter on{" "}
                    <code>db.&lt;Model&gt;Insight</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>count</code>와 <code>insight</code>는 같은 쿼리를 읽습니다.
                    </strong>{" "}
                    <code>count</code>는 숫자를, <code>insight</code>는 <code>db.&lt;Model&gt;Insight</code>의 카운터
                    전부를 반환합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>exists&lt;Filter&gt;</code> is not a boolean.
                    </strong>{" "}
                    It resolves to the matching id or <code>null</code>, so a strict <code>=== true</code> never passes.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>exists&lt;Filter&gt;</code>는 boolean이 아닙니다.
                    </strong>{" "}
                    매치된 id 또는 <code>null</code>을 반환하므로 <code>=== true</code> 비교는 늘 실패합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>removeOne</code> and <code>updateOne</code> hit the newest match.
                    </strong>{" "}
                    They are for "there is at most one of these", never for taking the next item off a queue.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>removeOne</code>과 <code>updateOne</code>은 가장 최근 매치를 건드립니다.
                    </strong>{" "}
                    "이런 것은 많아야 하나"일 때 쓰는 것이지, 큐에서 다음 항목을 꺼내는 용도가 아닙니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>update&lt;Filter&gt;</code> is a chain.
                    </strong>{" "}
                    The patch goes on a terminal <code>.set()</code>; building the chain touches nothing.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>update&lt;Filter&gt;</code>는 체인입니다.
                    </strong>{" "}
                    patch는 마지막 <code>.set()</code>에 넘기고, 체인을 만드는 것만으로는 아무것도 바뀌지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A projection nests under <code>select</code> here.
                    </strong>{" "}
                    <code>{"listInProject(id, { select: { secret: true } })"}</code>, while the facade's{" "}
                    <code>{"pickById(id, { secret: true })"}</code> takes it bare.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      여기서는 projection을 <code>select</code> 안에 넣습니다.
                    </strong>{" "}
                    <code>{"listInProject(id, { select: { secret: true } })"}</code>처럼 씁니다. 파사드의{" "}
                    <code>{"pickById(id, { secret: true })"}</code>는 감싸지 않고 바로 받습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>The four query-level writes run no hooks.</strong> No <code>_postRemove</code>, no cascade: on
                  a model whose removal deletes a stored file or closes a child, <code>remove&lt;Filter&gt;</code>{" "}
                  leaves all of that undone and still reports a count that looks like success. Use them only on models
                  with no removal side effect; otherwise remove one at a time with the service's{" "}
                  <code>remove&lt;Model&gt;(id)</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>쿼리 단위 쓰기 네 개는 훅을 실행하지 않습니다.</strong> <code>_postRemove</code>도
                  캐스케이드도 없습니다. 삭제할 때 저장된 파일을 지우거나 자식을 닫는 model이라면,{" "}
                  <code>remove&lt;Filter&gt;</code>는 그 일을 하나도 하지 않고 성공처럼 보이는 개수를 돌려줍니다. 삭제
                  부수효과가 없는 model에만 쓰고, 그렇지 않으면 service의 <code>remove&lt;Model&gt;(id)</code>로 하나씩
                  지웁니다.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "Generated CRUD methods", ko: "자동 생성 CRUD 메서드" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Next to the query methods, every model gets these six CRUD methods.",
              ko: "쿼리 메서드 말고도, 모든 모델에는 아래 CRUD 메서드 여섯 개가 생깁니다.",
            })}
          </div>
          <Docs.OptionTable items={crudMethods} />
          <div>{l.trans({ en: "Called from a service:", ko: "service에서는 이렇게 부릅니다:" })}</div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.service.ts"
          code={`const ticket = await this.getTicket(ticketId);
const maybeTicket = await this.loadTicket(ticketId);
const tickets = await this.loadTicketMany(ticketIds);

const created = await this.createTicket(data);
const updated = await this.updateTicket(ticketId, updateData);
await this.removeTicket(ticketId);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Call them on the service.</strong> The service's copies also run <code>_preCreate</code>,{" "}
                    <code>_postRemove</code> and the other service hooks, and its <code>remove&lt;Model&gt;</code> runs
                    the cascade. The model's copies skip both.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>service에서 부릅니다.</strong> service 쪽 메서드는 <code>_preCreate</code>,{" "}
                    <code>_postRemove</code> 같은 service 훅도 실행하고, <code>remove&lt;Model&gt;</code>은
                    캐스케이드까지 실행합니다. model 쪽 메서드는 둘 다 건너뜁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="text-search-query" title={l.trans({ en: "Text Search Query", ko: "텍스트 검색 쿼리" })}>
        <Docs.Title>{l.trans({ en: "Text Search Query", ko: "텍스트 검색 쿼리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>q.search()</code> matches the full-text index built from fields that declare a <code>text</code>{" "}
                  role, such as <code>{'field(String, { text: "title" })'}</code>. There is no separate search method: a
                  query named <code>bySearch</code> gets <code>listBySearch</code>, <code>countBySearch</code>,{" "}
                  <code>queryBySearch</code>, <code>insightBySearch</code> and the rest.
                </span>
              ),
              ko: (
                <span>
                  <code>q.search()</code>는 <code>{'field(String, { text: "title" })'}</code>처럼 <code>text</code>{" "}
                  역할을 선언한 필드로 만든 전문 검색 인덱스를 조회합니다. 검색 전용 메서드는 따로 없습니다.{" "}
                  <code>bySearch</code>라는 쿼리에서 <code>listBySearch</code>, <code>countBySearch</code>,{" "}
                  <code>queryBySearch</code>, <code>insightBySearch</code> 등이 그대로 생깁니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "It is an ordinary query node, so it combines with normal conditions:",
              ko: "평범한 쿼리 노드라서 일반 조건과 함께 조합됩니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.document.ts"
          code={`export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.TicketStatus])
      .query((text, statuses, q) =>
        q.all(
          q.search(text, { prefix: true }),
          statuses?.length ? { status: q.oneOf(statuses) } : {},
        ),
      ),
  },
  sort: {},
})) {}`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Search options", ko: "검색 옵션" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={searchOptions} />
          <div>
            {l.trans({
              en: "A service calls it like any other query:",
              ko: "service에서는 다른 쿼리와 똑같이 부릅니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.service.ts"
          code={`const tickets = await this.listBySearch(text, statuses, {
  sort: "relevance",
});
const count = await this.countBySearch(text, statuses);`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Rules", ko: "규칙" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep it at an AND position.</strong> At the top or inside <code>q.all()</code>, never under{" "}
                    <code>q.any()</code> or <code>q.not()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>AND 위치에만 둡니다.</strong> 맨 바깥이나 <code>q.all()</code> 안에 두고,{" "}
                    <code>q.any()</code>나 <code>q.not()</code> 아래에는 두지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Blank input matches nothing.</strong> An empty search box never turns into a full listing;
                    do not "fix" that into a passthrough.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>빈 입력은 아무것도 매치하지 않습니다.</strong> 빈 검색창이 전체 목록으로 바뀌지 않게 하는
                    동작이므로, 전부 통과시키도록 "고치지" 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Name <code>relevance</code> for the best match first.
                    </strong>{" "}
                    Another sort key wins over the score. With no sort, a service call orders by score but a slice uses{" "}
                    <code>latest</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      가장 잘 맞는 순서로 보려면 <code>relevance</code>를 지정합니다.
                    </strong>{" "}
                    다른 정렬 키를 주면 점수보다 그 키가 우선합니다. 정렬을 생략하면 service 호출은 점수순이지만,
                    slice는 <code>latest</code>를 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No search in a query-level write.</strong> <code>update&lt;Filter&gt;</code>,{" "}
                    <code>remove&lt;Filter&gt;</code> and their <code>One</code> forms throw on a search query.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>쿼리 단위 쓰기에는 검색을 쓸 수 없습니다.</strong> 검색 쿼리에서{" "}
                    <code>update&lt;Filter&gt;</code>, <code>remove&lt;Filter&gt;</code>와 그 <code>One</code> 버전을
                    부르면 에러가 납니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Works in every database mode.</strong> For the same text, SQLite, libSQL and Postgres match
                    the same documents; only the order can differ on Postgres.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 데이터베이스 모드에서 동작합니다.</strong> 같은 텍스트라면 SQLite, libSQL, Postgres가
                    같은 document를 찾고, Postgres에서는 순서만 다를 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A filter is enough for a service.</strong> A slice publishes the search to clients, so add
                    one only for models that are safe to enumerate.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>service에서 검색하는 데는 filter로 충분합니다.</strong> slice를 달면 클라이언트에
                    공개되므로, 목록을 훑어도 괜찮은 모델에만 추가합니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Optional search text", ko: "검색어가 선택일 때" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The admin search in <code>libs/shared</code> takes the text as optional and falls back to{" "}
                  <code>{"{}"}</code>, so an empty box lists every admin. That is intended only because admin guards
                  protect the slice; never do it on a public one.
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>의 admin 검색은 검색어를 선택 인자로 받고, 없으면 <code>{"{}"}</code>를
                  반환합니다. 그래서 검색창이 비면 admin 전체가 나옵니다. admin guard가 지키는 slice라서 괜찮은
                  동작이고, 공개 slice에서는 이렇게 하지 않습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/lib/admin/admin.document.ts"
          code={`export class AdminFilter extends from(cnst.Admin, (filter) => ({
  query: {
    byAccountId: filter()
      .arg("accountId", String)
      .query((accountId) => ({ accountId })),
    bySearch: filter()
      .opt("text", String)
      .opt("roles", [cnst.AdminRole])
      .query((text, roles, q) =>
        q.all(
          text ? q.search(text, { prefix: true }) : {},
          roles?.length ? { roles: q.oneOf(roles) } : {},
        ),
      ),
  },
  sort: {},
})) {}`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="document-by" title={l.trans({ en: "Changing One Document", ko: "document 하나 바꾸기" })}>
        <Docs.Title>{l.trans({ en: "Changing One Document", ko: "document 하나 바꾸기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The state changes of one record live on the document class as chain methods. Each one checks, changes{" "}
                  <code>this</code> and returns <code>this</code>, so a service can chain several and save once.
                </span>
              ),
              ko: (
                <span>
                  레코드 하나의 상태 변경은 document 클래스의 체인 메서드로 둡니다. 각 메서드는 검사하고,{" "}
                  <code>this</code>를 바꾸고, <code>this</code>를 반환합니다. 그래서 service는 여러 개를 이어 부르고
                  저장은 한 번만 합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.document.ts"
          code={`import { by } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class Ticket extends by(cnst.Ticket) {
  // draft -> opened
  open() {
    if (this.status !== "draft") throw new Err("ticket.error.notDraft");
    this.status = "opened";
    return this;
  }
  // opened -> assigned
  assign(userId: string) {
    if (this.status !== "opened") throw new Err("ticket.error.notOpened");
    return this.set({ assignee: userId, status: "assigned" });
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "The service loads, chains and saves:",
              ko: "service는 불러오고, 이어 부르고, 저장합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/ticket/ticket.service.ts"
          code={`async open(ticketId: string, userId: string) {
  const ticket = await this.getTicket(ticketId);
  return await ticket.open().assign(userId).save();
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Check, change, return <code>this</code>.
                    </strong>{" "}
                    Validate first, mutate second, and end with <code>return this</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      검사하고, 바꾸고, <code>this</code>를 반환합니다.
                    </strong>{" "}
                    검증을 먼저 하고, 값을 바꾼 뒤, <code>return this</code>로 끝냅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never <code>save()</code> inside.
                    </strong>{" "}
                    The caller saves once, so chains compose:{" "}
                    <code className="wrap-anywhere">org.removeUser(id).removeInvite(id).save()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      메서드 안에서 <code>save()</code>하지 않습니다.
                    </strong>{" "}
                    저장은 호출한 쪽이 한 번만 하므로{" "}
                    <code className="wrap-anywhere">org.removeUser(id).removeInvite(id).save()</code>처럼 이어 붙일 수
                    있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Several fields at once: <code>{"this.set({ … })"}</code>.
                    </strong>{" "}
                    It returns <code>this</code>, so it can be the method's return value.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      여러 필드를 한 번에 바꿀 때는 <code>{"this.set({ … })"}</code>를 씁니다.
                    </strong>{" "}
                    <code>this</code>를 반환하므로 그대로 메서드의 반환값이 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One comment line per method names the transition,</strong> such as{" "}
                    <code>{"// draft -> opened"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>메서드마다 한 줄 주석으로 상태 전이를 적습니다.</strong> 예:{" "}
                    <code>{"// draft -> opened"}</code>
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Throw <code>new Err("ticket.error.&lt;key&gt;")</code>, never <code>new Error</code>.
                  </strong>{" "}
                  A raw <code>Error</code> fails lint and with it the build, so register the key as{" "}
                  <code>[en, ko]</code> in the dictionary's <code>{".error({})"}</code>. A state precondition throws
                  here; a rule across several documents throws in the service.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>new Error</code>가 아니라 <code>new Err("ticket.error.&lt;key&gt;")</code>를 던집니다.
                  </strong>{" "}
                  그냥 <code>Error</code>를 던지면 lint가 실패해 빌드가 깨지므로, 키를 dictionary의{" "}
                  <code>{".error({})"}</code>에 <code>[en, ko]</code>로 등록해 씁니다. 상태 전제 조건은 여기서 던지고,
                  여러 document에 걸친 규칙은 service에서 던집니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="model-into" title={l.trans({ en: "Model-Level Helpers", ko: "model 헬퍼" })}>
        <Docs.Title>{l.trans({ en: "Model-Level Helpers", ko: "model 헬퍼" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Work on the whole collection goes on the model class: atomic updates, bulk writes, counters and
                  building new documents. Inside it, <code>this.Story</code> is the table facade:
                </span>
              ),
              ko: (
                <span>
                  컬렉션 전체를 다루는 일은 model 클래스에 둡니다. 원자적 업데이트, 일괄 쓰기, 카운터, 새 document
                  만들기가 여기 속합니다. 클래스 안에서는 <code>this.Story</code>가 테이블 파사드입니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/story/story.document.ts"
          code={`export class StoryModel extends into(
  Story,
  StoryFilter,
  cnst.story,
  () => ({}),
) {
  async publish(storyId: string) {
    return await this.Story.pickAndWrite(storyId, { status: "approved" });
  }
  async addViewCount(storyId: string) {
    const { modifiedCount } = await this.Story.updateOne(
      { id: storyId },
      ({ inc }) => ({ viewCount: inc() }),
    );
    return !!modifiedCount;
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Counters use the updater callback.</strong>{" "}
                    <code>{"({ inc }) => ({ viewCount: inc() })"}</code> compiles to one atomic UPDATE with no read
                    first; return <code>!!modifiedCount</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>카운터는 updater 콜백으로 씁니다.</strong>{" "}
                    <code>{"({ inc }) => ({ viewCount: inc() })"}</code>는 먼저 읽지 않고 원자적 UPDATE 한 번으로
                    실행됩니다. 결과는 <code>!!modifiedCount</code>로 반환합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Updater helpers:</strong> <code>set</code>, <code>unset</code>, <code>inc</code>,{" "}
                    <code>mul</code>, <code>min</code>, <code>max</code>, <code>push</code>, <code>pull</code>,{" "}
                    <code>addToSet</code>, <code>setOnInsert</code>. A bare value means <code>set</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>updater 헬퍼:</strong> <code>set</code>, <code>unset</code>, <code>inc</code>,{" "}
                    <code>mul</code>, <code>min</code>, <code>max</code>, <code>push</code>, <code>pull</code>,{" "}
                    <code>addToSet</code>, <code>setOnInsert</code>. 값만 쓰면 <code>set</code>과 같습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Removal is always soft.</strong> Every remove stamps <code>removedAt</code>, and every query
                    already skips removed rows, so a filter does not need to check <code>removedAt</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>삭제는 늘 소프트 삭제입니다.</strong> 모든 삭제는 <code>removedAt</code>을 찍을 뿐입니다.
                    모든 쿼리가 삭제된 행을 이미 걸러 내므로, filter에서 <code>removedAt</code>을 따로 검사할 필요가
                    없습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "The table facade", ko: "테이블 파사드" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={facadeRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="generated-extension"
        title={l.trans({ en: "Extending A Library Model", ko: "라이브러리 모델 확장" })}
      >
        <Docs.Title>{l.trans({ en: "Extending A Library Model", ko: "라이브러리 모델 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An app can add to a model a library already defines, such as <code>user</code> from{" "}
                  <code>libs/shared</code>. Pass the library's classes as the last arguments and write only what the app
                  adds.
                </span>
              ),
              ko: (
                <span>
                  앱은 라이브러리가 이미 정의한 모델에 기능을 더할 수 있습니다. <code>libs/shared</code>의{" "}
                  <code>user</code>가 대표적입니다. 라이브러리 클래스를 마지막 인자로 넘기고, 앱이 더할 것만 씁니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>../__lib/lib.document</code> collects the library's classes for each model:
                </span>
              ),
              ko: (
                <span>
                  <code>../__lib/lib.document</code>가 모델별로 라이브러리 클래스를 모아 export합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/blog/lib/user/user.document.ts"
          code={`import { by, from, into } from "akanjs/document";

import { user } from "../__lib/lib.document";
import * as cnst from "../cnst";

export class UserFilter extends from(
  cnst.User,
  (filter) => ({ query: {}, sort: {} }),
  ...user.filters,
) {}

export class User extends by(cnst.User, ...user.docs) {
  hasAccessToken() {
    return !!this.githubInfo?.accessToken;
  }
}

export class UserModel extends into(
  User,
  UserFilter,
  cnst.user,
  () => ({}),
  ...user.models,
) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One spread per class.</strong> <code>...user.filters</code> goes into <code>from()</code>,{" "}
                    <code>...user.docs</code> into <code>by()</code>, <code>...user.models</code> into{" "}
                    <code>into()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>클래스마다 spread 하나씩 넘깁니다.</strong> <code>...user.filters</code>는{" "}
                    <code>from()</code>에, <code>...user.docs</code>는 <code>by()</code>에, <code>...user.models</code>
                    는 <code>into()</code>에 넣습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The library's behavior merges in.</strong> Its queries, sorts, document methods, model
                    methods, loaders and <code>_onSchema</code> hooks all join yours.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>라이브러리의 동작이 합쳐집니다.</strong> 라이브러리의 쿼리, 정렬, document 메서드, model
                    메서드, 로더, <code>_onSchema</code> 훅이 모두 앱의 것과 합쳐집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the spreads when you edit.</strong> Dropping one removes the library's methods from
                    your class.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>수정할 때 spread를 지우지 않습니다.</strong> 하나라도 빠지면 그 클래스에서 라이브러리
                    메서드가 사라집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>lib/__lib/lib.document.ts</code> is generated.
                    </strong>{" "}
                    Do not edit it; it follows the libraries the app depends on.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>lib/__lib/lib.document.ts</code>는 자동 생성 파일입니다.
                    </strong>{" "}
                    직접 고치지 않습니다. 앱이 의존하는 라이브러리에 맞춰 만들어집니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="loaders-lookups" title={l.trans({ en: "Loaders And Lookups", ko: "로더와 조회" })}>
        <Docs.Title>{l.trans({ en: "Loaders And Lookups", ko: "로더와 조회" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A loader collects the lookups made in the same tick and answers them with one query, so a hundred{" "}
                  <code>load()</code> calls cost one round-trip. Declare one in the fourth argument of{" "}
                  <code>into()</code> for a lookup key you use often.
                </span>
              ),
              ko: (
                <span>
                  로더는 같은 틱에 들어온 조회를 모아 쿼리 한 번으로 답합니다. <code>load()</code>를 백 번 불러도 왕복은
                  한 번입니다. 자주 쓰는 조회 키가 있으면 <code>into()</code>의 네 번째 인자에 로더를 선언합니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Builder", ko: "빌더" })} items={loaderRows} />
          <div>
            {l.trans({
              en: "A single-field loader looks up by one key:",
              ko: "단일 필드 로더는 키 하나로 찾습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/product/product.document.ts"
          code={`export class ProductModel extends into(
  Product,
  ProductFilter,
  cnst.product,
  ({ byField }) => ({ productSkuLoader: byField("sku") }),
) {
  async getProductBySku(sku: string) {
    return await this.productSkuLoader.load(sku);
  }
  async getProductsBySkus(skus: string[]) {
    return await this.productSkuLoader.loadMany(skus);
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A key made of several fields takes <code>byQuery</code>:
                </span>
              ),
              ko: (
                <span>
                  여러 필드로 이루어진 키에는 <code>byQuery</code>를 씁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/order/order.document.ts"
          code={`export class OrderModel extends into(
  Order,
  OrderFilter,
  cnst.order,
  ({ byQuery }) => ({
    orderLoader: byQuery(["shop", "orderNumber"] as const),
  }),
) {
  async getShopOrder(orderQuery: { shop: string; orderNumber: string }) {
    return await this.orderLoader.load(orderQuery);
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A missing key resolves to <code>null</code>.
                    </strong>{" "}
                    <code>load()</code> does not throw for a key with no match.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      없는 키는 <code>null</code>이 됩니다.
                    </strong>{" "}
                    맞는 document가 없어도 <code>load()</code>는 에러를 던지지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every builder takes a default query</strong> as its second argument, e.g.{" "}
                    <code>{'byField("sku", { status: "active" })'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 빌더는 두 번째 인자로 기본 쿼리를 받습니다.</strong> 예:{" "}
                    <code>{'byField("sku", { status: "active" })'}</code>
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The id loader is built in.</strong> <code>get&lt;Model&gt;</code>,{" "}
                    <code>load&lt;Model&gt;</code> and <code>load&lt;Model&gt;Many</code> already batch through it, and
                    it keeps nothing past a batch.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>id 로더는 기본으로 있습니다.</strong> <code>get&lt;Model&gt;</code>,{" "}
                    <code>load&lt;Model&gt;</code>, <code>load&lt;Model&gt;Many</code>가 이미 이 로더로 묶어 불러오며,
                    batch가 끝나면 아무것도 기억하지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A loader returns one document per key, not a list.</strong> <code>{'byField("seller")'}</code>{" "}
                  would answer one product per seller. "Every product of a seller" is a query,{" "}
                  <code>listBySeller(sellerId)</code>, not a loader.
                </span>
              ),
              ko: (
                <span>
                  <strong>로더는 키 하나에 document 하나를 돌려줍니다. 목록이 아닙니다.</strong>{" "}
                  <code>{'byField("seller")'}</code>는 판매자마다 상품 하나만 돌려줍니다. "판매자의 모든 상품"은 로더가
                  아니라 <code>listBySeller(sellerId)</code> 같은 쿼리로 읽습니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Keeping Loaded Keys", ko: "불러온 키 기억하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Every builder takes an option object as its third argument, such as{" "}
                  <code>{'byField("sku", {}, { cache: 60_000 })'}</code>. Its <code>cache</code> decides how long a
                  loaded key is answered from memory:
                </span>
              ),
              ko: (
                <span>
                  모든 빌더는 세 번째 인자로 옵션 객체를 받습니다. 예:{" "}
                  <code>{'byField("sku", {}, { cache: 60_000 })'}</code>. 이 객체의 <code>cache</code>가 불러온 키를
                  메모리에서 얼마나 오래 답할지 정합니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "value", label: "cache", code: true },
              { key: "meaning", label: l.trans({ en: "Each loaded key is kept", ko: "불러온 키를 기억하는 기간" }) },
            ]}
            rows={[
              {
                value: "false",
                meaning: l.trans({
                  en: "The default: not past the batch it was loaded in.",
                  ko: "기본값입니다. 그 키를 불러온 batch가 끝나면 잊습니다.",
                }),
              },
              {
                value: "60_000",
                meaning: l.trans({ en: "For that many milliseconds.", ko: "그 밀리초 동안 기억합니다." }),
              },
              {
                value: "true",
                meaning: l.trans({
                  en: "For as long as the process runs.",
                  ko: "프로세스가 도는 동안 계속 기억합니다.",
                }),
              },
            ]}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A kept key serves a stale document.</strong> Loaders live as long as the process, so a
                    document changed after it was loaded is still answered in its old shape until the key expires.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>기억해 둔 키는 오래된 document를 돌려줍니다.</strong> 로더는 프로세스와 수명이 같아서,
                    불러온 뒤에 바뀐 document도 키가 만료될 때까지 예전 모습으로 답합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A failed load is never kept.</strong> The next <code>load()</code> for that key asks the
                    database again.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>실패한 조회는 기억하지 않습니다.</strong> 그 키로 다시 <code>load()</code>하면
                    데이터베이스에 다시 묻습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="schema-hooks" title={l.trans({ en: "Schema Hooks And Indexes", ko: "스키마 훅과 인덱스" })}>
        <Docs.Title>{l.trans({ en: "Schema Hooks And Indexes", ko: "스키마 훅과 인덱스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>static override _onSchema(schema)</code> declares what the table itself needs: indexes, and
                  small hooks that keep derived fields in step. Business workflows stay in the service.
                </span>
              ),
              ko: (
                <span>
                  <code>static override _onSchema(schema)</code>에는 테이블 자체에 필요한 것을 선언합니다. 인덱스와,
                  파생 필드를 맞춰 두는 작은 훅이 여기 들어갑니다. 비즈니스 흐름은 service에 둡니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Indexes", ko: "인덱스" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "An index speeds up a lookup you run often:",
              ko: "자주 하는 조회는 인덱스로 빠르게 만듭니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/story/story.document.ts"
          code={`import { by, from, into, type SchemaOf } from "akanjs/document";

export class StoryModel extends into(
  Story,
  StoryFilter,
  cnst.story,
  () => ({}),
) {
  static override _onSchema(schema: SchemaOf<StoryModel, Story>) {
    schema.index({ author: 1, createdAt: -1 });
    schema.index({ slug: 1 }, { unique: true });
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The second argument of <code>schema.index()</code>:
                </span>
              ),
              ko: (
                <span>
                  <code>schema.index()</code>의 두 번째 인자입니다:
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={indexOptions} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Search is not an index.</strong> <code>schema.index()</code> builds plain lookup indexes.
                    The value <code>"text"</code> is an old alias for a plain index, not search; declare a{" "}
                    <code>text</code> role on the field instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>검색은 인덱스가 아닙니다.</strong> <code>schema.index()</code>는 일반 조회 인덱스만
                    만듭니다. 값 <code>"text"</code>는 일반 인덱스의 옛 별칭일 뿐 검색이 아닙니다. 검색은 필드에{" "}
                    <code>text</code> 역할을 선언해서 켭니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Named sorts are indexed for you.</strong> Each order in the filter's <code>sort</code>{" "}
                    already has an index, so declare one only for a lookup you run often.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이름 붙인 정렬에는 인덱스가 저절로 생깁니다.</strong> filter의 <code>sort</code>에 있는
                    정렬마다 인덱스가 이미 있으므로, 자주 하는 조회에만 직접 선언합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A builder form exists too.</strong> <code>schema.createIndex(name)</code> chains{" "}
                    <code>.path(field, order)</code>, <code>.unique()</code> and ends with <code>.done()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>빌더 형태도 있습니다.</strong> <code>schema.createIndex(name)</code>에{" "}
                    <code>.path(field, order)</code>, <code>.unique()</code>를 이어 붙이고 <code>.done()</code>으로
                    끝냅니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Leave a shipped index as written.</strong> Every live database remembers its definition, so
                  changing it, even <code>"text"</code> to <code>1</code> or adding <code>unique</code>, breaks them
                  all. Add a new index at the end instead, or give it a <code>name</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>배포된 인덱스는 적힌 그대로 둡니다.</strong> 운영 중인 데이터베이스가 그 정의를 기억하므로,{" "}
                  <code>"text"</code>를 <code>1</code>로 바꾸거나 <code>unique</code>를 더하기만 해도 모두 깨집니다.
                  대신 새 인덱스를 맨 끝에 더하거나 <code>name</code>을 붙입니다.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "Hooks", ko: "훅" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A hook keeps a derived field in step with the field it comes from. This one recounts a story's tags
                  whenever they change:
                </span>
              ),
              ko: (
                <span>
                  훅은 파생 필드를 원본 필드에 맞춰 둡니다. 아래 훅은 story의 태그가 바뀔 때마다 태그 수를 다시 셉니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/story/story.document.ts"
          code={`export class StoryModel extends into(
  Story,
  StoryFilter,
  cnst.story,
  () => ({}),
) {
  static override _onSchema(schema: SchemaOf<StoryModel, Story>) {
    schema.pre<Story>("save", function (_next, _type, previous) {
      if (!previous || this.isModified("tags")) {
        this.tagNum = this.tags.length;
      }
    });
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Which writes run which hook event:",
              ko: "어떤 쓰기에서 어떤 훅 이벤트가 실행되는지 정리했습니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Event", ko: "이벤트" })}
            columns={hookColumns}
            groups={hookGroups}
            markLabel={l.trans({ en: "runs", ko: "실행됨" })}
            emptyLabel={l.trans({ en: "does not run", ko: "실행되지 않음" })}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Hooks may be <code>async</code> and need no <code>next()</code>.
                    </strong>{" "}
                    <code>this</code> is the document, and the third parameter, <code>previous</code>, is the row before
                    this write (absent on create).
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      훅은 <code>async</code>여도 되고 <code>next()</code>를 부를 필요가 없습니다.
                    </strong>{" "}
                    <code>this</code>는 document이고, 세 번째 매개변수 <code>previous</code>는 이번 쓰기 전의 행입니다.
                    생성할 때는 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Read <code>this.isModified("field")</code> inside a save hook.
                    </strong>{" "}
                    On a document fresh from a read, such as <code>get&lt;Model&gt;</code> or{" "}
                    <code>list&lt;Filter&gt;</code>, it throws.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>this.isModified("field")</code>는 save 훅 안에서 읽습니다.
                    </strong>{" "}
                    <code>get&lt;Model&gt;</code>이나 <code>list&lt;Filter&gt;</code>로 막 읽어 온 document에서는 에러를
                    던집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      On a create, <code>isModified()</code> is always <code>false</code>.
                    </strong>{" "}
                    A create has no <code>previous</code>, so check <code>!previous</code> first, as the example does.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      생성할 때 <code>isModified()</code>는 늘 <code>false</code>입니다.
                    </strong>{" "}
                    생성에는 <code>previous</code>가 없으므로, 예제처럼 <code>!previous</code>를 먼저 확인합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>post</code> hooks run after the write commits.
                    </strong>{" "}
                    <code>pre</code> hooks run before it, and can still change the document.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>post</code> 훅은 쓰기가 커밋된 뒤에 실행됩니다.
                    </strong>{" "}
                    <code>pre</code> 훅은 그 전에 실행되므로 아직 document를 바꿀 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>updatedAt</code> is stamped for you
                    </strong>{" "}
                    on every write, query-level ones included. Do not set it in a hook.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>updatedAt</code>은 자동으로 찍힙니다.
                    </strong>{" "}
                    쿼리 단위 쓰기를 포함한 모든 쓰기에서 갱신되므로, 훅에서 직접 넣지 않습니다.
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
              en: "Where each kind of code goes, across the three classes and the service:",
              ko: "코드 종류별로 세 클래스와 service 중 어디에 두는지 정리했습니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "What you are writing", ko: "작성하는 코드" })}
            columns={placeColumns}
            groups={placeGroups}
            markLabel={l.trans({ en: "goes here", ko: "여기에 둡니다" })}
            emptyLabel={l.trans({ en: "not here", ko: "여기가 아닙니다" })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Common mistakes", ko: "자주 하는 실수" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Class names that drift from the constant.</strong> <code>TicketFilter</code>,{" "}
                    <code>Ticket</code> and <code>TicketModel</code> match <code>cnst.Ticket</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>클래스 이름이 constant와 어긋나는 경우.</strong> <code>TicketFilter</code>,{" "}
                    <code>Ticket</code>, <code>TicketModel</code>은 <code>cnst.Ticket</code>과 맞춥니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The same condition copied into several services.</strong> Move it into the filter and call{" "}
                    <code>listInProject</code> everywhere.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>같은 조건을 여러 service에 복사하는 경우.</strong> filter로 옮기고 어디서나{" "}
                    <code>listInProject</code>를 부릅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A filter named after its own model.</strong> A <code>ticket</code> query on{" "}
                    <code>Ticket</code> would produce <code>removeTicket</code> and <code>updateTicket</code>, which the
                    CRUD methods already own.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모델과 같은 이름의 filter.</strong> <code>Ticket</code>에 <code>ticket</code> 쿼리를 두면{" "}
                    <code>removeTicket</code>, <code>updateTicket</code>이 생기는데, 이 이름은 이미 CRUD 메서드의
                    것입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>!!result</code> instead of <code>!!modifiedCount</code>.
                    </strong>{" "}
                    <code>updateOne</code> resolves to an object, so <code>!!</code> on it is always <code>true</code>.
                    Destructure <code>{"{ modifiedCount }"}</code> first.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>!!modifiedCount</code> 대신 <code>!!result</code>를 반환하는 경우.
                    </strong>{" "}
                    <code>updateOne</code>은 객체를 반환하므로 <code>!!</code>를 붙이면 늘 <code>true</code>입니다.{" "}
                    <code>{"{ modifiedCount }"}</code>를 먼저 꺼냅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A heavy workflow in a schema hook.</strong> Hooks are for indexes and small derived fields;
                    workflows go in the service.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>스키마 훅에 무거운 흐름을 넣는 경우.</strong> 훅은 인덱스와 작은 파생 필드용이고, 흐름은
                    service에 둡니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A large scalar document.</strong> A scalar's document file is usually just{" "}
                    <code>by(cnst.X)</code> with a small helper or two.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>scalar document 파일이 커지는 경우.</strong> scalar의 document 파일은 보통{" "}
                    <code>by(cnst.X)</code>에 작은 헬퍼 한두 개면 충분합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
