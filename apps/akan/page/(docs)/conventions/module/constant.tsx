import { usePage } from "@apps/akan/client";
import {
  Code,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type OptionItem,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const termRows: IntroItem[] = [
    {
      name: "document",
      desc: l.trans({
        en: "One stored record of a model, such as one ticket.",
        ko: "티켓 하나처럼, 저장된 모델 레코드 한 건입니다. 이 페이지에서는 도큐먼트라고 부릅니다.",
      }),
    },
    {
      name: "relation",
      desc: l.trans({
        en: "A field whose type is another model, like `File`. It stores the id and loads the model.",
        ko: "타입이 다른 모델(예: `File`)인 필드로, 이 페이지에서는 관계 필드라고 부릅니다. id를 저장하고 읽을 때 모델을 불러옵니다.",
      }),
    },
    {
      name: "scalar",
      desc: l.trans({
        en: "A value object declared under `lib/__scalar/`, stored inside the document, not as its own row.",
        ko: "`lib/__scalar/` 아래에 선언한 값 객체(스칼라)입니다. 따로 행을 두지 않고 도큐먼트 안에 저장됩니다.",
      }),
    },
    {
      name: "hydrate",
      desc: l.trans({
        en: "Turning fetched plain data back into a model instance, with its methods and `Dayjs` dates.",
        ko: "가져온 평범한 데이터를 메서드와 `Dayjs` 날짜를 갖춘 모델 인스턴스로 되살리는 일입니다.",
      }),
    },
    {
      name: "projection",
      desc: l.trans({
        en: "A read option naming extra fields to load, such as `{ secret: true }`.",
        ko: "`{ secret: true }`처럼, 기본으로는 읽지 않는 필드를 더 읽어 오라는 읽기 옵션입니다.",
      }),
    },
    {
      name: "agent",
      desc: l.trans({
        en: "An AI caller: the in-page agent or an MCP client.",
        ko: "AI 호출자입니다. 인페이지 에이전트와 MCP 클라이언트를 함께 이릅니다.",
      }),
    },
  ];

  const layerRows: IntroItem[] = [
    {
      name: "TicketInput",
      desc: l.trans({
        en: "Fields a user fills in when creating or editing the model.",
        ko: "사용자가 모델을 만들거나 고칠 때 채우는 필드입니다.",
      }),
      example: "via((field) => ({ … }))",
    },
    {
      name: "TicketObject",
      desc: l.trans({
        en: "Input plus stored fields that the system or a service manages.",
        ko: "Input에 시스템이나 service가 관리하는 저장 필드를 더한 것입니다.",
      }),
      example: "via(TicketInput, (field) => ({ … }))",
    },
    {
      name: "LightTicket",
      desc: l.trans({
        en: "The few fields a list, a relation or a card returns. Server and client both hold it.",
        ko: "목록, 관계 필드, 카드가 돌려주는 일부 필드입니다. 서버와 클라이언트가 모두 들고 있습니다.",
      }),
      example: 'via(TicketObject, ["title", "status"] as const, (resolve) => ({}))',
    },
    {
      name: "Ticket",
      desc: l.trans({
        en: "The full model: Object and Light combined. Collection helpers go here as statics.",
        ko: "Object와 Light를 합친 전체 모델입니다. 목록 단위 헬퍼는 여기에 static으로 둡니다.",
      }),
      example: "via(TicketObject, LightTicket, (resolve) => ({}))",
    },
    {
      name: "TicketInsight",
      desc: l.trans({
        en: "Counters for dashboards. It always has `count`, and you write it even when it is empty.",
        ko: "대시보드용 카운터입니다. `count`는 늘 들어 있고, 비어 있어도 클래스는 씁니다.",
      }),
      example: "via(Ticket, (field) => ({ … }))",
    },
  ];

  const typeRows: IntroItem[] = [
    {
      name: ["String", "Boolean", "Date"],
      desc: l.trans({
        en: "JavaScript globals, so no import. A `Date` field reads back as a `Dayjs`.",
        ko: "JavaScript 전역이라 import가 필요 없습니다. `Date` 필드는 읽을 때 `Dayjs`로 나옵니다.",
      }),
    },
    {
      name: ["Int", "Float"],
      desc: l.trans({
        en: "Whole and decimal numbers from `akanjs/base`. `Number` does not typecheck as a field type.",
        ko: "`akanjs/base`의 정수와 소수입니다. `Number`를 필드 타입으로 쓰면 타입 검사에서 막힙니다.",
      }),
    },
    {
      name: "ID",
      desc: l.trans({
        en: "Another document's id. Name the model it points at with the `ref` option.",
        ko: "다른 도큐먼트의 id입니다. 가리키는 모델은 `ref` 옵션으로 적습니다.",
      }),
    },
    {
      name: "Any",
      desc: l.trans({
        en: "A free-form payload. Use it only when the content really is open.",
        ko: "형식이 자유로운 값입니다. 내용이 정말로 정해져 있지 않을 때만 씁니다.",
      }),
    },
    {
      name: "TicketStatus",
      desc: l.trans({
        en: "An `enumOf` class. The stored value must be one of its values.",
        ko: "`enumOf` 클래스입니다. 저장되는 값은 그 목록 중 하나여야 합니다.",
      }),
    },
    {
      name: "[T]",
      desc: l.trans({
        en: "An array of any type on this list. It defaults to `[]`.",
        ko: "이 표에 있는 타입의 배열입니다. 기본값은 `[]`입니다.",
      }),
    },
    {
      name: "Map",
      desc: l.trans({
        en: "A string-keyed map. The `of` option names the value type and is required.",
        ko: "문자열 key의 Map입니다. 값 타입은 `of` 옵션으로 반드시 적습니다.",
      }),
    },
    {
      name: "Coordinate",
      desc: l.trans({
        en: "A scalar class: a value object embedded in the document.",
        ko: "스칼라 클래스입니다. 도큐먼트 안에 들어가는 값 객체입니다.",
      }),
    },
    {
      name: "File",
      desc: l.trans({
        en: "A model class, which makes the field a relation. It stores the id.",
        ko: "모델 클래스이므로 관계 필드가 됩니다. id를 저장합니다.",
      }),
    },
    {
      name: ["Binary", "Upload"],
      desc: l.trans({
        en: "Never a model field. Store bytes by referencing the `File` model instead.",
        ko: "모델 필드가 될 수 없습니다. 바이트는 `File` 모델을 참조해 저장합니다.",
      }),
    },
  ];

  const valueOptions: OptionItem[] = [
    {
      key: "default",
      type: "T | (doc) => T",
      default: l.trans({ en: "[] for an array, else null", ko: "배열이면 [], 아니면 null" }),
      desc: l.trans({
        en: "A literal for a plain value, a thunk such as `() => dayjs()` for anything constructed.",
        ko: "단순한 값은 리터럴로, 새로 만들어야 하는 값은 `() => dayjs()` 같은 thunk로 씁니다.",
      }),
    },
    {
      key: "ref",
      type: "string",
      desc: l.trans({
        en: "The model an `ID` field points at, when you store an id instead of a relation.",
        ko: "관계 필드 대신 id를 저장할 때, 그 `ID` 필드가 가리키는 모델입니다.",
      }),
    },
    {
      key: "refPath",
      type: "string",
      desc: l.trans({
        en: "The field holding a polymorphic owner's model name: an `enumOf`, or a `String` for `removeWithAny`.",
        ko: "소유자가 여러 모델 중 하나일 때, 그 모델 이름을 담은 옆 필드입니다. 보통 `enumOf`이고 `removeWithAny`일 때만 `String`입니다.",
      }),
    },
    {
      key: "of",
      type: l.trans({ en: "scalar or model class", ko: "스칼라나 모델 클래스" }),
      desc: l.trans({
        en: "The value type of a `Map` field. Required for a Map.",
        ko: "`Map` 필드의 값 타입입니다. Map에는 반드시 적습니다.",
      }),
    },
    {
      key: "refType",
      type: '"child" | "parent" | "relation"',
      desc: l.trans({
        en: "A label for the kind of relation, shown in the schema docs. It changes no behavior.",
        ko: "관계의 종류를 스키마 문서에 표시하는 라벨입니다. 동작은 바꾸지 않습니다.",
      }),
    },
  ];

  const reachOptions: OptionItem[] = [
    {
      key: "text",
      type: '"title" | "desc" | "tag" | "thumb" | "filter"',
      desc: l.trans({
        en: "Adds the field to the full-text index under this role. See Text Search Fields.",
        ko: "이 역할로 필드를 전문 검색 인덱스에 넣습니다. 아래 텍스트 검색 필드에서 다룹니다.",
      }),
    },
    {
      key: "cascade",
      type: '"removeRef" | "removeWith" | "removeWithAny"',
      desc: l.trans({
        en: "Which side of the relation is removed along with the other. See Cascade Remove Fields.",
        ko: "관계의 어느 쪽이 다른 쪽과 함께 삭제되는지 정합니다. 아래 cascade 삭제 필드에서 다룹니다.",
      }),
    },
    {
      key: "visual",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "The page renders it and an agent never sees it. `field.visual(T)` is the short form.",
        ko: "페이지는 그리지만 에이전트는 보지 못하는 필드입니다. 줄여 쓰면 `field.visual(T)`입니다.",
      }),
    },
  ];

  const checkOptions: OptionItem[] = [
    {
      key: "validate",
      type: "(value, doc) => boolean",
      desc: l.trans({
        en: "Runs when a document is created or saved, and `false` refuses it. `null` and `undefined` skip it.",
        ko: "도큐먼트를 만들거나 저장할 때 실행되고, `false`면 쓰기를 거부합니다. `null`·`undefined`는 건너뜁니다.",
      }),
    },
    {
      key: "immutable",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Changing it in a document save throws. Query-level writes skip the check.",
        ko: "도큐먼트 저장으로 값을 바꾸면 예외가 납니다. 쿼리 단위 쓰기는 검사하지 않습니다.",
      }),
    },
    {
      key: "min",
      type: "number",
      desc: l.trans({
        en: "A lower bound for the schema docs and `sampleOf()`. Enforce it with `validate`.",
        ko: "스키마 문서와 `sampleOf()`가 쓰는 하한입니다. 실제로 막으려면 `validate`를 씁니다.",
      }),
    },
    {
      key: "max",
      type: "number",
      desc: l.trans({
        en: "An upper bound, used the same way.",
        ko: "상한이며, 쓰이는 방식은 같습니다.",
      }),
    },
    {
      key: "minlength",
      type: "number",
      desc: l.trans({
        en: "A length lower bound shown in the schema docs. On an array, the store checks the item count.",
        ko: "스키마 문서에 표시되는 길이 하한입니다. 배열 필드라면 store가 보내기 전에 항목 수를 검사합니다.",
      }),
    },
    {
      key: "maxlength",
      type: "number",
      desc: l.trans({
        en: "A length upper bound, handled the same way.",
        ko: "길이 상한이며, 다루는 방식은 같습니다.",
      }),
    },
  ];

  const sampleOptions: OptionItem[] = [
    {
      key: "example",
      type: "T",
      desc: l.trans({
        en: "A sample value for the schema docs and the API explorer's example request and response.",
        ko: "스키마 문서와 API explorer의 예시 요청·응답에 쓰이는 샘플 값입니다.",
      }),
    },
    {
      key: "type",
      type: '"email" | "password" | "url"',
      desc: l.trans({
        en: "Makes `sampleOf()` produce a realistic email, password or URL. It does not validate.",
        ko: "`sampleOf()`가 그럴듯한 이메일, 비밀번호, URL을 만들게 합니다. 값을 검증하지는 않습니다.",
      }),
    },
    {
      key: "accumulate",
      type: l.trans({ en: "query object", ko: "쿼리 객체" }),
      desc: l.trans({
        en: "Insight fields only: the condition this counter counts. `{}` counts every match.",
        ko: "Insight 필드에만 씁니다. 이 카운터가 셀 조건이며, `{}`는 매치 전부를 셉니다.",
      }),
    },
  ];

  const maskGroups = [
    {
      label: l.trans({ en: "Plain", ko: "일반" }),
      rows: [
        {
          name: "field(T)",
          desc: l.trans({
            en: "An ordinary stored property. Every side gets it.",
            ko: "평범한 저장 필드입니다. 모든 쪽이 값을 받습니다.",
          }),
          marks: { server: true, client: true, agent: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Secrecy: the value stays on the server", ko: "비밀: 값이 서버에만 남습니다" }),
      rows: [
        {
          name: "field.hidden(T)",
          desc: l.trans({
            en: "Stored and read by the server, never sent to a client. Always nullable.",
            ko: "서버가 저장하고 읽지만 클라이언트로는 보내지 않습니다. 항상 nullable입니다.",
          }),
          marks: { server: true, client: false, agent: false },
        },
        {
          name: "field.secret(T)",
          desc: l.trans({
            en: "Like hidden, and even the server's default read skips it until a projection asks.",
            ko: "hidden과 같고, 서버의 기본 읽기에서도 빠집니다. projection으로 요청해야 읽힙니다.",
          }),
          marks: { server: false, client: false, agent: false },
        },
      ],
    },
    {
      label: l.trans({ en: "Cost: only the agent skips it", ko: "비용: 에이전트만 받지 않습니다" }),
      rows: [
        {
          name: "field.visual(T)",
          desc: l.trans({
            en: "Sent to the page as usual; stripped from agent reads, MCP results and the MCP schema.",
            ko: "페이지에는 평소대로 가고, 인페이지 에이전트의 읽기, MCP 결과와 MCP 스키마에서는 빠집니다.",
          }),
          marks: { server: true, client: true, agent: false },
        },
      ],
    },
  ];

  const logicRows: IntroItem[] = [
    {
      name: "Light<Model>",
      desc: l.trans({
        en: "Methods about one record: display text and predicates.",
        ko: "레코드 하나에 대한 메서드입니다. 화면에 보일 문구와 판정 로직을 둡니다.",
      }),
      example: "board.canWrite(user)",
    },
    {
      name: "<Model> static",
      desc: l.trans({
        en: "Helpers about a list of records.",
        ko: "레코드 목록에 대한 헬퍼입니다.",
      }),
      example: "Board.getBoard(boardList, boardId)",
    },
    {
      name: "<Scalar> static",
      desc: l.trans({
        en: "Math that belongs to the value itself, not to whoever stored it.",
        ko: "값을 저장한 쪽이 아니라 값 자체에 속하는 계산입니다.",
      }),
      example: "Coordinate.getDistanceKm(from, to)",
    },
  ];

  const searchRows = [
    {
      role: '`"title"`',
      weight: "10",
      accepts: "`String`",
      holds: l.trans({
        en: "The one line a person scans for, like a name or a headline.",
        ko: "사람이 눈으로 훑는 한 줄입니다. 이름이나 제목이 여기에 해당합니다.",
      }),
    },
    {
      role: '`"tag"`',
      weight: "3",
      accepts: "`String`",
      holds: l.trans({
        en: "A keyword list, such as a category or labels.",
        ko: "카테고리나 라벨 같은 키워드 목록입니다.",
      }),
    },
    {
      role: '`"desc"`',
      weight: "1",
      accepts: "`String`",
      holds: l.trans({ en: "Prose, like a body or a description.", ko: "본문이나 설명 같은 줄글입니다." }),
    },
    {
      role: '`"filter"`',
      weight: "0",
      accepts: l.trans({ en: "`String`, `ID`, relation", ko: "`String`, `ID`, 관계 필드" }),
      holds: l.trans({
        en: "A scoping value such as status, role or owner. It matches but never outranks a title.",
        ko: "상태, 역할, 소유자처럼 범위를 좁히는 값입니다. 매치는 되지만 제목 매치를 앞지르지 못합니다.",
      }),
    },
    {
      role: '`"thumb"`',
      weight: "—",
      accepts: l.trans({ en: "`String`, `ID`, relation", ko: "`String`, `ID`, 관계 필드" }),
      holds: l.trans({
        en: "Kept so a hit can be drawn. It is not indexed and never matches.",
        ko: "검색 결과를 그릴 수 있게 함께 저장됩니다. 인덱스에 들어가지 않으므로 매치되지 않습니다.",
      }),
    },
  ];

  const cascadeRows = [
    {
      value: <code className="whitespace-nowrap">removeRef</code>,
      on: l.trans({ en: "The owner's own relation", ko: "소유자 자신의 관계 필드" }),
      meaning: l.trans({
        en: "When this document is removed, what the field points at is removed too.",
        ko: "이 도큐먼트가 삭제되면, 필드가 가리키는 대상도 함께 삭제됩니다.",
      }),
    },
    {
      value: <code className="whitespace-nowrap">removeWith</code>,
      on: l.trans({ en: "The child's reference to its owner", ko: "자식이 소유자를 가리키는 필드" }),
      meaning: l.trans({
        en: "When the owner is removed, this document is removed too.",
        ko: "소유자가 삭제되면, 이 도큐먼트도 함께 삭제됩니다.",
      }),
    },
    {
      value: <code className="whitespace-nowrap">removeWithAny</code>,
      on: l.trans({
        en: "The child's reference, when the owner can be any model",
        ko: "자식 쪽 필드, 소유자가 어떤 모델이든 될 수 있을 때",
      }),
      meaning: l.trans({
        en: "When the owner is removed, whatever its model, this document is removed too.",
        ko: "소유자가 어떤 모델이든, 소유자가 삭제되면 이 도큐먼트도 함께 삭제됩니다.",
      }),
    },
  ];

  const mistakeRows: IntroItem[] = [
    {
      name: "field(Number)",
      desc: l.trans({
        en: "Write `field(Int)` or `field(Float)`. `Number` does not typecheck.",
        ko: "`field(Int)`나 `field(Float)`로 씁니다. `Number`는 타입 검사를 통과하지 못합니다.",
      }),
    },
    {
      name: "enum TicketStatus { … }",
      desc: l.trans({
        en: 'Write `enumOf("ticketStatus", [...] as const)`. A TypeScript `enum` is not a field type.',
        ko: '`enumOf("ticketStatus", [...] as const)`로 씁니다. TypeScript `enum`은 필드 타입이 될 수 없습니다.',
      }),
    },
    {
      name: "default: dayjs()",
      desc: l.trans({
        en: "Write `default: () => dayjs()`. A bare `dayjs()` runs once, so every row shares that moment.",
        ko: "`default: () => dayjs()`로 씁니다. 그냥 `dayjs()`는 한 번만 실행되어 모든 행이 그 순간을 공유합니다.",
      }),
    },
    {
      name: "ticketIsOverdue(ticket)",
      desc: l.trans({
        en: "Write `ticket.isOverdue()` on `LightTicket`, which both server and client hold.",
        ko: "서버와 클라이언트가 함께 들고 있는 `LightTicket`에 두고 `ticket.isOverdue()`로 부릅니다.",
      }),
    },
    {
      name: "{ ...user }",
      desc: l.trans({
        en: "Write `new cnst.User().set(user)`. A spread drops every `Date` field.",
        ko: "`new cnst.User().set(user)`로 씁니다. spread는 `Date` 필드를 전부 빠뜨립니다.",
      }),
    },
    {
      name: "field(Binary)",
      desc: l.trans({
        en: "Write `field(File)`. Bytes are not storable in a document; a `File` is.",
        ko: "`field(File)`로 씁니다. 바이트는 도큐먼트에 저장할 수 없고, `File`은 됩니다.",
      }),
    },
    {
      name: "user.phone === undefined",
      desc: l.trans({
        en: 'Write `user.phone ?? ""`. A hidden or secret value arrives as `null`, not `undefined`.',
        ko: '`user.phone ?? ""`로 씁니다. hidden·secret 값은 `undefined`가 아니라 `null`로 옵니다.',
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="constant-overview" title="model.constant.ts">
        <Docs.Title>model.constant.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "This one file describes the shape of one business object. The storage schema, the generated CRUD, form state, the API contract, the admin explorer and the schema an AI agent reads all come from it, so no other file in the module restates the fields.",
              ko: "이 파일 하나가 비즈니스 객체 하나의 모양을 정합니다. 저장 스키마, 생성되는 CRUD, 폼 상태, API 계약, 관리자 explorer, AI 에이전트가 읽는 스키마가 모두 여기서 나오므로, 모듈의 다른 파일은 필드를 다시 적지 않습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Open it whenever a field is added, changed or removed, and whenever the model needs display or predicate logic.",
              ko: "필드를 추가·변경·삭제할 때, 그리고 모델에 표시나 판정 로직이 필요할 때 이 파일을 엽니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words Used On This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

          <Docs.SubSubTitle>
            {l.trans({ en: "Five Classes, Always In This Order", ko: "클래스 다섯 개, 항상 이 순서로" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Write all five even when one is empty, and build each with <code>via()</code>. Later files in the
                  module reuse these classes by name.
                </span>
              ),
              ko: (
                <span>
                  비어 있는 것이 있어도 다섯 개를 모두 쓰고, 각각 <code>via()</code>로 만듭니다. 모듈의 다른 파일은 이
                  클래스들을 이름으로 가져다 씁니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Class", ko: "클래스" })} items={layerRows} />
          <div>
            {l.trans({
              en: "Here is the complete file for a support ticket:",
              ko: "문의 티켓 모델의 파일 전체입니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/ticket/ticket.constant.ts"
            code={`import { dayjs, enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class TicketStatus extends enumOf("ticketStatus", [
  "active",
  "opened",
  "inProgress",
  "completed",
] as const) {}

export class TicketInput extends via((field) => ({
  title: field(String),
  content: field(String, { default: "" }),
  type: field(String, { default: "shared" }),
})) {}

export class TicketObject extends via(TicketInput, (field) => ({
  status: field(TicketStatus, { default: "active" }),
  due: field(Date, { default: () => dayjs().hour(19) }), // shop closes at 7pm
})) {}

export class LightTicket extends via(
  TicketObject,
  ["title", "status", "due"] as const,
  (resolve) => ({}),
) {}

export class Ticket extends via(
  TicketObject,
  LightTicket,
  (resolve) => ({}),
) {}

export class TicketInsight extends via(Ticket, (field) => ({
  activeCount: field(Int, { default: 0, accumulate: { status: "active" } }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Two <code>as const</code> do real work.
                    </strong>{" "}
                    On the <code>enumOf</code> array it turns the values into a union type instead of{" "}
                    <code>string[]</code>; on the Light tuple it tells <code>via()</code> which keys the Light has.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>as const</code> 두 개가 실제로 일을 합니다.
                    </strong>{" "}
                    <code>enumOf</code> 배열에 붙은 것은 값을 <code>string[]</code>이 아닌 union 타입으로 만들고, Light
                    튜플에 붙은 것은 Light에 어떤 key가 있는지 <code>via()</code>에 알려 줍니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Never use the TypeScript <code>enum</code> keyword.
                    </strong>{" "}
                    <code>enumOf</code> is the vocabulary: <code>TicketStatus["value"]</code> is the value union and{" "}
                    <code>TicketStatus.values</code> is the list.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      TypeScript <code>enum</code> 키워드는 쓰지 않습니다.
                    </strong>{" "}
                    열거형은 <code>enumOf</code>로 만듭니다. 값 union은 <code>TicketStatus["value"]</code>, 값 목록은{" "}
                    <code>TicketStatus.values</code>입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Comment a field only when its business meaning is not obvious,</strong> the way{" "}
                    <code>due</code> does. That comment belongs beside the field, not in the abstract, which holds
                    invariants rather than a field list.
                  </>
                ),
                ko: (
                  <>
                    <strong>비즈니스 의미가 뻔하지 않은 필드에만 짧은 꼬리 주석을 답니다.</strong> 위의 <code>due</code>
                    가 그 예입니다. 이 주석은 필드 옆에 둡니다. abstract는 필드 목록이 아니라 불변식을 담는 곳입니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="field-options" title={l.trans({ en: "Field Options", ko: "필드 옵션" })}>
        <Docs.Title>{l.trans({ en: "Field Options", ko: "필드 옵션" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>field(Type, options)</code> declares one stored field: first its type, then one object of
                  options. The options object may be left out.
                </span>
              ),
              ko: (
                <span>
                  <code>field(Type, options)</code>는 저장 필드 하나를 선언합니다. 먼저 타입을, 그다음 옵션 객체 하나를
                  받으며, 옵션 객체는 생략할 수 있습니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Types", ko: "타입" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Type", ko: "타입" })} items={typeRows} />

          <Docs.SubSubTitle>{l.trans({ en: "Values And References", ko: "값과 참조" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={valueOptions} />

          <Docs.SubSubTitle>
            {l.trans({ en: "Search, Cascade And Agents", ko: "검색, cascade, 에이전트" })}
          </Docs.SubSubTitle>
          <Docs.OptionTable items={reachOptions} />

          <Docs.SubSubTitle>{l.trans({ en: "Validation", ko: "검증" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={checkOptions} />

          <Docs.SubSubTitle>{l.trans({ en: "Samples And Counters", ko: "샘플과 카운터" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={sampleOptions} />

          <Docs.SubSubTitle>{l.trans({ en: "Not In The Options Object", ko: "옵션 객체에 없는 것" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>.optional()</code> is a chained method, not an option,
                    </strong>{" "}
                    because it widens the declared type to <code>T | null</code> as well as the stored one.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>.optional()</code>은 옵션이 아니라 체인 메서드입니다.
                    </strong>{" "}
                    저장 타입뿐 아니라 선언된 타입까지 <code>T | null</code>로 넓히기 때문입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>.meta()</code> is the other chained method.
                    </strong>{" "}
                    It attaches metadata to a field; a summary counter passes <code>getQueryMeta(…)</code> so its
                    dashboard tile can filter the list.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>.meta()</code>도 체인 메서드입니다.
                    </strong>{" "}
                    필드에 메타데이터를 붙입니다. summary 카운터는 <code>getQueryMeta(…)</code>를 넘겨, 대시보드 타일을
                    누르면 목록이 그 조건으로 걸러지게 합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The call you make sets the rest.</strong> <code>nullable</code>, <code>select</code>,{" "}
                    <code>enum</code> and the field kind come from <code>.optional()</code>, <code>field.hidden</code> /{" "}
                    <code>field.secret</code> and an <code>enumOf</code> type. An empty-string default,{" "}
                    <code>default: ""</code>, also turns <code>nullable</code> on.
                  </>
                ),
                ko: (
                  <>
                    <strong>나머지는 호출 방식이 정합니다.</strong> <code>nullable</code>, <code>select</code>,{" "}
                    <code>enum</code>, 필드 종류는 <code>.optional()</code>, <code>field.hidden</code> /{" "}
                    <code>field.secret</code>, <code>enumOf</code> 타입에서 옵니다. 빈 문자열 기본값인{" "}
                    <code>default: ""</code>도 <code>nullable</code>을 켭니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Write a date default as <code>{"() => dayjs()"}</code>, never <code>dayjs()</code>.
                  </strong>{" "}
                  A bare <code>dayjs()</code> is evaluated once when the class loads, so every row created afterwards
                  shares that one moment.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    날짜 기본값은 <code>dayjs()</code>가 아니라 <code>{"() => dayjs()"}</code>로 씁니다.
                  </strong>{" "}
                  그냥 <code>dayjs()</code>는 클래스가 로드될 때 한 번만 평가되어, 이후 만들어지는 모든 행이 그 한
                  순간을 공유합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="masking" title={l.trans({ en: "Hidden, Secret, Visual", ko: "hidden, secret, visual" })}>
        <Docs.Title>{l.trans({ en: "Hidden, Secret, Visual", ko: "hidden, secret, visual" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Three variants of <code>field()</code> decide who gets a value. <code>hidden</code> and{" "}
                  <code>secret</code> are about secrecy: the value never leaves the server. <code>visual</code> is about
                  cost: the page gets it, but an AI agent does not.
                </span>
              ),
              ko: (
                <span>
                  <code>field()</code>의 변형 세 가지가 값을 누가 받는지 정합니다. <code>hidden</code>과{" "}
                  <code>secret</code>은 비밀 때문에 쓰며, 값이 서버를 떠나지 않습니다. <code>visual</code>은 비용 때문에
                  쓰며, 페이지는 값을 받지만 AI 에이전트는 받지 않습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Declaration", ko: "선언" })}
            columns={[
              { key: "server", label: l.trans({ en: "Server default read", ko: "서버 기본 읽기" }) },
              { key: "client", label: l.trans({ en: "Page", ko: "페이지" }) },
              { key: "agent", label: l.trans({ en: "AI agent", ko: "AI 에이전트" }) },
            ]}
            groups={maskGroups}
            markLabel={l.trans({ en: "Gets the value", ko: "값을 받음" })}
            emptyLabel={l.trans({ en: "Left out", ko: "값이 빠짐" })}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>hidden</code> is for internal state
                    </strong>{" "}
                    that the document carries but no screen shows, such as an admin memo or a file's{" "}
                    <code>mimetype</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>hidden</code>은 내부 상태에 씁니다.
                    </strong>{" "}
                    관리자 메모나 파일의 <code>mimetype</code>처럼, 도큐먼트는 들고 있지만 어떤 화면도 보여 주지 않는
                    값입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>secret</code> is for credentials and personal data:
                    </strong>{" "}
                    a password hash, a phone number, a token. Read one back only with a projection such as{" "}
                    <code>pickById(id, &#123; secret: true &#125;)</code>, which widens the server's read and never the
                    response.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>secret</code>은 인증 정보와 개인정보에 씁니다.
                    </strong>{" "}
                    비밀번호 해시, 전화번호, 토큰이 그 대상입니다. 값은{" "}
                    <code>pickById(id, &#123; secret: true &#125;)</code> 같은 projection으로만 다시 읽으며,
                    projection은 서버의 읽기만 넓힐 뿐 응답을 넓히지 않습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>visual</code> is for bulky data a model cannot use:
                    </strong>{" "}
                    a blur placeholder, a rendered HTML body, a serialized geometry, each hundreds of tokens per record.
                    Storage, search, forms and the page response are untouched, and nothing is refused over one.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>visual</code>은 AI 모델에게 쓸모없는 큰 데이터에 씁니다.
                    </strong>{" "}
                    blur placeholder, 렌더링된 HTML 본문, 직렬화된 도형처럼 레코드마다 수백 토큰을 먹는 값입니다. 저장,
                    검색, 폼, 페이지 응답은 그대로이고, visual 때문에 요청이 거부되는 일은 없습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>If a screen needs the value, it is neither hidden nor secret.</strong> If it only needs to
                    be cheap for a model, it is <code>visual</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>화면이 그 값을 필요로 하면 hidden도 secret도 아닙니다.</strong> AI 모델에게 부담만 주지
                    않으면 되는 값이라면 <code>visual</code>입니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: (
                <span>
                  The shared <code>File</code> model uses both <code>hidden</code> and <code>visual</code>:
                </span>
              ),
              ko: (
                <span>
                  공용 <code>File</code> 모델은 <code>hidden</code>과 <code>visual</code>을 함께 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/file/file.constant.ts"
            code={`export class FileInput extends via((field) => ({
  filename: field(String, { text: "title" }),
  mimetype: field.hidden(String),
  encoding: field.hidden(String),
  imageSize: field<[number, number]>([Int], { default: [0, 0] }),
  url: field(String, { default: "" }),
  abstractData: field.visual(String).optional(),
  size: field(Int, { default: 0 }),
  origin: field.hidden(String).optional(),
})) {}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  This part of the shared <code>User</code> model keeps its account data <code>secret</code>:
                </span>
              ),
              ko: (
                <span>
                  공용 <code>User</code> 모델에서 계정 정보를 <code>secret</code>으로 둔 부분입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/user/user.constant.ts"
            code={`export class UserObject extends via(UserInput, (field) => ({
  accountId: field.secret(String).optional(),
  password: field.secret(String).optional(),
  phone: field.secret(String).optional(),
  notiInfo: field.secret(NotiInfo),
  restrictInfo: field.secret(RestrictInfo).optional(),
  roles: field([UserRole], { default: ["user"], text: "filter" }),
})) {}`}
          />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    A <code>hidden</code> or <code>secret</code> value reads <code>null</code> on the client, so guard
                    it with <code>??</code> or <code>== null</code>.
                  </strong>{" "}
                  The response leaves the key out, and hydration writes <code>null</code> there even over a declared
                  default. A <code>hidden</code> field's type still says <code>string</code>, so nothing flags it until
                  the value is dereferenced far from where it was read. <code>=== undefined</code> and destructuring or
                  parameter defaults catch only a missing key.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>hidden</code>·<code>secret</code> 값은 클라이언트에서 <code>null</code>로 읽히므로{" "}
                    <code>??</code>나 <code>== null</code>로 막습니다.
                  </strong>{" "}
                  응답에서 key가 빠지고, 선언한 기본값이 있어도 hydration이 그 자리에 <code>null</code>을 넣습니다.{" "}
                  <code>hidden</code> 필드는 타입이 여전히 <code>string</code>이라 타입 검사가 잡지 못하고, 오류는 값을
                  읽은 곳이 아니라 한참 뒤 그 값을 쓰는 곳에서 납니다. <code>=== undefined</code>나 구조 분해·매개변수
                  기본값은 key가 없을 때만 걸립니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="instance-and-helpers"
        title={l.trans({ en: "The Instance And Its Logic", ko: "인스턴스와 로직" })}
      >
        <Docs.Title>{l.trans({ en: "The Instance And Its Logic", ko: "인스턴스와 로직" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Put display and predicate logic on the Light class as methods. Server and client both hold a Light, so one method there works in a page, a card, a store action and a service.",
              ko: "표시와 판정 로직은 Light 클래스의 메서드로 둡니다. 서버와 클라이언트가 모두 Light를 들고 있으므로, 거기 쓴 메서드 하나를 페이지, 카드, store action, service에서 똑같이 부를 수 있습니다.",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Put it on", ko: "두는 곳" })}
            descLabel={l.trans({ en: "Logic about", ko: "어떤 로직인가" })}
            items={logicRows}
          />
          <div>
            {l.trans({
              en: "The board model shows the first two in one file:",
              ko: "board 모델 파일 하나에 앞의 두 가지가 모두 들어 있습니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/board/board.constant.ts"
            code={`export class LightBoard extends via(
  BoardObject,
  ["name", "policy", "roles"] as const,
  (resolve) => ({}),
) {
  isPrivate() {
    return this.policy.includes("private");
  }

  canWrite(user?: { roles: string[] }) {
    return !!user && this.roles.some((role) => user.roles.includes(role));
  }
}

export class Board extends via(BoardObject, LightBoard, (resolve) => ({})) {
  static getBoard(boardList: LightBoard[], boardId: string) {
    return boardList.find((board) => board.id === boardId);
  }
}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>A Light method reads only the Light's keys.</strong> <code>isPrivate()</code> and{" "}
                    <code>canWrite()</code> use <code>policy</code> and <code>roles</code>, so both are in the tuple.
                  </>
                ),
                ko: (
                  <>
                    <strong>Light 메서드는 Light의 key만 읽습니다.</strong> <code>isPrivate()</code>와{" "}
                    <code>canWrite()</code>가 <code>policy</code>와 <code>roles</code>를 쓰므로 둘 다 튜플에 들어
                    있습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>This is the rule most often missed.</strong> Skipping it is how util modules full of{" "}
                    <code>ticketIsOverdue(ticket)</code> get started.
                  </>
                ),
                ko: (
                  <>
                    <strong>가장 자주 놓치는 규칙입니다.</strong> 이 규칙을 건너뛰면{" "}
                    <code>ticketIsOverdue(ticket)</code> 같은 함수로 가득한 util 모듈이 생겨납니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>A scalar splits the same way.</strong> <code>Coordinate</code> in <code>libs/util</code>{" "}
                    keeps its distance and bounds math as statics, because that arithmetic belongs to the value rather
                    than to whoever stored it.
                  </>
                ),
                ko: (
                  <>
                    <strong>스칼라도 같은 방식으로 나눕니다.</strong> <code>libs/util</code>의 <code>Coordinate</code>는
                    거리와 범위 계산을 static으로 들고 있습니다. 그 계산은 값을 저장한 쪽이 아니라 값 자체에 속하기
                    때문입니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Copying An Instance", ko: "인스턴스 복사하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A <code>Date</code> field on a hydrated instance is a prototype accessor, not an own property. The
                  instance keeps a native <code>Date</code> under a symbol and builds the <code>Dayjs</code> its type
                  promises on first read.
                </span>
              ),
              ko: (
                <span>
                  hydrate된 인스턴스의 <code>Date</code> 필드는 인스턴스 자신의 속성(own property)이 아니라 prototype에
                  있는 접근자(accessor)입니다. 인스턴스는 native <code>Date</code>를 symbol 아래에 두었다가, 처음 읽을
                  때 타입이 약속한 <code>Dayjs</code>를 만듭니다.
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "Date Fields Go Missing", ko: "Date 필드가 빠집니다" })}
              </div>
              <code className={chip}>{"Object.keys(user) · { ...user }"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "These read own properties only, so the dates are missing.",
                  ko: "own property만 읽으므로 날짜가 빠집니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "Date Fields Are There", ko: "Date 필드가 들어갑니다" })}
              </div>
              <code className={chip}>{'"createdAt" in user · for...in'}</code>
              <code className={chip}>JSON.stringify(user)</code>
              <code className={chip}>plainFieldsOf · immerify · deepObjectify</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "These walk the prototype too, so the dates are there.",
                  ko: "prototype까지 훑으므로 날짜가 들어 있습니다.",
                })}
              </div>
            </div>
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Copy a model with <code>new cnst.User().set(user)</code>, never a spread.
                  </strong>{" "}
                  A spread copy silently loses every date.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    모델은 spread가 아니라 <code>new cnst.User().set(user)</code>로 복사합니다.
                  </strong>{" "}
                  spread로 복사하면 날짜가 전부 조용히 사라집니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="text-search-fields" title={l.trans({ en: "Text Search Fields", ko: "텍스트 검색 필드" })}>
        <Docs.Title>{l.trans({ en: "Text Search Fields", ko: "텍스트 검색 필드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Give a field a <code>text</code> role and it joins the full-text index; that declaration is the whole
                  setup. Pick the role by what the value is, because each role weighs differently when results are
                  ranked.
                </span>
              ),
              ko: (
                <span>
                  필드에 <code>text</code> 역할을 주면 전문 검색 인덱스에 들어가며, 설정은 그 선언이 전부입니다. 결과
                  순위를 매길 때 역할마다 가중치가 다르므로, 값의 성격에 맞는 역할을 고릅니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table
            stacked
            columns={[
              { key: "role", label: l.trans({ en: "Role", ko: "역할" }) },
              { key: "weight", label: l.trans({ en: "Weight", ko: "가중치" }), code: true },
              { key: "accepts", label: l.trans({ en: "Accepts", ko: "받는 타입" }) },
              { key: "holds", label: l.trans({ en: "What it holds", ko: "담는 값" }) },
            ]}
            rows={searchRows}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The shared <code>Banner</code> model uses all five. Its other fields are left out here:
                </span>
              ),
              ko: (
                <span>
                  공용 <code>Banner</code> 모델이 다섯 역할을 모두 씁니다. 나머지 필드는 생략했습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/banner/banner.constant.ts"
            code={`export class BannerInput extends via((field) => ({
  category: field(String, { text: "tag" }).optional(),
  title: field(String, { text: "title" }).optional(),
  content: field(String, { text: "desc" }).optional(),
  image: field(File, { text: "thumb" }).optional(),
  href: field(String),
})) {}

export class BannerObject extends via(BannerInput, (field) => ({
  status: field(BannerStatus, { default: "active", text: "filter" }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Arrays, string enums and embedded scalars work.</strong> An array of strings is indexed, and
                    an array of scalar objects is indexed by leaf key, even when the leaf is itself an array.
                  </>
                ),
                ko: (
                  <>
                    <strong>배열, 문자열 enum, 내장 스칼라도 됩니다.</strong> 문자열 배열은 그대로 인덱스에 들어가고,
                    스칼라 객체 배열은 leaf key 기준으로 들어갑니다. leaf가 배열이어도 됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      A <code>Map</code> or a nested array takes no <code>text</code> role,
                    </strong>{" "}
                    and a field inside a Map's value is not indexed. Neither has one fixed path to read the value from.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>Map</code>과 중첩 배열에는 <code>text</code> 역할을 붙일 수 없고,
                    </strong>{" "}
                    Map 값 안의 필드도 인덱스에 들어가지 않습니다. 값을 읽어 올 고정된 경로가 없기 때문입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The weights are defaults.</strong> A query can pass its own <code>weights</code> or narrow
                    the <code>columns</code> in <code>q.search()</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>가중치는 기본값일 뿐입니다.</strong> 쿼리마다 <code>q.search()</code>에 <code>weights</code>
                    를 넘기거나 <code>columns</code>를 좁힐 수 있습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Search works in every database mode.</strong> For the same text, SQLite, libSQL and Postgres
                    match the same documents; only the order can differ on Postgres.
                  </>
                ),
                ko: (
                  <>
                    <strong>검색은 모든 데이터베이스 모드에서 동작합니다.</strong> 같은 텍스트라면 SQLite, libSQL,
                    Postgres가 같은 도큐먼트를 찾고, Postgres에서는 순서만 다를 수 있습니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    A <code>secret</code>, <code>hidden</code> or resolved field takes no <code>text</code> role,
                  </strong>{" "}
                  and neither does a field nested underneath one. The search mirror stores plaintext, so an indexed
                  secret would leak through search.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>secret</code>, <code>hidden</code>, resolve 필드에는 <code>text</code> 역할을 붙일 수
                    없습니다.
                  </strong>{" "}
                  그 아래에 중첩된 필드도 마찬가지입니다. 검색용 사본은 평문으로 저장되므로, secret을 인덱스에 넣으면
                  검색을 통해 새어 나갑니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="cascade-fields" title={l.trans({ en: "Cascade Remove Fields", ko: "cascade 삭제 필드" })}>
        <Docs.Title>{l.trans({ en: "Cascade Remove Fields", ko: "cascade 삭제 필드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>cascade</code> says which side of a relation is removed along with the other. Both directions
                  fit the same field shape, so a swapped value is not a bug you notice; it is data loss.
                </span>
              ),
              ko: (
                <span>
                  <code>cascade</code>는 관계의 어느 쪽이 다른 쪽과 함께 삭제되는지 정합니다. 두 방향 모두 같은 모양의
                  필드에 붙을 수 있어서, 값을 바꿔 적으면 눈에 띄는 버그가 아니라 데이터 손실이 됩니다.
                </span>
              ),
            })}
          </div>
          <Docs.Table
            stacked
            columns={[
              { key: "value", label: l.trans({ en: "Value", ko: "값" }) },
              { key: "on", label: l.trans({ en: "Declared on", ko: "붙이는 곳" }) },
              { key: "meaning", label: l.trans({ en: "Meaning", ko: "뜻" }) },
            ]}
            rows={cascadeRows}
          />

          <Docs.SubSubTitle>
            {l.trans({ en: "removeRef: On The Owner", ko: "removeRef: 소유자 쪽에 붙입니다" })}
          </Docs.SubSubTitle>
          <Docs.Flow
            title={l.trans({ en: "Story owns its images", ko: "Story가 이미지를 소유합니다" })}
            nodes={{
              story: { label: l.trans({ en: "Story is removed", ko: "Story 삭제" }) },
              file: {
                label: l.trans({ en: "the File it points at", ko: "가리키던 File도" }),
                lines: [l.trans({ en: "is removed too", ko: "함께 삭제" })],
              },
            }}
            edges={[["story", "file", { label: l.trans({ en: "points at", ko: "가리킴" }) }]]}
          />
          <div>
            {l.trans({
              en: "Declare it on the relation the owner holds, arrays included:",
              ko: "소유자가 들고 있는 관계 필드에 붙이며, 배열도 됩니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/story/story.constant.ts"
            code={`export class StoryInput extends via((field) => ({
  title: field(String, { text: "title" }),
  thumbnail: field(File, { text: "thumb", cascade: "removeRef" }).optional(),
  images: field([File], { cascade: "removeRef" }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Only a relation takes it.</strong> A <code>String</code>, an <code>ID</code> or a scalar
                    names no document to remove.
                  </>
                ),
                ko: (
                  <>
                    <strong>관계 필드에만 붙습니다.</strong> <code>String</code>, <code>ID</code>, 스칼라는 삭제할
                    도큐먼트를 가리키지 않습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>It claims the target exclusively.</strong> Nothing checks whether another document still
                    references it, and <code>File</code> is deduped by <code>origin</code>, so two parents can share one
                    row.
                  </>
                ),
                ko: (
                  <>
                    <strong>대상을 혼자 소유한다는 선언입니다.</strong> 다른 도큐먼트가 아직 대상을 참조하는지는
                    검사하지 않습니다. 특히 <code>File</code>은 <code>origin</code>으로 중복을 없애므로, 부모 둘이 한
                    행을 공유할 수 있습니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "removeWith: On The Child", ko: "removeWith: 자식 쪽에 붙입니다" })}
          </Docs.SubSubTitle>
          <Docs.Flow
            title={l.trans({ en: "A session takes its chats with it", ko: "세션을 지우면 채팅도 함께 지워집니다" })}
            nodes={{
              session: { label: l.trans({ en: "AgentSession is removed", ko: "AgentSession 삭제" }) },
              chat: {
                label: l.trans({ en: "every SessionChat naming it", ko: "이를 가리키는 SessionChat도" }),
                lines: [l.trans({ en: "is removed too", ko: "함께 삭제" })],
              },
            }}
            edges={[["session", "chat", { label: l.trans({ en: "by its id", ko: "id로 찾음" }) }]]}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Declare it on the child's own reference to its owner. Here it is an <code>ID</code> with{" "}
                  <code>ref</code>:
                </span>
              ),
              ko: (
                <span>
                  자식이 자기 소유자를 가리키는 필드에 붙입니다. 여기서는 <code>ref</code>를 단 <code>ID</code>
                  입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/sessionChat/sessionChat.constant.ts"
            code={`export class SessionChatInput extends via((field) => ({
  agentSession: field(ID, { ref: "agentSession", cascade: "removeWith" }),
  content: field(String, { default: "", text: "desc" }),
})) {}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  When the owner can be one of several models, point <code>refPath</code> at an <code>enumOf</code>{" "}
                  field listing their model names. It must be an enum, because a free-form owner type cannot be known
                  ahead of time:
                </span>
              ),
              ko: (
                <span>
                  소유자가 여러 모델 중 하나일 수 있다면, 그 모델 이름을 나열한 <code>enumOf</code> 필드를{" "}
                  <code>refPath</code>로 가리킵니다. 자유 문자열로는 소유자 후보를 미리 알 수 없으므로 반드시 enum이어야
                  합니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/reaction/reaction.constant.ts"
            code={`export class ReactionParent extends enumOf("reactionParent", [
  "icecreamOrder",
  "story",
] as const) {}

export class ReactionInput extends via((field) => ({
  parent: field(ID, { refPath: "parentType", cascade: "removeWith" }),
  parentType: field(ReactionParent, { default: "icecreamOrder" }),
  emoji: field(String, { default: "" }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The owner never learns about its children,</strong> so an app model can be removed with a
                    lib model without touching the lib.
                  </>
                ),
                ko: (
                  <>
                    <strong>소유자는 자식의 존재를 몰라도 됩니다.</strong> 그래서 lib을 건드리지 않고도 앱 모델이 lib
                    모델과 함께 삭제되게 만들 수 있습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Three shapes are accepted:</strong> a relation, an <code>ID</code> with <code>ref</code>, or
                    an <code>ID</code> with <code>refPath</code>. An array, a <code>Map</code>, and <code>ref</code>{" "}
                    together with <code>refPath</code> are not.
                  </>
                ),
                ko: (
                  <>
                    <strong>받는 모양은 세 가지입니다.</strong> 관계 필드, <code>ref</code>를 단 <code>ID</code>,{" "}
                    <code>refPath</code>를 단 <code>ID</code>입니다. 배열, <code>Map</code>, <code>ref</code>와{" "}
                    <code>refPath</code>를 함께 쓴 필드는 안 됩니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "removeWithAny: An Owner Of Any Model", ko: "removeWithAny: 소유자가 어떤 모델이든" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  When the owner can be any model in the app, <code>refPath</code> names a plain <code>String</code>{" "}
                  field that holds the owner's model name:
                </span>
              ),
              ko: (
                <span>
                  소유자가 앱의 어떤 모델이든 될 수 있다면, <code>refPath</code>는 소유자의 모델 이름을 담는 평범한{" "}
                  <code>String</code> 필드를 가리킵니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/comment/comment.constant.ts"
            code={`export class CommentInput extends via((field) => ({
  parent: field(ID, { refPath: "parentType", cascade: "removeWithAny" }),
  parentType: field(String),
  content: field(String, { default: "", text: "desc" }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>It has a price.</strong> Every removal in the app then checks this field with one indexed
                    lookup, and no cascade anywhere in the app can remove in a single query anymore.
                  </>
                ),
                ko: (
                  <>
                    <strong>대가가 있습니다.</strong> 앱의 모든 삭제가 이 필드를 인덱스 조회로 한 번씩 확인하고, 앱
                    전체의 cascade가 쿼리 한 번이 아니라 도큐먼트 하나씩 삭제하게 됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      If the owners are known, use <code>removeWith</code> with an <code>enumOf</code>.
                    </strong>{" "}
                    <code>removeWithAny</code> does not take an <code>enumOf</code> type field.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      소유자 후보를 안다면 <code>enumOf</code>와 <code>removeWith</code>를 씁니다.
                    </strong>{" "}
                    <code>removeWithAny</code>에는 <code>enumOf</code> 타입 필드를 쓸 수 없습니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "What Every Cascade Shares", ko: "모든 cascade에 공통인 점" })}
          </Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      The target's own <code>_postRemove</code> runs.
                    </strong>{" "}
                    The cascade removes through the target's service, which is how removing a <code>File</code> also
                    deletes the stored object.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      대상의 <code>_postRemove</code>도 실행됩니다.
                    </strong>{" "}
                    cascade는 대상의 service를 거쳐 삭제하므로, <code>File</code>을 삭제하면 저장소의 파일까지
                    지워집니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Query-level removal fires no hooks, so no cascade.</strong>{" "}
                    <code>remove&lt;Filter&gt;</code>, <code>removeMany</code> and <code>removeById</code> skip it;
                    remove cascading documents one at a time.
                  </>
                ),
                ko: (
                  <>
                    <strong>쿼리 단위 삭제는 hook을 거치지 않으므로 cascade도 돌지 않습니다.</strong>{" "}
                    <code>remove&lt;Filter&gt;</code>, <code>removeMany</code>, <code>removeById</code>가 그렇습니다.
                    cascade가 걸린 도큐먼트는 하나씩 삭제합니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A cascade cannot be undone.</strong> Removal is soft, since the row is only stamped, but the
                  storage delete a <code>_postRemove</code> performs is not. Reviving the owner does not revive what
                  went with it.
                </span>
              ),
              ko: (
                <span>
                  <strong>cascade는 되돌릴 수 없습니다.</strong> 삭제는 행에 표시만 하는 soft 삭제지만,{" "}
                  <code>_postRemove</code>가 하는 저장소 삭제는 그렇지 않습니다. 소유자를 되살려도 함께 사라진 것은
                  돌아오지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="resolve-fields" title={l.trans({ en: "Resolved Fields", ko: "resolve 필드" })}>
        <Docs.Title>{l.trans({ en: "Resolved Fields", ko: "resolve 필드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some values belong to the record and the person looking at it: whether this user liked a story, how many times they read it, whether they may edit it. Storing those on the document would mean one row per viewer.",
              ko: "어떤 값은 레코드와 그것을 보는 사람 둘 다에 속합니다. 이 사용자가 story에 좋아요를 눌렀는지, 몇 번 읽었는지, 수정할 수 있는지 같은 값입니다. 이런 값을 도큐먼트에 저장하면 보는 사람마다 행이 하나씩 필요합니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "The Constant Names And Types It", ko: "constant가 이름과 타입을 정합니다" })}
              </div>
              <code className={chip}>like: resolve(Int)</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: (
                    <span>
                      Declared in the <code>resolve</code> callback of the Light or full model.
                    </span>
                  ),
                  ko: (
                    <span>
                      Light나 전체 모델의 <code>resolve</code> 콜백 안에 선언합니다.
                    </span>
                  ),
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">
                {l.trans({ en: "An Internal Signal Computes It", ko: "internal signal이 계산합니다" })}
              </div>
              <code className={chip}>like: resolveField(Int).with(Self)</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "Runs on every request, with whatever caller context it asks for.",
                  ko: "요청마다 실행되며, 필요한 호출자 정보를 받아 계산합니다.",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: "The story's Light declares two resolved fields:",
              ko: "story의 Light가 resolve 필드 두 개를 선언합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/story/story.constant.ts"
            code={`export class LightStory extends via(
  StoryObject,
  ["root", "user", "title", "totalStat", "status"] as const,
  (resolve) => ({
    view: resolve(Int),
    like: resolve(Int),
  }),
) {
  setLike() {
    if (this.like > 0) return false;
    this.totalStat.likes += 1;
    this.like = 1;
    return true;
  }
}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The story's internal signal then computes <code>like</code> for whoever is asking. <code>view</code>{" "}
                  is written the same way:
                </span>
              ),
              ko: (
                <span>
                  story의 internal signal은 요청한 사람을 기준으로 <code>like</code>를 계산합니다. <code>view</code>도
                  같은 방식으로 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/story/story.signal.ts"
            code={`export class StoryInternal extends internal(
  srv.story.with(srv.actionLog),
  ({ resolveField }) => ({
    like: resolveField(Int)
      .with(Self, { nullable: true })
      .exec(async function (story, self) {
        if (!self) return 0;
        return await this.actionLogService.countByTarget(
          "like",
          story.id,
          self.id,
        );
      }),
  }),
) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The document comes first.</strong> <code>exec</code> receives the story, then each{" "}
                    <code>.with()</code> value in order.
                  </>
                ),
                ko: (
                  <>
                    <strong>도큐먼트가 먼저 옵니다.</strong> <code>exec</code>는 story를 받고, 이어서{" "}
                    <code>.with()</code> 값을 순서대로 받습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>self</code> can be <code>null</code>.
                    </strong>{" "}
                    A signed-out visitor has no <code>Self</code>, so answer a default such as <code>0</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>self</code>는 <code>null</code>일 수 있습니다.
                    </strong>{" "}
                    로그인하지 않은 방문자에게는 <code>Self</code>가 없으므로 <code>0</code> 같은 기본값으로 답합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>.with(srv.actionLog)</code> brings in another service
                    </strong>{" "}
                    as <code>this.actionLogService</code>. <code>countByTarget</code> is the generated count of its{" "}
                    <code>byTarget</code> filter.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>.with(srv.actionLog)</code>로 다른 service를 가져옵니다.
                    </strong>{" "}
                    <code>this.actionLogService</code>로 쓰며, <code>countByTarget</code>은 그 모델의{" "}
                    <code>byTarget</code> 필터에서 생성된 count 메서드입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      No <code>text</code> role,
                    </strong>{" "}
                    for the same reason as a secret: there is no stored value for the search mirror to copy.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>text</code> 역할은 붙일 수 없습니다.
                    </strong>{" "}
                    저장된 값이 없으니 검색용 사본에 옮길 것도 없습니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="generated-extension"
        title={l.trans({ en: "Extending Library Models", ko: "라이브러리 모델 확장하기" })}
      >
        <Docs.Title>{l.trans({ en: "Extending Library Models", ko: "라이브러리 모델 확장하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An app that mounts a library model extends it instead of redeclaring it. Spread the library's classes
                  at the end of each <code>via()</code> call, and the app's own fields sit beside the inherited ones:
                </span>
              ),
              ko: (
                <span>
                  라이브러리 모델을 가져다 쓰는 앱은 그 모델을 다시 선언하지 않고 확장합니다. 각 <code>via()</code> 호출
                  끝에 라이브러리의 클래스를 spread하면, 앱 자신의 필드가 물려받은 필드 옆에 나란히 놓입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/user/user.constant.ts"
            code={`import { via } from "akanjs/constant";
import { user } from "../__lib/lib.constant";

export class UserInput extends via((field) => ({}), ...user.inputs) {}

export class UserObject extends via(
  UserInput,
  (field) => ({
    favoriteFlavor: field(String, { default: "" }),
  }),
  ...user.objects,
) {}

export class LightUser extends via(
  UserObject,
  ["roles"] as const,
  (resolve) => ({}),
  ...user.lights,
) {}

export class User extends via(
  UserObject,
  LightUser,
  (resolve) => ({}),
  ...user.models,
) {}

export class UserInsight extends via(
  User,
  (field) => ({}),
  ...user.insights,
) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>user</code> comes from the app's generated <code>lib/__lib/lib.constant.ts</code>.
                    </strong>{" "}
                    Every app module named like a library module gets such an export, holding the library's classes in
                    five arrays: <code>inputs</code>, <code>objects</code>, <code>lights</code>, <code>models</code> and{" "}
                    <code>insights</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>user</code>는 앱의 생성 파일 <code>lib/__lib/lib.constant.ts</code>에서 옵니다.
                    </strong>{" "}
                    라이브러리 모듈과 이름이 같은 앱 모듈마다 이런 export가 하나씩 생기며, 라이브러리의 클래스를{" "}
                    <code>inputs</code>, <code>objects</code>, <code>lights</code>, <code>models</code>,{" "}
                    <code>insights</code> 배열 다섯 개에 나눠 담고 있습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Declare only what the app adds.</strong> Here that is <code>favoriteFlavor</code>; every
                    library field comes along.
                  </>
                ),
                ko: (
                  <>
                    <strong>앱이 더하는 것만 선언합니다.</strong> 여기서는 <code>favoriteFlavor</code>이고, 라이브러리의
                    필드는 모두 따라옵니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Light keys and methods add up.</strong> <code>["roles"]</code> joins the library's Light
                    keys, and the library's Light and model methods stay available.
                  </>
                ),
                ko: (
                  <>
                    <strong>Light key와 메서드는 합쳐집니다.</strong> <code>["roles"]</code>는 라이브러리 Light의 key에
                    더해지고, 라이브러리의 Light·모델 메서드도 그대로 쓸 수 있습니다.
                  </>
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
              en: "Check these before you commit a constant file.",
              ko: "constant 파일을 커밋하기 전에 확인할 것들입니다.",
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>All five classes, in order.</strong> Include an empty Insight, and put <code>as const</code>{" "}
                    on every <code>enumOf</code> array and every Light tuple.
                  </>
                ),
                ko: (
                  <>
                    <strong>클래스 다섯 개를 순서대로 씁니다.</strong> 비어 있는 Insight까지 쓰고, 모든{" "}
                    <code>enumOf</code> 배열과 Light 튜플에 <code>as const</code>를 붙입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Logic lives on the model.</strong> Display and predicate logic on{" "}
                    <code>Light&lt;Model&gt;</code>, collection helpers as statics on the full model, nothing in a util
                    module.
                  </>
                ),
                ko: (
                  <>
                    <strong>로직은 모델에 둡니다.</strong> 표시·판정 로직은 <code>Light&lt;Model&gt;</code>에, 목록
                    헬퍼는 전체 모델의 static에 두고, util 모듈에는 두지 않습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>No non-null assertions.</strong> Narrow with <code>?.</code>, an early return or a type
                    predicate, and remember a hidden or secret value is <code>null</code>, not <code>undefined</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>non-null 단언은 쓰지 않습니다.</strong> <code>?.</code>, early return, type predicate로
                    좁히고, hidden·secret 값은 <code>undefined</code>가 아니라 <code>null</code>임을 기억합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Comments only for business meaning.</strong> A short trailing comment on a field whose
                    meaning is not obvious, and nowhere else.
                  </>
                ),
                ko: (
                  <>
                    <strong>주석은 비즈니스 의미에만 답니다.</strong> 의미가 뻔하지 않은 필드에 짧은 꼬리 주석을 달고,
                    그 밖에는 달지 않습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Import other constants by file path.</strong> <code>../file/file.constant</code>, not a
                    barrel; it is the sanctioned exception to the deep-import rule.
                  </>
                ),
                ko: (
                  <>
                    <strong>다른 constant는 파일 경로로 import합니다.</strong> barrel이 아니라{" "}
                    <code>../file/file.constant</code>처럼 씁니다. deep import 금지 규칙의 공식 예외입니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Common Mistakes", ko: "자주 하는 실수" })}</Docs.SubSubTitle>
          <Docs.IntroTable
            type={l.trans({ en: "Instead of", ko: "이렇게 쓰지 말고" })}
            descLabel={l.trans({ en: "Write", ko: "이렇게 씁니다" })}
            items={mistakeRows}
          />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
