import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="constant-overview" title="model.constant.ts">
        <Docs.Title>model.constant.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A constant file defines the business shape of a model. It declares fields, enums, embedded scalar values, generated views, and small helper behavior that should travel with the data type.",
              ko: "constant 파일은 model의 비즈니스 형태를 정의합니다. field, enum, embedded scalar 값, generated view, 데이터 타입과 함께 다녀야 하는 작은 helper 동작을 선언합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The current Akan pattern is based on via(). Each class builds a different view of the same business model, and later document, service, signal, store, and UI code reuse those generated types.",
              ko: "현재 Akan 패턴은 via()를 중심으로 구성됩니다. 각 class는 같은 비즈니스 model의 서로 다른 view를 만들고, 이후 document, service, signal, store, UI 코드가 이 generated type을 재사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="model-layering" title={l.trans({ en: "Model Layering Pattern", ko: "Model 계층 패턴" })}>
        <Docs.Title>{l.trans({ en: "Model Layering Pattern", ko: "Model 계층 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Most document models use the same five layers: Input, Object, Light, full Model, and Insight. Start with this shape unless the model is a small embedded scalar.",
              ko: "대부분의 document model은 Input, Object, Light, full Model, Insight의 다섯 계층을 사용합니다. 작은 embedded scalar가 아니라면 이 형태를 기본값으로 생각하세요.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            {
              title: "Input",
              desc: l.trans({
                en: "Fields accepted when creating or editing the model.",
                ko: "model을 생성하거나 수정할 때 받는 field입니다.",
              }),
            },
            {
              title: "Object",
              desc: l.trans({
                en: "Input plus stored fields controlled by the system or service.",
                ko: "Input에 system 또는 service가 관리하는 저장 field를 더합니다.",
              }),
            },
            {
              title: "Light",
              desc: l.trans({
                en: "Small view for list, relation, and card-style queries.",
                ko: "list, relation, card 형태 query에 쓰는 작은 view입니다.",
              }),
            },
            {
              title: "Model",
              desc: l.trans({
                en: "Full model that combines Object and Light, often with static helpers.",
                ko: "Object와 Light를 결합한 full model이며 static helper를 둘 수 있습니다.",
              }),
            },
            {
              title: "Insight",
              desc: l.trans({
                en: "Aggregation or reporting fields for analytics.",
                ko: "분석을 위한 aggregation 또는 reporting field입니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
        <Code.Snippet
          title="ticket.constant.ts"
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
  due: field(Date, { default: () => dayjs().set("hour", 19) }),
})) {}

export class LightTicket extends via(TicketObject, ["title", "status", "due"] as const, (resolve) => ({})) {}

export class Ticket extends via(TicketObject, LightTicket, (resolve) => ({})) {}

export class TicketInsight extends via(Ticket, (field) => ({
  activeCount: field(Int, { default: 0, accumulate: { status: "active" } }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="fields-enums" title={l.trans({ en: "Fields And enumOf", ko: "Field와 enumOf" })}>
        <Docs.Title>{l.trans({ en: "Fields And enumOf", ko: "Field와 enumOf" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use field() to describe values and enumOf() to define categorical values. Keep field options close to business needs: defaults, optional values, references, hidden or secret fields, examples, and aggregation.",
              ko: "field()로 값을 설명하고 enumOf()로 범주형 값을 정의합니다. field option은 default, optional, reference, hidden 또는 secret field, example, aggregation처럼 비즈니스에 필요한 내용 중심으로 둡니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="status enum"
            code={`import { enumOf } from "akanjs/base";

export class TicketStatus extends enumOf("ticketStatus", [
  "active",
  "opened",
  "completed",
] as const) {}

type TicketStatusValue = TicketStatus["value"];`}
          />
          <Code.Snippet
            title="practical field options"
            code={`export class TicketInput extends via((field) => ({
  title: field(String, { example: "Fix payment bug" }),
  content: field(String, { default: "" }),
  owner: field(LightUser).optional(),
  draftReason: field.hidden(String).optional(),
  accessToken: field.secret(String).optional(),
  status: field(TicketStatus, { default: "active" }),
})) {}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="hidden-secret-fields"
        title={l.trans({ en: "field.hidden And field.secret", ko: "field.hidden과 field.secret" })}
      >
        <Docs.Title>{l.trans({ en: "field.hidden And field.secret", ko: "field.hidden과 field.secret" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "field.hidden() and field.secret() are helper forms for fields that should not behave like normal public properties. Both create hidden, nullable fields. field.secret() also sets select: false, so it is not selected by default when documents are loaded.",
              ko: "field.hidden()과 field.secret()은 일반 public property처럼 다루면 안 되는 field를 위한 helper입니다. 둘 다 hidden, nullable field를 만들고, field.secret()은 추가로 select: false를 설정해서 document load 시 기본 선택 대상에서 빠지게 합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">field.hidden()</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Use it for internal state that may exist on the document but should not be treated as a normal visible field.",
                ko: "document에는 존재할 수 있지만 일반적으로 보이는 field처럼 다루면 안 되는 내부 상태에 사용합니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">field.secret()</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Use it for sensitive values such as password, phone, token, account id, wallet, or notification settings that should not be selected by default.",
                ko: "password, phone, token, account id, wallet, notification 설정처럼 기본 조회에서 빠져야 하는 민감 값에 사용합니다.",
              })}
            </div>
          </div>
        </div>
        <Code.Snippet
          title="user.constant.ts"
          code={`export class UserObject extends via(UserInput, (field) => ({
  accountId: field.secret(String).optional(),
  password: field.secret(String).optional(),
  phone: field.secret(String).optional(),
  adminMemo: field.hidden(String).optional(),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="text-search-fields" title={l.trans({ en: "Text Search Fields", ko: "텍스트 검색 field" })}>
        <Docs.Title>{l.trans({ en: "Text Search Fields", ko: "텍스트 검색 field" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A field joins the full-text index by declaring a text role. There is no separate index file and no per-model switch: the role on the field is the whole configuration.",
              ko: "field에 text 역할을 선언하면 전문 검색 index에 포함됩니다. 별도의 index 파일도, 모델 단위 스위치도 없습니다. field의 역할 선언이 설정의 전부입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Choose the role by what the value is, because the roles are weighted differently when results are ranked.",
              ko: "결과 순위를 매길 때 역할마다 가중치가 다르므로, 값의 성격에 맞는 역할을 고르세요.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          {[
            {
              title: 'text: "title"',
              desc: l.trans({
                en: "The one line a human scans for. Weighted highest.",
                ko: "사람이 눈으로 훑는 그 한 줄입니다. 가중치가 가장 높습니다.",
              }),
            },
            {
              title: 'text: "tag"',
              desc: l.trans({
                en: "A keyword list. Weighted above prose, below the title.",
                ko: "키워드 목록입니다. 본문보다 높고 제목보다 낮은 가중치입니다.",
              }),
            },
            {
              title: 'text: "desc"',
              desc: l.trans({
                en: "Prose. Weighted lowest of the matchable roles.",
                ko: "본문입니다. 검색 대상 역할 중 가중치가 가장 낮습니다.",
              }),
            },
            {
              title: 'text: "filter"',
              desc: l.trans({
                en: "A scoping value such as status, role, or owner. Matchable but weighted zero, so it never outranks a real title hit.",
                ko: "status, role, owner처럼 범위를 좁히는 값입니다. 검색은 되지만 가중치가 0이라 실제 제목 매치를 이기지 못합니다.",
              }),
            },
            {
              title: 'text: "thumb"',
              desc: l.trans({
                en: "Mirrored so a hit can be rendered, but never indexed. Do not expect it to match.",
                ko: "결과를 그릴 수 있도록 함께 저장되지만 색인되지는 않습니다. 매치를 기대하면 안 됩니다.",
              }),
            },
            {
              title: l.trans({ en: "Relations and arrays", ko: "관계와 배열" }),
              desc: l.trans({
                en: "A role works on a File reference and on an array field. An array of objects is indexed by leaf key, including a leaf that is itself an array. A field inside a Map is not indexed, because there is no fixed path to read it from.",
                ko: "File 참조와 배열 field에도 역할을 붙일 수 있습니다. 객체 배열은 leaf key 기준으로 색인되며, leaf 자체가 배열이어도 됩니다. Map 안의 field는 읽어올 고정 경로가 없어 색인되지 않습니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
        <Code.Snippet
          title="user.constant.ts"
          code={`export class UserInput extends via((field) => ({
  nickname: field(String, { default: "", text: "title" }),
  bio: field(String, { default: "", text: "desc" }),
  playing: field([String], { text: "tag" }),
  image: field(File, { text: "thumb" }).optional(),
  status: field(UserStatus, { default: "prepare", text: "filter" }),
})) {}`}
        />
        <Docs.Description>
          <div className="rounded-xl border border-error/30 bg-error/5 p-4">
            {l.trans({
              en: "A secret, hidden, or resolved field with a text role throws while the class is being built, not at query time. The same throw covers a role declared underneath one of them: field.secret(Noti) is rejected when Noti carries a role of its own, because the stored document holds that subtree in plaintext too. The search mirror stores plaintext, so indexing a secret would leak it through search. Treat the error as the rule working, not as something to route around.",
              ko: "secret, hidden, resolve field에 text 역할을 붙이면 query 시점이 아니라 class를 만드는 시점에 에러가 납니다. 그 아래에 선언된 역할도 같이 막습니다. Noti 자체가 역할을 들고 있으면 field.secret(Noti)도 거부되는데, 저장된 document는 그 하위 트리도 평문으로 담기 때문입니다. 검색 미러는 평문을 저장하므로 secret을 색인하면 검색을 통해 새어나갑니다. 우회할 대상이 아니라 규칙이 동작하는 것으로 보세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="cascade-fields" title={l.trans({ en: "Cascade Remove Fields", ko: "캐스케이드 삭제 field" })}>
        <Docs.Title>{l.trans({ en: "Cascade Remove Fields", ko: "캐스케이드 삭제 field" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'A relation field can take its target down with it. cascade: "remove" is the whole declaration, and it works on an array field too.',
              ko: '관계 field는 자신이 삭제될 때 대상까지 함께 삭제할 수 있습니다. 선언은 cascade: "remove" 하나가 전부이고, 배열 field에도 동작합니다.',
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "The removal runs through the target's service, so the target's own _postRemove runs with it. That is how a File cascade also deletes the stored object.",
                ko: "삭제는 대상의 service를 거쳐 실행되므로 대상의 _postRemove도 함께 실행됩니다. File 캐스케이드가 저장된 객체까지 삭제하는 것이 이 때문입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Only a relation accepts it. A String, an ID, or a scalar field throws while the class is being built, because none of them names a document the framework could remove.",
                ko: "관계 field에만 붙일 수 있습니다. String·ID·scalar field는 클래스 빌드 중에 throw합니다. 셋 다 프레임워크가 삭제할 수 있는 문서를 가리키지 않기 때문입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Nothing checks for other references to the same target. Declaring cascade asserts that this field owns its target exclusively, and query-level removal fires no hooks and therefore no cascade.",
                ko: "같은 대상을 참조하는 다른 문서가 있는지는 검사하지 않습니다. cascade 선언은 이 field가 대상을 단독으로 소유한다는 뜻이며, 쿼리 단위 삭제는 훅을 태우지 않으므로 캐스케이드도 돌지 않습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title="user.constant.ts"
          code={`export class UserInput extends via((field) => ({
  nickname: field(String, { default: "", text: "title" }),
  image: field(File, { text: "thumb", cascade: "remove" }).optional(),
  images: field([File], { cascade: "remove" }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="generated-extension"
        title={l.trans({ en: "Extending Generated Models", ko: "Generated model 확장" })}
      >
        <Docs.Title>{l.trans({ en: "Extending Generated Models", ko: "Generated model 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some apps extend generated model hooks from the app or library template. Spread generated inputs, objects, lights, models, and insights into via() so custom fields and generated fields stay together.",
              ko: "일부 앱은 app 또는 library template에서 생성된 model hook을 확장합니다. generated inputs, objects, lights, models, insights를 via()에 spread해서 custom field와 generated field가 함께 유지되도록 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="user.constant.ts"
          code={`import { via } from "akanjs/constant";
import { user } from "../__lib/lib.constant";

export class UserInput extends via((field) => ({}), ...user.inputs) {}

export class UserObject extends via(
  UserInput,
  (field) => ({
    githubInfo: field(GithubInfo).optional(),
  }),
  ...user.objects,
) {}

export class LightUser extends via(UserObject, ["roles"] as const, (resolve) => ({}), ...user.lights) {}

export class User extends via(UserObject, LightUser, (resolve) => ({}), ...user.models) {}

export class UserInsight extends via(User, (field) => ({}), ...user.insights) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="model-helpers"
        title={l.trans({ en: "Light And Full Model Helpers", ko: "Light와 Full model helper" })}
      >
        <Docs.Title>{l.trans({ en: "Light And Full Model Helpers", ko: "Light와 Full model helper" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A constant class can include small helper methods when the behavior belongs to the data type itself. Instance helpers fit Light classes, while list or lookup helpers often fit the full Model class as static methods.",
              ko: "동작이 데이터 타입 자체에 속한다면 constant class에 작은 helper method를 둘 수 있습니다. instance helper는 Light class에 어울리고, list 또는 lookup helper는 full Model class의 static method에 어울립니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="LightBoard helper"
            code={`export class LightBoard extends via(
  BoardObject,
  ["name", "policy", "roles"] as const,
  (resolve) => ({}),
) {
  isPrivate() {
    return this.policy.includes("private");
  }

  canWrite(user?: { roles: string[] }) {
    return user && this.roles.some((role) => user.roles.includes(role));
  }
}`}
          />
          <Code.Snippet
            title="Board static helper"
            code={`export class Board extends via(BoardObject, LightBoard, (resolve) => ({})) {
  static getBoard(boardList: LightBoard[], boardId: string) {
    return boardList.find((board) => board.id === boardId);
  }
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="resolve-fields" title={l.trans({ en: "Resolved Fields", ko: "Resolve field" })}>
        <Docs.Title>{l.trans({ en: "Resolved Fields", ko: "Resolve field" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Light and full models can declare resolved fields with the resolve helper. A resolved field is not stored directly on the document. The constant declares the field name and type, and an internal signal defines how to calculate it when the client fetches the model.",
              ko: "Light와 full model은 resolve helper로 resolved field를 선언할 수 있습니다. resolved field는 document에 직접 저장되는 값이 아닙니다. constant는 field 이름과 타입을 선언하고, internal signal이 client fetch 시 해당 값을 어떻게 계산해서 붙일지 정의합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This is useful for viewer-specific values such as whether the current user liked a story, read count for this user, permission flags, or other values that depend on request context.",
              ko: "현재 사용자가 story에 like를 눌렀는지, 이 사용자의 read count, permission flag처럼 request context에 따라 달라지는 값을 붙일 때 유용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          <Code.Snippet
            title="story.constant.ts"
            code={`export class LightStory extends via(
  StoryObject,
  ["root", "rootType", "user", "title", "policy", "totalStat", "status"] as const,
  (resolve) => ({
    view: resolve(Int),
    like: resolve(Int),
  }),
) {
  setLike() {
    if (this.like > 0) return false;
    this.totalStat.likes += this.like <= 0 ? 1 : 0;
    this.like = 1;
    return true;
  }
}`}
          />
          <Code.Snippet
            title="story.signal.ts"
            code={`export class StoryInternal extends internal(srv.story.with(srv.actionLog), ({ resolveField }) => ({
  view: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      return self
        ? ((await this.actionLogService.queryLoad({ action: "view", target: story.id, user: self.id }))?.value ?? 0)
        : 0;
    }),
  like: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      return self
        ? ((await this.actionLogService.queryLoad({ action: "like", target: story.id, user: self.id }))?.value ?? 0)
        : 0;
    }),
})) {}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="scalar-static-utilities"
        title={l.trans({ en: "Scalar Constants And Static Utilities", ko: "Scalar constant와 static utility" })}
      >
        <Docs.Title>
          {l.trans({ en: "Scalar Constants And Static Utilities", ko: "Scalar constant와 static utility" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Scalars are embedded values without their own collection. They can still expose useful static helpers, especially for calculations or transforms that belong to the scalar value.",
              ko: "Scalar는 자체 collection이 없는 embedded value입니다. 그래도 값 자체에 속하는 계산이나 변환이라면 유용한 static helper를 노출할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="coordinate.constant.ts"
          code={`import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class CoordinateType extends enumOf("coordinateType", ["Point"] as const) {}

export class Coordinate extends via((field) => ({
  type: field(CoordinateType, { default: "Point" }),
  coordinates: field([Float], { default: [0, 0] }),
  altitude: field(Float, { default: 0 }),
})) {
  static getTotalDistanceKm(...coords: Coordinate[]) {
    return coords.reduce((acc, cur, idx) => {
      if (idx === 0) return 0;
      return acc + Coordinate.getDistanceKm(coords[idx - 1], cur);
    }, 0);
  }

  static getDistanceKm(loc1: Coordinate, loc2: Coordinate) {
    // distance calculation belongs to Coordinate itself
    return 0;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="insight-constants" title={l.trans({ en: "Insight Constants", ko: "Insight constant" })}>
        <Docs.Title>{l.trans({ en: "Insight Constants", ko: "Insight constant" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Insight constants describe aggregated or reporting-oriented values. Use them for dashboard counts, summaries, and grouped statistics instead of mixing reporting fields into the normal model shape.",
              ko: "Insight constant는 집계 또는 reporting 지향 값을 설명합니다. dashboard count, summary, grouped statistic을 일반 model shape에 섞지 말고 Insight에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="ticket.constant.ts"
          code={`import { Int } from "akanjs/base";

export class TicketInsight extends via(Ticket, (field) => ({
  appCount: field(Int, { default: 0, accumulate: { type: "app" } }),
  sharedCount: field(Int, { default: 0, accumulate: { type: "shared" } }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Use the Input, Object, Light, Model, Insight layers for document models unless the value is a small embedded scalar.",
                ko: "작은 embedded scalar가 아니라면 document model에는 Input, Object, Light, Model, Insight 계층을 사용합니다.",
              }),
              l.trans({
                en: "Use enumOf for business categories and refer to its value type when you need the union.",
                ko: "비즈니스 category에는 enumOf를 사용하고 union이 필요하면 해당 enum의 value type을 참조합니다.",
              }),
              l.trans({
                en: "Use generated extension spreads when the app template provides inputs, objects, lights, models, or insights.",
                ko: "app template이 inputs, objects, lights, models, insights를 제공한다면 generated extension spread를 사용합니다.",
              }),
              l.trans({
                en: "Use field.hidden for hidden internal values and field.secret for sensitive values that should not be selected by default.",
                ko: "숨겨진 내부 값에는 field.hidden을, 기본 조회에서 빠져야 하는 민감 값에는 field.secret을 사용합니다.",
              }),
              l.trans({
                en: "Use resolve fields for values calculated by signal context instead of storing viewer-specific data directly on the model.",
                ko: "viewer별로 달라지는 값을 model에 직접 저장하지 말고 signal context로 계산되는 resolve field를 사용합니다.",
              }),
              l.trans({
                en: "Put pure helper behavior on constants only when it clearly belongs to the data type.",
                ko: "helper 동작은 데이터 타입에 명확히 속할 때만 constant에 둡니다.",
              }),
              l.trans({
                en: "Import other constants from direct file paths to avoid circular barrel references.",
                ko: "순환 barrel reference를 피하기 위해 다른 constant는 직접 파일 경로에서 import합니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
