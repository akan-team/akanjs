import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "akanjs/constant | Akan.js" : "akanjs/constant | Akan.js";
    const description =
      lang === "ko"
        ? "via와 field, visual·hidden·secret 수정자, resolve와 crystalize."
        : "via, field and its visual, hidden and secret modifiers, resolve and crystalize.";
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

    const bulletList = "my-4 list-disc space-y-2 pl-5";
    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
    const card = panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0");
    const groupLabel = "mt-6 font-semibold text-foreground";

    const exportRows = [
      {
        name: "via",
        href: "#via",
        desc: l.trans({
          en: "Declares every constant class. What you pass decides which class it is.",
          ko: "모든 constant class를 선언합니다. 넘기는 인자가 어떤 class가 될지 정합니다.",
        }),
      },
      {
        name: "field",
        href: "#field",
        desc: l.trans({
          en: "The builder `via` hands you. Each call declares one stored field.",
          ko: "`via`가 넘겨 주는 builder입니다. 한 번 부를 때마다 저장되는 필드 하나를 선언합니다.",
        }),
      },
      {
        name: ["field.visual", "field.hidden", "field.secret"],
        desc: l.trans({
          en: "Variants of `field` that keep a value away from agents, the client, or default reads.",
          ko: "값을 에이전트, 클라이언트, 기본 조회에서 빼 두는 `field`의 변형입니다.",
        }),
      },
      {
        name: "resolve",
        href: "#resolve",
        desc: l.trans({
          en: "Declares a field the server computes for each response instead of storing it.",
          ko: "저장하지 않고 서버가 응답마다 계산하는 필드를 선언합니다.",
        }),
      },
      {
        name: "getDefault",
        href: "#getDefault",
        desc: l.trans({
          en: "Builds the blank object a new record or form starts from.",
          ko: "새 레코드나 폼이 시작하는 빈 객체를 만듭니다.",
        }),
      },
      {
        name: ["DocumentModel", "DefaultOf", "QueryOf", "PurifiedModel", "ProtoFile", "ProtoLightFile"],
        desc: l.trans({
          en: "Types for the stored shape, the default shape, a query, a purified value, and a file.",
          ko: "저장되는 모양, 기본값 모양, query, purify한 값, 파일을 나타내는 타입입니다.",
        }),
      },
      {
        name: ["crystalize", "makePurify"],
        desc: l.trans({
          en: "Turn raw data into model values, and a model back into a checked plain object.",
          ko: "원시 데이터를 model 값으로, model을 검사를 마친 일반 객체로 바꿉니다.",
        }),
      },
      {
        name: ["serialize", "deserialize"],
        desc: l.trans({
          en: "Convert values to and from the payload that crosses a boundary.",
          ko: "경계를 넘나드는 payload와 런타임 값 사이를 변환합니다.",
        }),
      },
      {
        name: "ConstantRegistry",
        href: "#ConstantRegistry",
        desc: l.trans({
          en: "Finds model classes, refNames and enums at runtime.",
          ko: "런타임에 model class, refName, enum을 찾아 줍니다.",
        }),
      },
    ];

    const termRows = [
      {
        name: "refName",
        desc: l.trans({
          en: "The camelCase name a module is registered under, such as `banner`.",
          ko: "모듈이 등록된 camelCase 이름입니다. 예: `banner`",
        }),
      },
      {
        name: "scalar",
        desc: l.trans({
          en: "A value object with no table of its own. Other documents embed it whole.",
          ko: "자기 테이블 없이 다른 문서 안에 통째로 들어가는 값 객체입니다.",
        }),
      },
      {
        name: "relation",
        desc: l.trans({
          en: "A field whose type is another database model. It stores that document's id.",
          ko: "타입이 다른 데이터베이스 model인 필드입니다. 그 문서의 id를 저장합니다.",
        }),
      },
      {
        name: "projection",
        desc: l.trans({
          en: "A read option that names the fields to load, such as `{ password: true }`.",
          ko: "읽어 올 필드를 적는 조회 옵션입니다. 예: `{ password: true }`",
        }),
      },
    ];

    const classRows = [
      {
        name: "BannerInput",
        desc: l.trans({
          en: "The fields a caller sends to create or update a banner.",
          ko: "배너를 만들거나 고칠 때 받는 필드입니다.",
        }),
      },
      {
        name: "BannerObject",
        desc: l.trans({
          en: "The Input plus fields the server keeps, and `id`, `createdAt`, `updatedAt`, `removedAt`.",
          ko: "Input에 서버가 관리하는 필드와 `id`, `createdAt`, `updatedAt`, `removedAt`을 더합니다.",
        }),
      },
      {
        name: "LightBanner",
        desc: l.trans({
          en: "Only the fields a list needs. Display and predicate methods live here.",
          ko: "목록에 필요한 필드만 고른 class입니다. 표시·판별 메서드를 여기에 둡니다.",
        }),
      },
      {
        name: "Banner",
        desc: l.trans({
          en: "The full model: every field, plus the ones `resolve` computes.",
          ko: "full model입니다. 모든 필드와 `resolve`가 계산하는 필드를 가집니다.",
        }),
      },
      {
        name: "BannerInsight",
        desc: l.trans({
          en: "Numbers about a whole list. It starts with `count` and is written even when empty.",
          ko: "목록 전체에 대한 집계 값입니다. `count`가 기본으로 들어 있고, 비어 있어도 작성합니다.",
        }),
      },
    ];

    const viaColumns = [
      { key: "args", label: l.trans({ en: "Arguments", ko: "인자" }), code: true },
      { key: "builds", label: l.trans({ en: "Declares", ko: "만드는 class" }) },
    ];
    const viaRows = [
      {
        args: "(field) => ({ … })",
        builds: l.trans({
          en: "`BannerInput`, or a scalar. A lone builder callback is either one.",
          ko: "`BannerInput` 또는 scalar입니다. builder callback 하나만 넘기면 둘 중 하나가 됩니다.",
        }),
      },
      {
        args: "BannerInput, (field) => ({ … })",
        builds: l.trans({
          en: "`BannerObject`: the Input's fields plus the ones you add.",
          ko: "`BannerObject`입니다. Input의 필드에 새 필드를 더합니다.",
        }),
      },
      {
        args: 'BannerObject, ["title", …] as const, (resolve) => ({ … })',
        builds: l.trans({
          en: "`LightBanner`: only the named fields, plus any `resolve` fields.",
          ko: "`LightBanner`입니다. 이름을 적은 필드와 `resolve` 필드만 가집니다.",
        }),
      },
      {
        args: "BannerObject, LightBanner, (resolve) => ({ … })",
        builds: l.trans({
          en: "`Banner`: Object and Light merged, plus any `resolve` fields.",
          ko: "`Banner`(full model)입니다. Object와 Light를 합치고 `resolve` 필드를 더합니다.",
        }),
      },
      {
        args: "Banner, (field) => ({ … })",
        builds: l.trans({
          en: "`BannerInsight`: `count` plus the fields you add.",
          ko: "`BannerInsight`입니다. 기본 `count`에 새 필드를 더합니다.",
        }),
      },
    ];

    const typeColumns = [
      { key: "write", label: l.trans({ en: "Write", ko: "작성" }), code: true },
      { key: "means", label: l.trans({ en: "Declares", ko: "뜻" }) },
    ];
    const typeRows = [
      {
        write: "field(String)",
        means: l.trans({
          en: "One value: `String`, `Boolean`, `Date`, `ID`, `Int`, `Float` or `Any`.",
          ko: "값 하나입니다. `String`, `Boolean`, `Date`, `ID`, `Int`, `Float`, `Any`를 씁니다.",
        }),
      },
      {
        write: "field([String])",
        means: l.trans({
          en: "An array. Brackets nest up to three deep, as in `[[Float]]`.",
          ko: "배열입니다. `[[Float]]`처럼 대괄호를 세 겹까지 겹칠 수 있습니다.",
        }),
      },
      {
        write: "field(File)",
        means: l.trans({
          en: "A relation to another model's document, stored as its id.",
          ko: "다른 model 문서와의 relation입니다. 그 문서의 id로 저장됩니다.",
        }),
      },
      {
        write: "field(Coordinate)",
        means: l.trans({
          en: "A scalar, embedded whole inside this document.",
          ko: "scalar를 이 문서 안에 통째로 넣습니다.",
        }),
      },
      {
        write: "field(ProductStatus)",
        means: l.trans({
          en: "An enum class declared with `enumOf`.",
          ko: "`enumOf`로 선언한 enum class입니다.",
        }),
      },
      {
        write: "field(Map, { of: String })",
        means: l.trans({
          en: "A map with string keys. `of` names the value type and is required.",
          ko: "문자열 key를 쓰는 Map입니다. `of`로 값 타입을 적으며, 빠뜨릴 수 없습니다.",
        }),
      },
      {
        write: "field<T>(Any)",
        means: l.trans({
          en: "An open value. The type argument keeps it typed in TypeScript.",
          ko: "모양을 열어 둔 값입니다. 타입 인자로 TypeScript 타입을 유지합니다.",
        }),
      },
    ];

    const valueOptionRows = [
      {
        key: "default",
        type: "T | ((doc: { id: string }) => T)",
        desc: l.trans({
          en: "The starting value. A function runs again for every record.",
          ko: "시작 값입니다. 함수로 주면 레코드마다 새로 실행됩니다.",
        }),
      },
      {
        key: "validate",
        type: "(value, model) => boolean",
        desc: l.trans({
          en: "Your own check, run by `purify` and on every document save. `false` rejects the value.",
          ko: "직접 작성하는 검사로, `purify`와 문서 저장 때마다 실행됩니다. `false`면 값을 거부합니다.",
        }),
      },
      {
        key: "immutable",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "Changing it in a document save throws. Query-level writes skip the check.",
          ko: "문서 저장으로 값을 바꾸면 에러가 납니다. query 단위 쓰기는 검사하지 않습니다.",
        }),
      },
      {
        key: "of",
        desc: l.trans({
          en: "The value type of a `Map` field, such as `String` or a scalar. Required for `Map`.",
          ko: "`Map` 필드의 값 타입입니다. `String`이나 scalar 등을 적으며, `Map`에는 꼭 필요합니다.",
        }),
      },
      {
        key: "visual",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "The same as declaring it with `field.visual`.",
          ko: "`field.visual`로 선언한 것과 같습니다.",
        }),
      },
      {
        key: "accumulate",
        type: l.trans({ en: "query object", ko: "query 객체" }),
        desc: l.trans({
          en: "Insight fields only: the condition this counter counts. `{}` counts every match.",
          ko: "Insight 필드에만 씁니다. 이 카운터가 셀 조건이며, `{}`는 조회 결과 전부를 셉니다.",
        }),
      },
    ];

    const linkOptionRows = [
      {
        key: "text",
        type: '"title" | "desc" | "tag" | "thumb" | "filter"',
        desc: l.trans({
          en: "Adds the field to full-text search in that role. `thumb` is kept for display, never matched.",
          ko: "그 역할로 전문 검색에 넣습니다. `thumb`는 표시용으로만 저장되고 검색되지 않습니다.",
        }),
      },
      {
        key: "cascade",
        type: '"removeRef" | "removeWith" | "removeWithAny"',
        desc: l.trans({
          en: "Removes related documents together. The value says which side follows which.",
          ko: "관련 문서를 함께 지웁니다. 값이 어느 쪽이 어느 쪽을 따라 지워지는지 정합니다.",
        }),
      },
      {
        key: "ref",
        type: "string",
        desc: l.trans({
          en: 'The refName an `ID` field points at, as in `{ ref: "org", cascade: "removeWith" }`.',
          ko: '`ID` 필드가 가리키는 model의 refName입니다. 예: `{ ref: "org", cascade: "removeWith" }`',
        }),
      },
      {
        key: "refPath",
        type: "string",
        desc: l.trans({
          en: "The field naming which model the id points at: an `enumOf`, or a `String` with `removeWithAny`.",
          ko: "id가 어느 model을 가리키는지 담은 필드 이름입니다. `enumOf` 필드를 쓰고, `removeWithAny`일 때만 `String`을 씁니다.",
        }),
      },
    ];

    const docOptionRows = [
      {
        key: "min",
        type: "number",
        desc: l.trans({
          en: "A lower bound shown in the schema docs. `sampleOf()` uses it as the sample.",
          ko: "스키마 문서에 표시되는 하한입니다. `sampleOf()`는 이 값을 샘플로 씁니다.",
        }),
      },
      {
        key: "max",
        type: "number",
        desc: l.trans({
          en: "An upper bound, used the same way as `min`.",
          ko: "상한입니다. `min`과 같은 방식으로 쓰입니다.",
        }),
      },
      {
        key: "minlength",
        type: "number",
        desc: l.trans({
          en: "A shortest length for the schema docs. On an array, `purify` does check the item count.",
          ko: "스키마 문서에 표시되는 최소 길이입니다. 배열이면 `purify`가 항목 수를 실제로 검사합니다.",
        }),
      },
      {
        key: "maxlength",
        type: "number",
        desc: l.trans({
          en: "A longest length, handled the same way as `minlength`.",
          ko: "최대 길이입니다. `minlength`와 같은 방식으로 다룹니다.",
        }),
      },
      {
        key: "type",
        type: '"email" | "password" | "url"',
        desc: l.trans({
          en: "Makes `sampleOf()` produce a realistic email, password or URL.",
          ko: "`sampleOf()`가 그럴듯한 이메일, 비밀번호, URL을 만들게 합니다.",
        }),
      },
      {
        key: "example",
        type: "T",
        desc: l.trans({
          en: "A sample value for the schema docs and the API explorer's example requests.",
          ko: "스키마 문서와 API explorer의 예시 요청에 쓰이는 샘플 값입니다.",
        }),
      },
      {
        key: "refType",
        type: '"child" | "parent" | "relation"',
        desc: l.trans({
          en: "A label the schema docs show on a relation.",
          ko: "스키마 문서가 relation에 붙여 보여 주는 이름표입니다.",
        }),
      },
    ];

    const chainRows = [
      {
        name: ".optional()",
        desc: l.trans({
          en: "Allows `null`. Without a `default`, the field starts at `null`.",
          ko: "`null`을 허용합니다. `default`가 없으면 `null`에서 시작합니다.",
        }),
      },
      {
        name: ".meta(obj)",
        desc: l.trans({
          en: "Attaches free-form metadata. A summary counter uses it to name the list it counts.",
          ko: "필드에 자유 형식의 metadata를 붙입니다. 집계 카운터는 이것으로 자기가 세는 목록을 적습니다.",
        }),
        example:
          'field(Int, { default: 0 }).meta(getQueryMeta<UserFilter>("user").query("byStatuses").args([["active"]]))',
      },
    ];

    const maskColumns = [
      { key: "server", label: l.trans({ en: "Read", ko: "조회" }) },
      { key: "client", label: l.trans({ en: "Page", ko: "페이지" }) },
      { key: "agent", label: l.trans({ en: "Agent", ko: "에이전트" }), caption: "MCP" },
      { key: "draft", label: l.trans({ en: "Draft", ko: "초안" }) },
      { key: "search", label: l.trans({ en: "Search", ko: "검색" }) },
    ];
    const maskGroups = [
      {
        label: l.trans({ en: "Sent to the page", ko: "페이지로 가는 필드" }),
        rows: [
          {
            name: "field",
            desc: l.trans({ en: "An ordinary field. Every side reads it.", ko: "보통 필드입니다. 어디서나 읽습니다." }),
            marks: { server: true, client: true, agent: true, draft: true, search: true },
          },
          {
            name: "field.visual",
            desc: l.trans({
              en: "Drawn on the page, stripped from everything an agent reads.",
              ko: "페이지에는 그려지고, 에이전트가 읽는 값에서는 빠집니다.",
            }),
            marks: { server: true, client: true, draft: true, search: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Kept on the server", ko: "서버에 남는 필드" }),
        rows: [
          {
            name: "field.hidden",
            desc: l.trans({
              en: "Server code reads it. The client gets `null`.",
              ko: "서버 코드는 읽고, 클라이언트는 `null`을 받습니다.",
            }),
            marks: { server: true },
          },
          {
            name: "field.secret",
            desc: l.trans({
              en: "Read only through a projection that names it.",
              ko: "이름을 적은 projection으로만 읽힙니다.",
            }),
            marks: {},
          },
        ],
      },
    ];

    const defaultColumns = [
      { key: "field", label: l.trans({ en: "Field", ko: "필드" }) },
      { key: "value", label: l.trans({ en: "Starts at", ko: "시작 값" }) },
    ];
    const defaultRows = [
      {
        field: "`field.hidden` · `field.secret`",
        value: l.trans({ en: "`null`, always.", ko: "항상 `null`입니다." }),
      },
      {
        field: "`default: () => …`",
        value: l.trans({
          en: "What the function returns, run again on each call.",
          ko: "함수의 반환값입니다. 호출마다 다시 실행합니다.",
        }),
      },
      {
        field: l.trans({ en: "An array field", ko: "배열 필드" }),
        value: l.trans({
          en: "A fresh copy of its `default`, or `[]` without one.",
          ko: "`default`를 새로 복사한 배열입니다. 없으면 `[]`입니다.",
        }),
      },
      {
        field: l.trans({ en: "Any other `default`", ko: "그 밖의 `default`" }),
        value: l.trans({
          en: "That value itself, shared by every object built from it.",
          ko: "그 값 자체입니다. 이 값으로 만든 객체가 모두 같은 값을 나눠 씁니다.",
        }),
      },
      {
        field: l.trans({ en: "`.optional()` with no `default`", ko: "`default` 없는 `.optional()`" }),
        value: "`null`",
      },
      {
        field: l.trans({ en: "An embedded scalar", ko: "넣어 둔 scalar" }),
        value: l.trans({ en: "That scalar's own default object.", ko: "그 scalar의 기본값 객체입니다." }),
      },
      {
        field: l.trans({ en: "A relation", ko: "relation" }),
        value: "`null`",
      },
      {
        field: l.trans({ en: "Any other type", ko: "그 밖의 타입" }),
        value: l.trans({
          en: 'The type\'s empty value, such as `""`, `0` or `false`.',
          ko: '타입의 빈 값입니다. 예: `""`, `0`, `false`',
        }),
      },
    ];

    const typeHelperRows = [
      {
        name: "DocumentModel<T>",
        desc: l.trans({
          en: "The stored shape. Relations become id strings, and a list of them `string[]`.",
          ko: "저장되는 모양입니다. relation은 id 문자열로, relation 목록은 `string[]`로 바뀝니다.",
        }),
        example: "type BannerDoc = DocumentModel<cnst.Banner>;",
      },
      {
        name: "DefaultOf<T>",
        desc: l.trans({
          en: "What `getDefault()` returns. Methods are dropped, and relation fields may be `null`.",
          ko: "`getDefault()`가 돌려주는 모양입니다. 메서드는 빠지고, relation 필드는 `null`일 수 있습니다.",
        }),
        example: "type BannerDefault = DefaultOf<cnst.Banner>;",
      },
      {
        name: "QueryOf<T>",
        desc: l.trans({
          en: "An opaque query descriptor, typed `any`. A slice's `exec` returns one.",
          ko: "안을 들여다볼 수 없는 query 값이며, 타입은 `any`입니다. slice의 `exec`가 이것을 돌려줍니다.",
        }),
        example: "type BannerQuery = QueryOf<BannerDoc>;",
      },
      {
        name: "PurifiedModel<T>",
        desc: l.trans({
          en: "What `purify` returns. Relations become ids; dates keep the `Dayjs` type.",
          ko: "`purify`가 돌려주는 모양입니다. relation은 id가 되고, 날짜는 `Dayjs` 타입 그대로입니다.",
        }),
      },
      {
        name: ["ProtoFile", "ProtoLightFile"],
        desc: l.trans({
          en: "The shape of a `File` and a `LightFile`, for UI code that takes a file prop.",
          ko: "`File`과 `LightFile`의 모양입니다. 파일을 prop으로 받는 UI 코드가 씁니다.",
        }),
      },
    ];

    const serializeRows = [
      {
        name: "serialize(ref, arrDepth, value, type?, opts)",
        desc: l.trans({
          en: 'Default `type` is `"object"`; `"input"` sends relations as ids. `opts` is `{ nullable?, key? }`.',
          ko: '`type`의 기본값은 `"object"`이고, `"input"`이면 relation을 id로 보냅니다. `opts`는 `{ nullable?, key? }`입니다.',
        }),
      },
      {
        name: "deserialize(ref, arrDepth, value, opts)",
        desc: l.trans({
          en: "`opts` is `{ nullable?, key?, enum?, convertFn? }`. With `enum`, a value outside it throws.",
          ko: "`opts`는 `{ nullable?, key?, enum?, convertFn? }`입니다. `enum`을 주면 목록에 없는 값은 에러를 던집니다.",
        }),
      },
      {
        name: ["ConstantRegistry.serialize", "ConstantRegistry.deserialize"],
        desc: l.trans({
          en: "The short form, `(ref, value, nullable?)`. Takes a primitive, `Map` or model; `[Ref]` for a list.",
          ko: "짧은 형태로, `(ref, value, nullable?)`를 받습니다. 목록이면 `[Ref]`를 넘기며, primitive, `Map`, 등록된 model을 다룹니다.",
        }),
      },
    ];

    const registryRows = [
      {
        name: "getRefName(Model)",
        desc: l.trans({
          en: "The model's refName. Throws for an unknown class unless `{ allowEmpty: true }` is given.",
          ko: "model의 refName입니다. 등록되지 않은 class면 `{ allowEmpty: true }`가 없는 한 에러를 던집니다.",
        }),
        example: 'ConstantRegistry.getRefName(cnst.Banner); // "banner"',
      },
      {
        name: "getModelName(Model)",
        desc: l.trans({
          en: "The class name for its role, such as `BannerInput` or `LightBanner`.",
          ko: "역할에 맞는 class 이름입니다. 예: `BannerInput`, `LightBanner`",
        }),
        example: 'ConstantRegistry.getModelName(cnst.LightBanner); // "LightBanner"',
      },
      {
        name: "getModelRef(refName, modelType?)",
        desc: l.trans({
          en: 'The class for a refName and role. With no role it finds a primitive such as `"Int"`.',
          ko: 'refName과 역할에 맞는 class입니다. 역할을 빼면 `"Int"` 같은 primitive를 찾습니다.',
        }),
        example: 'ConstantRegistry.getModelRef("banner", "light");',
      },
      {
        name: ["getDatabase(refName)", "getScalar(refName)"],
        desc: l.trans({
          en: "A module's registered entry: its five classes, or a scalar's one. Throws unless `allowEmpty`.",
          ko: "등록된 모듈 항목입니다. model은 다섯 class, scalar는 class 하나를 담습니다. `allowEmpty`가 없으면 에러를 던집니다.",
        }),
      },
      {
        name: "has(Model)",
        desc: l.trans({ en: "Whether the class is registered.", ko: "그 class가 등록되어 있는지 알려 줍니다." }),
      },
      {
        name: ["isFull", "isLight", "isObject", "isInsight", "isScalar"],
        desc: l.trans({ en: "Which role a class plays.", ko: "class가 어떤 역할인지 확인합니다." }),
      },
      {
        name: ["serialize", "deserialize"],
        desc: l.trans({
          en: "The short forms from the `serialize` / `deserialize` section above.",
          ko: "위의 `serialize` / `deserialize` 절에서 설명한 짧은 형태입니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="akanjs-constant" title="akanjs/constant">
          <Docs.Title>akanjs/constant</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>akanjs/constant</code> is Akan's schema layer. Every <code>.constant.ts</code> file is built
                    from two of its exports: <code>via</code>, which declares a class, and <code>field</code>, the
                    builder <code>via</code> hands you.
                  </span>
                ),
                ko: (
                  <span>
                    <code>akanjs/constant</code>는 Akan의 스키마 층입니다. 모든 <code>.constant.ts</code> 파일은 이
                    패키지의 export 두 개로 만듭니다. class를 선언하는 <code>via</code>, 그리고 <code>via</code>가 넘겨
                    주는 builder <code>field</code>입니다.
                  </span>
                ),
              })}
            </div>
            <code className={chip}>{'import { via } from "akanjs/constant";'}</code>
            <div>
              {l.trans({
                en: (
                  <span>
                    Everything else supports those two. From <code>getDefault</code> on, the entries are helpers you
                    mostly read rather than call.
                  </span>
                ),
                ko: (
                  <span>
                    나머지는 모두 그 둘을 돕는 도구입니다. <code>getDefault</code>부터는 직접 호출하기보다 읽게 되는
                    helper입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Export", ko: "export" })} items={exportRows} />

            <Docs.SubSubTitle>
              {l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

            <Docs.SubSubTitle>
              {l.trans({ en: "The Five Classes of a Module", ko: "모듈 하나를 이루는 다섯 class" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A database module declares these five classes, always in this order. The banner module is the example throughout this page:",
                ko: "데이터베이스 모듈은 아래 다섯 class를 항상 이 순서로 선언합니다. 이 페이지는 banner 모듈을 예로 듭니다:",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Class", ko: "class" })} items={classRows} />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The order is fixed.</strong> <code>enumOf</code> classes go on top, then Input, Object,
                      Light, full and Insight. Write the Insight class even when it is empty.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>순서는 정해져 있습니다.</strong> 맨 위에 <code>enumOf</code> class를 두고, 그 아래로
                      Input, Object, Light, full, Insight 순서로 씁니다. Insight class는 비어 있어도 작성합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Shared logic goes on Light.</strong> The server and the client both hold the Light class,
                      so <code>isNew()</code> or <code>canWrite(user)</code> belongs there, not in a util module.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>공유 로직은 Light에 둡니다.</strong> 서버와 클라이언트가 모두 Light class를 갖고 있으므로{" "}
                      <code>isNew()</code>나 <code>canWrite(user)</code>는 util 모듈이 아니라 여기에 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A scalar is a single class.</strong> <code>{"via((field) => ({ … }))"}</code> alone
                      declares it. It lives under <code>{"lib/__scalar/<name>/"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>scalar는 class 하나입니다.</strong> <code>{"via((field) => ({ … }))"}</code> 하나로
                      선언하며, 위치는 <code>{"lib/__scalar/<name>/"}</code>입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="via" title="via">
          <Docs.Title>via</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>via</code> is one overloaded function, not a namespace: there is no <code>via.model</code> or{" "}
                    <code>via.scalar</code>. What you pass decides which class you get.
                  </span>
                ),
                ko: (
                  <span>
                    <code>via</code>는 namespace가 아니라 overload된 함수 하나입니다. <code>via.model</code>이나{" "}
                    <code>via.scalar</code>는 없고, 넘기는 인자가 어떤 class가 될지 정합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table columns={viaColumns} rows={viaRows} stacked />
            <div>
              {l.trans({
                en: (
                  <span>
                    The banner module from <code>libs/shared</code>, shortened:
                  </span>
                ),
                ko: (
                  <span>
                    <code>libs/shared</code>의 banner 모듈을 줄인 것입니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/banner/banner.constant.ts"
            language="typescript"
            code={`import { dayjs, enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

import { File } from "../file/file.constant";

export class BannerStatus extends enumOf("bannerStatus", ["active", "displaying"] as const) {}

export class BannerInput extends via((field) => ({
  title: field(String, { text: "title" }).optional(),
  image: field(File, { text: "thumb" }).optional(),
  href: field(String),
  from: field(Date, { default: () => dayjs() }),
})) {}

export class BannerObject extends via(BannerInput, (field) => ({
  status: field(BannerStatus, { default: "active", text: "filter" }),
})) {}

export class LightBanner extends via(
  BannerObject,
  ["title", "image", "href", "status"] as const,
  (resolve) => ({}),
) {}

export class Banner extends via(BannerObject, LightBanner, (resolve) => ({})) {}

export class BannerInsight extends via(Banner, (field) => ({})) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The callback's parameter names the builder.</strong> Input, Object and Insight get{" "}
                      <code>field</code>. Light and full get <code>resolve</code>, because they only add computed
                      fields.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>callback의 매개변수가 builder를 알려 줍니다.</strong> Input, Object, Insight는{" "}
                      <code>field</code>를 받습니다. Light와 full은 계산 필드만 더하므로 <code>resolve</code>를
                      받습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Write the Light tuple <code>as const</code>.
                      </strong>{" "}
                      The field names Light picks are always a literal tuple.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        Light의 필드 목록에는 <code>as const</code>를 붙입니다.
                      </strong>{" "}
                      Light가 고르는 필드 이름은 항상 리터럴 튜플로 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Pass a lib's class last to extend it.</strong> Every form takes more classes after its own
                      arguments, so an app adds fields to a lib's model by passing the lib's class at the end.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>lib의 class를 확장하려면 맨 뒤에 넘깁니다.</strong> 모든 형태가 제 인자 뒤에 class를 더
                      받으므로, 앱은 lib model의 class를 끝에 넘겨 필드를 더합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="field" title="field">
          <Docs.Title>field</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>field</code> is the builder <code>via</code> hands to Input, Object and Insight callbacks.
                    Each call declares one stored field: the type first, the options second.
                  </span>
                ),
                ko: (
                  <span>
                    <code>field</code>는 <code>via</code>가 Input, Object, Insight callback에 넘겨 주는 builder입니다.
                    한 번 부를 때마다 저장되는 필드 하나를 선언하며, 타입을 먼저, 옵션을 그다음에 씁니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "Types", ko: "타입 쓰는 법" })}</Docs.SubSubTitle>
            <Docs.Table columns={typeColumns} rows={typeRows} stacked />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A number is <code>Int</code> or <code>Float</code>.
                      </strong>{" "}
                      <code>field(Number)</code> does not typecheck.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        숫자는 <code>Int</code>나 <code>Float</code>로 씁니다.
                      </strong>{" "}
                      <code>field(Number)</code>는 타입 검사를 통과하지 못합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Bytes are never a field.</strong> <code>Binary</code> and <code>Upload</code> belong to
                      signals; store a file as <code>field(File)</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>바이트는 필드가 될 수 없습니다.</strong> <code>Binary</code>와 <code>Upload</code>는
                      signal에서만 씁니다. 파일은 <code>field(File)</code>로 저장합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: "A product input that uses most of them:",
                ko: "이 중 대부분을 쓰는 product input입니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/product/product.constant.ts"
            language="typescript"
            code={`import { Any, enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import { File } from "../file/file.constant";

export class ProductStatus extends enumOf("productStatus", ["draft", "onSale"] as const) {}

export class ProductInput extends via((field) => ({
  name: field(String, { minlength: 2, maxlength: 80, text: "title" }),
  price: field(Int, {
    default: 0,
    min: 0,
    validate: (price) => (price ?? 0) >= 0,
  }),
  tags: field([String], { text: "tag" }),
  cover: field(File, { cascade: "removeRef" }).optional(),
  status: field(ProductStatus, { default: "draft" }),
  spec: field<{ weightG: number }>(Any, { default: () => ({ weightG: 0 }) }),
})) {}`}
          />
          <Docs.Description>
            <Docs.SubSubTitle>{l.trans({ en: "Options", ko: "옵션" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The second argument is an options object. <code>nullable</code>, <code>select</code>,{" "}
                    <code>enum</code> and <code>meta</code> are not options: <code>.optional()</code>,{" "}
                    <code>field.secret</code>, the <code>enumOf</code> type and <code>.meta()</code> set them.
                  </span>
                ),
                ko: (
                  <span>
                    두 번째 인자는 옵션 객체입니다. <code>nullable</code>, <code>select</code>, <code>enum</code>,{" "}
                    <code>meta</code>는 옵션으로 쓰지 않습니다. <code>.optional()</code>, <code>field.secret</code>,{" "}
                    <code>enumOf</code> 타입, <code>.meta()</code>가 대신 정합니다.
                  </span>
                ),
              })}
            </div>
            <div className={groupLabel}>{l.trans({ en: "Value and Checks", ko: "값과 검사" })}</div>
            <Docs.OptionTable items={valueOptionRows} />
            <div className={groupLabel}>{l.trans({ en: "Search and Relations", ko: "검색과 relation" })}</div>
            <Docs.OptionTable items={linkOptionRows} />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>text</code> needs a string.
                      </strong>{" "}
                      <code>title</code>, <code>desc</code> and <code>tag</code> take <code>String</code>;{" "}
                      <code>thumb</code> and <code>filter</code> also take an <code>ID</code> or a relation. A{" "}
                      <code>Map</code> or a nested array takes no role.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>text</code>는 문자열 필드에 씁니다.
                      </strong>{" "}
                      <code>title</code>, <code>desc</code>, <code>tag</code>는 <code>String</code>만 받고,{" "}
                      <code>thumb</code>와 <code>filter</code>는 <code>ID</code>나 relation도 받습니다. <code>Map</code>
                      과 중첩 배열에는 역할을 줄 수 없습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>cascade</code> names a direction.
                      </strong>{" "}
                      <code>removeRef</code> goes on the owner's relation, <code>removeWith</code> on the child's
                      reference to its owner. The wrong one removes the wrong documents.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>cascade</code>의 값은 방향입니다.
                      </strong>{" "}
                      <code>removeRef</code>는 주인 쪽 relation에, <code>removeWith</code>는 자식이 주인을 가리키는
                      필드에 씁니다. 방향을 틀리면 엉뚱한 문서가 지워집니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div className={groupLabel}>{l.trans({ en: "Docs and Samples Only", ko: "문서와 샘플 전용" })}</div>
            <div>
              {l.trans({
                en: (
                  <span>
                    These describe the field for the schema docs, the API explorer and <code>sampleOf()</code>. Nothing
                    enforces them, so put a rule that must hold in <code>validate</code>.
                  </span>
                ),
                ko: (
                  <span>
                    스키마 문서, API explorer, <code>sampleOf()</code>에 필드를 설명하는 옵션입니다. 값을 막지는
                    않으므로, 반드시 지켜야 하는 규칙은 <code>validate</code>에 둡니다.
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={docOptionRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Chained Methods", ko: "이어 붙이는 메서드" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={chainRows} />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Give a per-record default as a function.</strong> <code>default: dayjs()</code> freezes the
                    moment the module loaded, and a literal <code>{"{}"}</code> is one object every record shares. Write{" "}
                    <code>{"() => dayjs()"}</code> and <code>{"() => ({})"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>레코드마다 달라야 하는 default는 함수로 줍니다.</strong> <code>default: dayjs()</code>는
                    모듈을 불러온 시각에 고정되고, 리터럴 <code>{"{}"}</code>는 모든 레코드가 나눠 쓰는 객체 하나입니다.{" "}
                    <code>{"() => dayjs()"}</code>, <code>{"() => ({})"}</code>로 씁니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="field.visual-field.hidden-field.secret" title="field.visual / field.hidden / field.secret">
          <Docs.Title>field.visual / field.hidden / field.secret</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Three variants of <code>field</code>. All three are stored like any other field; they differ only in
                    where the value can go afterwards. Below, Read is a server read with no projection, and Draft is the
                    saved form draft.
                  </span>
                ),
                ko: (
                  <span>
                    <code>field</code>의 변형 세 가지입니다. 셋 다 보통 필드처럼 저장되고, 저장한 값이 어디까지 갈 수
                    있는지만 다릅니다. 아래 표의 조회는 projection 없는 서버 조회, 초안은 저장해 둔 폼 초안입니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Field", ko: "필드" })}
              columns={maskColumns}
              groups={maskGroups}
              markLabel={l.trans({ en: "The value can reach it", ko: "값이 닿을 수 있음" })}
              emptyLabel={l.trans({ en: "Never reaches it", ko: "닿지 않음" })}
            />
            <div>
              {l.trans({
                en: "A profile with one of each:",
                ko: "하나씩 모두 쓴 profile입니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/profile/profile.constant.ts"
            language="typescript"
            code={`import { via } from "akanjs/constant";

export class ProfileInput extends via((field) => ({
  nickname: field(String, { text: "title" }),
  renderedBio: field.visual(String).optional(),
  loginProvider: field.hidden(String),
  password: field.secret(String, { type: "password", minlength: 8 }).optional(),
})) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>visual is about cost, not secrecy.</strong> A blur placeholder or a rendered HTML body is
                      data the screen needs but no question is answered from. Storage, search, forms and the page are
                      untouched.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>visual은 비밀이 아니라 비용의 문제입니다.</strong> blur placeholder나 렌더링한 HTML 본문은
                      화면에는 필요하지만 에이전트가 질문에 답하는 데는 쓰이지 않습니다. 저장, 검색, 폼, 페이지는 그대로
                      동작합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>hidden still claims to be a string.</strong> Its type says <code>string</code>, unlike
                      secret's <code>string | null</code>, yet the client reads <code>null</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>hidden의 타입은 여전히 string입니다.</strong> 타입에 <code>null</code>이 들어 있는
                      secret과 달리 <code>string</code>으로 적혀 있지만, 클라이언트는 <code>null</code>을 읽습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>secret is not even loaded.</strong> Only a projection that names it reads it, as in{" "}
                      <code>{"pickById(id, { password: true })"}</code>, and then only the named fields come back. The
                      endpoint response leaves it out even then.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>secret은 조회조차 되지 않습니다.</strong>{" "}
                      <code>{"pickById(id, { password: true })"}</code>
                      처럼 이름을 적은 projection으로만 읽히며, 이때는 적은 필드만 돌아옵니다. 그렇게 읽어도 endpoint
                      응답에서는 빠집니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Neither takes a <code>text</code> role.
                      </strong>{" "}
                      The search index is plaintext, so <code>text</code> on hidden or secret is a type error.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        hidden과 secret에는 <code>text</code> 역할을 줄 수 없습니다.
                      </strong>{" "}
                      검색 색인은 평문이므로 둘에 <code>text</code>를 쓰면 타입 에러가 납니다.
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
                      Guard hidden and secret values with <code>??</code> or <code>== null</code>.
                    </strong>{" "}
                    On the client the key is present and <code>null</code>, so <code>=== undefined</code>, a
                    destructuring default and an optional-parameter default all miss it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      hidden과 secret 값은 <code>??</code>나 <code>== null</code>로 확인합니다.
                    </strong>{" "}
                    클라이언트에서는 key가 있고 값이 <code>null</code>이므로, <code>=== undefined</code>, 구조 분해
                    default, 선택 매개변수 default로는 걸러지지 않습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="resolve" title="resolve">
          <Docs.Title>resolve</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>resolve</code> is the builder Light and full callbacks receive. It declares a field that is
                    never stored: the server computes it each time it builds a response.
                  </span>
                ),
                ko: (
                  <span>
                    <code>resolve</code>는 Light와 full callback이 받는 builder입니다. 저장하지 않는 필드를 선언하며,
                    서버가 응답을 만들 때마다 값을 계산합니다.
                  </span>
                ),
              })}
            </div>
            <div>{l.trans({ en: "Declare it on the model:", ko: "먼저 model에 선언합니다:" })}</div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/order/order.constant.ts"
            language="typescript"
            code={`import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class Order extends via(OrderObject, LightOrder, (resolve) => ({
  totalPrice: resolve(Int),
})) {}`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Then compute it with a <code>resolveField</code> of the same name in the module's Internal class. It
                    receives the stored order, here one with <code>unitPrice</code> and <code>quantity</code> fields:
                  </span>
                ),
                ko: (
                  <span>
                    그다음 모듈의 Internal class에 같은 이름의 <code>resolveField</code>를 두어 계산합니다. 저장된 order
                    문서가 인자로 들어오며, 여기서는 <code>unitPrice</code>와 <code>quantity</code> 필드가 있다고
                    가정합니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/order/order.signal.ts"
            language="typescript"
            code={`import { Int } from "akanjs/base";
import { internal } from "akanjs/signal";

import * as srv from "../srv";

export class OrderInternal extends internal(srv.order, ({ resolveField }) => ({
  totalPrice: resolveField(Int).exec(function (order) {
    return order.unitPrice * order.quantity;
  }),
})) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Every <code>resolve</code> field needs its <code>resolveField</code>.
                      </strong>{" "}
                      The Internal's type lists each one, so leaving one out fails the typecheck.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>resolve</code> 필드마다 <code>resolveField</code>가 있어야 합니다.
                      </strong>{" "}
                      Internal의 타입이 resolve 필드를 모두 요구하므로, 하나라도 빠지면 타입 검사에서 막힙니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Optional on both sides.</strong> <code>resolve(Int).optional()</code> pairs with{" "}
                      <code>{"resolveField(Int, { nullable: true })"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>optional은 양쪽에 함께 씁니다.</strong> <code>resolve(Int).optional()</code>에는{" "}
                      <code>{"resolveField(Int, { nullable: true })"}</code>가 짝입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>this</code> reaches the services.
                      </strong>{" "}
                      Write <code>exec</code> with a <code>function</code>, as in an endpoint, and call{" "}
                      <code>this.orderService</code> when the value needs a lookup.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>this</code>로 service를 부릅니다.
                      </strong>{" "}
                      endpoint처럼 <code>exec</code>를 <code>function</code>으로 쓰면, 조회가 필요할 때{" "}
                      <code>this.orderService</code>를 호출할 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        No <code>text</code> role.
                      </strong>{" "}
                      A computed value is never in the search index, so <code>resolve</code> does not accept one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>text</code> 역할은 없습니다.
                      </strong>{" "}
                      계산한 값은 검색 색인에 들어가지 않으므로 <code>resolve</code>는 이 옵션을 받지 않습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="getDefault" title="getDefault">
          <Docs.Title>getDefault</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>getDefault</code> builds the blank object a new record or form starts from. You usually call
                    it through the model as <code>Model.getDefault()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>getDefault</code>는 새 레코드나 폼이 시작하는 빈 객체를 만듭니다. 보통은 model을 통해{" "}
                    <code>Model.getDefault()</code>로 부릅니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table columns={defaultColumns} rows={defaultRows} stacked />
            <div>
              {l.trans({
                en: "Both ways of calling it, in a test:",
                ko: "두 가지 호출 방법을 테스트로 보면 다음과 같습니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/banner/banner.test.ts"
            language="typescript"
            code={`import { expect, test } from "bun:test";
import { FIELD_META } from "akanjs/base";
import { getDefault } from "akanjs/constant";

import * as cnst from "../cnst";

test("a new banner starts active", () => {
  expect(cnst.Banner.getDefault().status).toBe("active");
  expect(getDefault<cnst.Banner>(cnst.Banner[FIELD_META]).status).toBe("active");
});`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>Model.getDefault()</code> is built once.
                      </strong>{" "}
                      The first call builds the object and later calls return a shallow copy, so a{" "}
                      <code>{"() => dayjs()"}</code> default keeps its first value there.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Model.getDefault()</code>는 한 번만 만듭니다.
                      </strong>{" "}
                      첫 호출에서 객체를 만들고 이후에는 얕은 복사본을 돌려줍니다. 그래서 여기서는{" "}
                      <code>{"() => dayjs()"}</code> default도 첫 값 그대로입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The field map runs every function again.</strong>{" "}
                      <code>getDefault(Model[FIELD_META])</code> calls each <code>default</code> function on every call.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>field map으로 부르면 함수를 매번 다시 실행합니다.</strong>{" "}
                      <code>getDefault(Model[FIELD_META])</code>는 호출할 때마다 <code>default</code> 함수를 모두
                      실행합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="DocumentModel-DefaultOf-QueryOf" title="DocumentModel / DefaultOf / QueryOf">
          <Docs.Title>DocumentModel / DefaultOf / QueryOf</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Type helpers that documents, stores and tests use to name a model's other shapes. Import them as types only:",
                ko: "document, store, test에서 model의 다른 모양을 가리킬 때 쓰는 타입입니다. 타입으로만 import합니다:",
              })}
            </div>
            <code className={chip}>
              {'import type { DefaultOf, DocumentModel, PurifiedModel, QueryOf } from "akanjs/constant";'}
            </code>
            <Docs.IntroTable type={l.trans({ en: "Type", ko: "타입" })} items={typeHelperRows} />
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A <code>QueryOf</code> does not chain.
                    </strong>{" "}
                    You cannot call <code>.sort()</code> or <code>.limit()</code> on what a slice returns. Pass{" "}
                    <code>{"{ sort, page, limit }"}</code> to the store's <code>init</code> fetch instead.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>QueryOf</code>에는 메서드를 이어 붙일 수 없습니다.
                    </strong>{" "}
                    slice가 돌려준 값에 <code>.sort()</code>나 <code>.limit()</code>를 부를 수 없습니다. 대신 store의{" "}
                    <code>init</code> fetch에 <code>{"{ sort, page, limit }"}</code>를 넘깁니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="crystalize-purify" title="crystalize / purify">
          <Docs.Title>crystalize / purify</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "These two move a value between raw data and a model instance, in opposite directions. You reach them through the model rather than by name.",
                ko: "이 둘은 원시 데이터와 model 인스턴스 사이에서 값을 서로 반대 방향으로 옮깁니다. 이름으로 부르기보다 model을 통해 씁니다.",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={card}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "crystalize — raw to model", ko: "crystalize — 원시 값에서 model로" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        Converts one field's raw value: a date string to <code>Dayjs</code>, a nested object to its
                        class. The constructor and <code>set()</code> use the same converters.
                      </span>
                    ),
                    ko: (
                      <span>
                        필드 하나의 원시 값을 바꿉니다. 날짜 문자열은 <code>Dayjs</code>로, 중첩 객체는 그 class로
                        바뀝니다. 생성자와 <code>set()</code>도 같은 변환기를 씁니다.
                      </span>
                    ),
                  })}
                </div>
                <code className={chip}>crystalize(field.getProps(), value)</code>
              </div>
              <div className={card}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "purify — model to plain", ko: "purify — model에서 일반 객체로" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        Checks every field (required, enum, <code>validate</code>, array length) and turns relations
                        into ids. Returns <code>null</code> when a check fails.
                      </span>
                    ),
                    ko: (
                      <span>
                        모든 필드를 검사하고(필수 값, enum, <code>validate</code>, 배열 길이) relation을 id로 바꿉니다.
                        검사에 실패하면 <code>null</code>을 돌려줍니다.
                      </span>
                    ),
                  })}
                </div>
                <code className={chip}>Model.purify(value) · makePurify(Model)</code>
              </div>
            </div>
            <div>
              {l.trans({
                en: "In practice you build with the constructor and check with the model's purify:",
                ko: "실제로는 생성자로 만들고, model의 purify로 검사합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/banner/banner.test.ts"
            language="typescript"
            code={`import { expect, test } from "bun:test";
import { dayjs } from "akanjs/base";

import * as cnst from "../cnst";

test("a banner needs an href to purify", () => {
  const banner = new cnst.BannerInput({ from: dayjs() });
  expect(cnst.BannerInput.purify(banner)).toBeNull();
  banner.set({ href: "/sale" });
  expect(cnst.BannerInput.purify(banner)?.href).toBe("/sale");
});`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>purify</code> is not a named export.
                      </strong>{" "}
                      Every class carries it as the static <code>Model.purify</code>; <code>makePurify(Model)</code>{" "}
                      builds the same function.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>purify</code>는 이름으로 export되지 않습니다.
                      </strong>{" "}
                      모든 class가 static <code>Model.purify</code>로 갖고 있고, <code>makePurify(Model)</code>가 같은
                      함수를 만듭니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>An empty required string fails.</strong> A required <code>String</code> or <code>ID</code>{" "}
                      left at <code>""</code> does not pass, which is why the first <code>purify</code> above is{" "}
                      <code>null</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>빈 문자열인 필수 필드는 통과하지 못합니다.</strong> 필수 <code>String</code>이나{" "}
                      <code>ID</code>가 <code>""</code> 그대로면 실패하므로, 위의 첫 <code>purify</code>는{" "}
                      <code>null</code>입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The store runs it before it sends.</strong> A generated create or update action purifies
                      the form with the Input class and sends nothing when the result is <code>null</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>store는 보내기 전에 purify를 거칩니다.</strong> 생성된 create·update action은 Input
                      class로 폼을 purify하고, 결과가 <code>null</code>이면 아무것도 보내지 않습니다.
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
                      Copy a model with <code>new cnst.X().set(x)</code>, never a spread.
                    </strong>{" "}
                    Date fields are accessors on the prototype, so <code>{"{ ...banner }"}</code> and{" "}
                    <code>Object.keys(banner)</code> leave them out.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      model은 전개 연산자가 아니라 <code>new cnst.X().set(x)</code>로 복사합니다.
                    </strong>{" "}
                    날짜 필드는 prototype의 accessor라서 <code>{"{ ...banner }"}</code>와{" "}
                    <code>Object.keys(banner)</code>
                    에는 빠집니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="serialize-deserialize" title="serialize / deserialize">
          <Docs.Title>serialize / deserialize</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "These convert between runtime values and the payload that crosses a document or transport boundary.",
                ko: "런타임 값과, document나 전송 경계를 넘는 payload 사이를 변환합니다.",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
              <div className={card}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "serialize — runtime to payload", ko: "serialize — 런타임 값에서 payload로" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        Walks the model's fields: <code>Dayjs</code> becomes <code>Date</code>, and a <code>Map</code>{" "}
                        becomes a plain object.
                      </span>
                    ),
                    ko: (
                      <span>
                        model의 필드를 따라가며 <code>Dayjs</code>는 <code>Date</code>로, <code>Map</code>은 일반 객체로
                        바꿉니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
              <div className={card}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "deserialize — payload to runtime", ko: "deserialize — payload에서 런타임 값으로" })}
                </div>
                <div className="text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        Parses each primitive, so a date string becomes <code>Dayjs</code>, and goes into embedded
                        scalars.
                      </span>
                    ),
                    ko: (
                      <span>
                        primitive를 하나씩 해석해 날짜 문자열을 <code>Dayjs</code>로 바꾸고, 안에 넣은 scalar까지 따라
                        들어갑니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
            </div>
            <Docs.IntroTable type={l.trans({ en: "Call", ko: "호출" })} items={serializeRows} />
            <div>
              {l.trans({
                en: "A date on its way out and back:",
                ko: "날짜 하나가 나갔다가 돌아오는 모습입니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/banner/banner.test.ts"
            language="typescript"
            code={`import { expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { ConstantRegistry } from "akanjs/constant";

test("a date crosses as Date and comes back as Dayjs", () => {
  const sent = ConstantRegistry.serialize(Date, dayjs("2026-09-24"));
  expect(sent instanceof Date).toBe(true);
  expect(dayjs.isDayjs(ConstantRegistry.deserialize(Date, sent))).toBe(true);
});`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        To <code>deserialize</code>, a database model is a relation.
                      </strong>{" "}
                      Only primitives and scalars are converted; a model's value comes back as given. Build the instance
                      with <code>new cnst.X(value)</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>deserialize</code>는 데이터베이스 model을 relation으로 봅니다.
                      </strong>{" "}
                      primitive와 scalar만 변환하고, model의 값은 받은 그대로 돌려줍니다. 인스턴스는{" "}
                      <code>new cnst.X(value)</code>로 만듭니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A missing required value throws.</strong> Both refuse <code>null</code> and{" "}
                      <code>undefined</code> unless <code>nullable</code> is set or the type is <code>Any</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>필수 값이 없으면 에러를 던집니다.</strong> <code>nullable</code>이 없고 타입도{" "}
                      <code>Any</code>가 아니면, 둘 다 <code>null</code>과 <code>undefined</code>를 거부합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="ConstantRegistry" title="ConstantRegistry">
          <Docs.Title>ConstantRegistry</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>ConstantRegistry</code> ties model classes to their refName at runtime. Every module's
                    classes, its scalars and its enums are registered here.
                  </span>
                ),
                ko: (
                  <span>
                    <code>ConstantRegistry</code>는 런타임에 model class와 refName을 이어 줍니다. 모든 모듈의 class,
                    scalar, enum이 여기에 등록됩니다.
                  </span>
                ),
              })}
            </div>
            <code className={chip}>{'import { ConstantRegistry } from "akanjs/constant";'}</code>
            <Docs.IntroTable type={l.trans({ en: "Static method", ko: "static 메서드" })} items={registryRows} />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
