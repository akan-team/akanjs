import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="dictionary-overview" title="model.dictionary.ts">
        <Docs.Title>model.dictionary.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A dictionary file is the language layer of a module. It gives user-facing names to model fields, insight values, queries, sort options, enums, slices, endpoints, errors, and module-specific UI text.",
              ko: "dictionary 파일은 module의 언어 레이어입니다. model field, insight 값, query, sort option, enum, slice, endpoint, error, module 전용 UI 문구에 사용자에게 보이는 이름을 붙입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The current pattern is typed. Dictionary keys should follow the shape of the constant, document filter, slice, and endpoint instead of becoming arbitrary translation strings.",
              ko: "현재 패턴은 type 기반입니다. dictionary key는 임의의 번역 문자열이 아니라 constant, document filter, slice, endpoint의 shape을 따라가야 합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="model-dictionary-pattern"
        title={l.trans({ en: "Model Dictionary Pattern", ko: "Model dictionary 패턴" })}
      >
        <Docs.Title>{l.trans({ en: "Model Dictionary Pattern", ko: "Model dictionary 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use modelDictionary for normal document models. The chain usually starts with the model name, then adds field labels, insight labels, document query/sort labels, enum values, signal labels, errors, and custom UI text.",
              ko: "일반 document model에는 modelDictionary를 사용합니다. 보통 model 이름에서 시작해서 field label, insight label, document query/sort label, enum 값, signal label, error, custom UI text를 차례로 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="ticket.dictionary.ts"
          code={`import { modelDictionary } from "akanjs/dictionary";

import type { Ticket, TicketInsight, TicketStatus } from "./ticket.constant";
import type { TicketFilter } from "./ticket.document";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Ticket", "티켓"]).desc(["Ticket", "티켓"]))
  .model<Ticket>((t) => ({
    title: t(["Title", "제목"]).desc(["Title", "제목"]),
  }))
  .insight<TicketInsight>((t) => ({
    appCount: t(["App Tickets", "앱 티켓"]).desc(["App ticket count", "앱 티켓 개수"]),
  }))
  .query<TicketFilter>((fn) => ({
    inProject: fn(["In Project", "프로젝트별 조회"]).arg((t) => ({
      project: t(["Project", "프로젝트"]),
    })),
  }))
  .sort<TicketFilter>((t) => ({
    due: t(["Due Date", "기한"]),
  }))
  .enum<TicketStatus>("ticketStatus", (t) => ({
    active: t(["Active", "활성"]),
  }));`}
        />
        <div className="grid gap-3 xl:grid-cols-3">
          {[
            {
              title: ".model",
              desc: l.trans({
                en: "Labels fields from the constant model. Base fields such as id, createdAt, updatedAt, and removedAt are added automatically.",
                ko: "constant model의 field에 label을 붙입니다. id, createdAt, updatedAt, removedAt 같은 base field는 자동으로 추가됩니다.",
              }),
            },
            {
              title: ".insight",
              desc: l.trans({
                en: "Labels reporting fields. The base count insight is added automatically.",
                ko: "reporting field에 label을 붙입니다. base insight인 count는 자동으로 추가됩니다.",
              }),
            },
            {
              title: ".query / .sort",
              desc: l.trans({
                en: "Labels document filter options. Base query and sort labels such as any, latest, oldest, and relevance are included.",
                ko: "document filter option에 label을 붙입니다. any, latest, oldest, relevance 같은 base query/sort label이 포함됩니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 p-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="using-dictionary" title={l.trans({ en: "Using Dictionaries", ko: "Dictionary 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Using Dictionaries", ko: "Dictionary 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "After a dictionary is declared, most code uses it through generated helpers. Client components read translated labels with usePage(), server code throws Err with an error key, and client stores show translated toast messages with msg.",
              ko: "dictionary를 선언한 뒤에는 대부분 generated helper를 통해 사용합니다. client component는 usePage()로 번역 label을 읽고, server code는 error key로 Err를 던지며, client store는 msg로 번역된 toast message를 보여줍니다.",
            })}
          </div>
        </Docs.Description>
        <div className="">
          <Code.Snippet
            title="Client UI"
            code={`import { usePage } from "@apps/myapp/client";

export const UserNameField = () => {
  const { l } = usePage();
  return <Field.Text label={l("user.name")} desc={l("user.name.desc")} />;
};`}
          />
          <Code.Snippet
            title="Server Error"
            code={`import { Err } from "../dict";

if (!ticket.canArchive()) {
  throw new Err("ticket.error.cannotArchive");
}`}
          />
          <Code.Snippet
            title="Client Toast"
            code={`import { msg } from "@apps/myapp/client";

msg.loading("ticket.openTicketLoading", { key: "openTicket" });
await fetch.openTicket(ticketId, due);
msg.success("ticket.openTicketSuccess", { key: "openTicket" });
msg.error("ticket.error.cannotArchive");`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="generated-extension"
        title={l.trans({ en: "Extending Generated Dictionaries", ko: "Generated dictionary 확장" })}
      >
        <Docs.Title>{l.trans({ en: "Extending Generated Dictionaries", ko: "Generated dictionary 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When an app extends a generated or library model, extend the generated dictionaries too. Passing ...user.dictionaries keeps the base dictionary entries and lets the app add only its custom fields, endpoints, or phrases.",
              ko: "app이 generated 또는 library model을 확장한다면 dictionary도 함께 확장합니다. ...user.dictionaries를 넘기면 base dictionary entry를 유지하면서 app이 custom field, endpoint, phrase만 추가할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="user.dictionary.ts"
          code={`import { modelDictionary } from "akanjs/dictionary";

import { user } from "../__lib/lib.dictionary";
import type { User } from "./user.constant";

export const dictionary = modelDictionary(["en", "ko"], ...user.dictionaries)
  .model<User>((t) => ({
    githubInfo: t(["Github Info", "깃허브 정보"]).desc(["Github info of the user", "유저의 깃허브 정보"]),
  }))
  .translate({});`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="scalar-service-dictionaries"
        title={l.trans({ en: "Scalar And Service Dictionaries", ko: "Scalar와 service dictionary" })}
      >
        <Docs.Title>{l.trans({ en: "Scalar And Service Dictionaries", ko: "Scalar와 service dictionary" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Choose the dictionary builder by module shape. Document models use modelDictionary, embedded scalar values use scalarDictionary, and service-only modules use serviceDictionary.",
              ko: "module 형태에 따라 dictionary builder를 선택합니다. document model은 modelDictionary, embedded scalar 값은 scalarDictionary, service-only module은 serviceDictionary를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-3">
          {[
            {
              title: "modelDictionary",
              desc: l.trans({
                en: "For document models with model, insight, query, sort, slice, endpoint, error, and custom translations.",
                ko: "model, insight, query, sort, slice, endpoint, error, custom 번역이 필요한 document model에 사용합니다.",
              }),
            },
            {
              title: "scalarDictionary",
              desc: l.trans({
                en: "For embedded scalar values. It usually needs only model fields, enum values, errors, or small custom text.",
                ko: "embedded scalar 값에 사용합니다. 보통 model field, enum 값, error, 작은 custom text 정도만 필요합니다.",
              }),
            },
            {
              title: "serviceDictionary",
              desc: l.trans({
                en: "For service modules or app-level dictionaries without a document model.",
                ko: "document model이 없는 service module 또는 app-level dictionary에 사용합니다.",
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
          title="coordinate.dictionary.ts"
          code={`import { scalarDictionary } from "akanjs/dictionary";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Coordinate", "좌표"]).desc(["Geographic coordinate information", "지리적 좌표 정보"]))
  .model<Coordinate>((t) => ({
    type: t(["Type", "타입"]).desc(["Coordinate type", "좌표 타입"]),
  }))
  .enum<CoordinateType>("coordinateType", (t) => ({
    Point: t(["Point", "포인트"]),
  }));`}
        />
        <Code.Snippet
          title="util.dictionary.ts"
          code={`import { serviceDictionary } from "akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko"]).translate({
  home: ["Home", "홈"],
});`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="errors-language-rules"
        title={l.trans({ en: "Errors, UI Text, And Languages", ko: "Error, UI 문구, 언어 목록" })}
      >
        <Docs.Title>{l.trans({ en: "Errors, UI Text, And Languages", ko: "Error, UI 문구, 언어 목록" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use error() for domain errors and translate() for module-specific UI phrases. The translation array order must match the language list exactly.",
              ko: "domain error에는 error()를, module 전용 UI 문구에는 translate()를 사용합니다. 번역 배열의 순서는 language list와 정확히 일치해야 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="ticket.dictionary.ts"
          code={`.error({
  cannotArchive: ["Cannot archive ticket that is not completed", "완료되지 않은 티켓은 보관할 수 없습니다"],
})
.translate({
  openTicketLoading: ["Opening.", "오픈중입니다."],
})`}
        />
        <Code.Snippet
          title="akan.dictionary.ts"
          code={`export const dictionary = serviceDictionary(["en", "ko", "zhChs", "zhCht"]).translate({
  menuGallery: ["Gallery", "갤러리", "画廊", "畫廊"],
});`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Keep dictionary keys aligned with typed constants, filters, slices, and endpoints.",
                ko: "dictionary key는 typed constant, filter, slice, endpoint와 맞춰둡니다.",
              }),
              l.trans({
                en: "Use clear labels for users, not raw variable names. For example, Due Date is better than due.",
                ko: "raw 변수명보다 사용자에게 읽히는 label을 사용합니다. 예를 들어 due보다 Due Date가 낫습니다.",
              }),
              l.trans({
                en: "Add desc() when the label may appear in generated docs, forms, or tooltips.",
                ko: "generated docs, form, tooltip에 보일 수 있는 label에는 desc()를 추가합니다.",
              }),
              l.trans({
                en: "Use usePage translation in client UI, Err in server logic, and msg in client stores when showing dictionary text.",
                ko: "dictionary text를 보여줄 때 client UI에서는 usePage translation, server logic에서는 Err, client store에서는 msg를 사용합니다.",
              }),
              l.trans({
                en: "Extend generated dictionaries with ...model.dictionaries before adding app-specific translations.",
                ko: "app 전용 번역을 추가하기 전에 ...model.dictionaries로 generated dictionary를 확장합니다.",
              }),
              l.trans({
                en: "Keep every translation tuple in the same order and length as the language list.",
                ko: "모든 translation tuple은 language list와 같은 순서와 길이를 유지합니다.",
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
