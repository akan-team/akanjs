import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Image } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="icecream-business" title={l.trans({ en: "Icecream business", ko: "아이스크림 비즈니스" })}>
        <Docs.Title>{l.trans({ en: "Icecream business", ko: "아이스크림 비즈니스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `You are now the owner of a Korean-style yogurt ice cream shop, "Ko-yo". The shop is located in San Francisco and you need to open the shop and start your business. The shop is 20 square meters in size.`,
              ko: `당신은 이제부터 한국식 요거트 아이스크림 가게, "Ko-yo" 사장님입니다. 가게는 미국 샌프란시스코에 위치해있으며 20제곱미터 남짓한 공간을 가지고 있습니다. 이제 가게를 오픈해 장사를 시작해야 합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `The concept of Korean-style yogurt ice cream is that customers can freely add their desired toppings to the yogurt base ice cream. You need to implement a order form to allow customers to select and add toppings freely.`,
              ko: `한국식 요거트 아이스크림의 컨셉은 고객이 자유롭게 원하는 토핑을 요거트 베이스 아이스크림 위에 추가할 수 있게 하는 것입니다. 자유로운 고객의 선택과 경험을 위해 주문서 작성 기능을 구현해야 합니다.`,
            })}
          </div>
          <div className="flex justify-center">
            <Image
              src="/akanjsImage/koyo/start-business.png"
              alt="start-business"
              className="w-1/2"
              width={512}
              height={512}
            />
          </div>
          <div>
            {l.trans({
              en: `First, let's create an akan app with the project code "koyo". The koyo project is a service that operates all services under your company as the brand "Ko-yo". Now, let's type the following command in the terminal.`,
              ko: `먼저, koyo라는 프로젝트 코드로 akan app을 만들어봅시다. koyo 프로젝트는 당신의 회사가 해당 브랜드로 운영하는 모든 온라인 서비스를 해당 폴더에서 관리할 수 있게 해줍니다. 이제 터미널에서 다음 명령어를 입력해봅시다.`,
            })}
          </div>
          <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan create-application koyo" />
          <div>
            {l.trans({
              en: `Now, you can run the koyo service locally with the following command. Then, you can access the service at http://localhost:8282.`,
              ko: `이제, koyo 서비스를 로컬 환경에서 다음과 같이 실행할 수 있으며, 브라우저에서 http://localhost:8282 로 접속하면 됩니다.`,
            })}
          </div>
          <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan start koyo" />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide
        id="create-module"
        title={l.trans({ en: "Create icecream order module", ko: "아이스크림 주문 모듈 만들기" })}
      >
        <Docs.Title>{l.trans({ en: "Create icecream order module", ko: "아이스크림 주문 모듈 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now, customers want to order the ice cream. The order is simple. You need to select the size of the yogurt base ice cream and check the desired toppings.`,
              ko: `자 이제 고객들이 주문을 전산화하고자 합니다. 요거트 아이스크림 주문은 단순합니다. 요거트 베이스 아이스크림 양을 소, 중, 대로 선택하고 원하는 토핑을 체크해서 주문을 할 수 있게 해야 합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `In Akan.js, we organize features into "modules" - think of them as complete packages that handle everything related to one thing. An ice cream order module will contain all the code needed to create, display, and manage ice cream orders.`,
              ko: `Akan.js에서는 기능을 "모듈"로 구성합니다. 모듈은 하나의 기능과 관련된 모든 것을 처리하는 완전한 패키지라고 생각하면 됩니다. 아이스크림 주문 모듈은 아이스크림 주문을 생성, 표시, 관리하는 데 필요한 모든 코드를 포함합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `When you create a module, Akan.js automatically generates all the files you need following a consistent pattern. This makes your code organized and easy to understand.`,
              ko: `모듈을 생성하면 Akan.js가 일관된 패턴에 따라 필요한 모든 파일을 자동으로 생성합니다. 이렇게 하면 코드가 체계적으로 정리되고 이해하기 쉬워집니다.`,
            })}
          </div>
          <div className="flex items-center justify-center gap-4">
            <Image
              src="/akanjsImage/koyo/toppings.png"
              alt="toppings"
              className="w-2/3 md:w-1/3"
              width={512}
              height={512}
            />
            <div className="overflow-x-auto">
              <table className="table-xs md:table-sm table">
                <tbody>
                  {/* row 1 후르트링, 오레오, 딸기, 망고, 치즈큐브, 벌집꿀, 그래놀라, 바나나, 무화과 */}
                  <tr>
                    <th>1</th>
                    <td>{l.trans({ en: "Fruit Ring", ko: "후르트링" })}</td>
                  </tr>
                  {/* row 2 */}
                  <tr>
                    <th>2</th>
                    <td>{l.trans({ en: "Oreo", ko: "오레오" })}</td>
                  </tr>
                  {/* row 3 */}
                  <tr>
                    <th>3</th>
                    <td>{l.trans({ en: "Strawberry", ko: "딸기" })}</td>
                  </tr>
                  {/* row 4 */}
                  <tr>
                    <th>4</th>
                    <td>{l.trans({ en: "Mango", ko: "망고" })}</td>
                  </tr>
                  {/* row 5 */}
                  <tr>
                    <th>5</th>
                    <td>{l.trans({ en: "Cheese Cube", ko: "치즈큐브" })}</td>
                  </tr>
                  {/* row 6 */}
                  <tr>
                    <th>6</th>
                    <td>{l.trans({ en: "Corn", ko: "옥수수" })}</td>
                  </tr>
                  {/* row 7 */}
                  <tr>
                    <th>7</th>
                    <td>{l.trans({ en: "Granola", ko: "그래놀라" })}</td>
                  </tr>
                  {/* row 8 */}
                  <tr>
                    <th>8</th>
                    <td>{l.trans({ en: "Banana", ko: "바나나" })}</td>
                  </tr>
                  {/* row 9 */}
                  <tr>
                    <th>9</th>
                    <td>{l.trans({ en: "Fig", ko: "무화과" })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Now, let's create a domain for the ice cream order. The domain name is icecreamOrder, and it stores information about each ice cream order.`,
              ko: `이제 아이스크림 주문에 대한 도메인 모듈을 만들어봅시다. 도메인 이름은 icecreamOrder로, 아이스크림 개별 주문 건에 대한 정보를 저장하고 있는 객체입니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`
akan create-module icecreamOrder
# then select koyo application`}
          />
          <div>
            {l.trans({
              en: `This command will ask you which application to add the module to - select "koyo" since that's our ice cream shop app. The module name "icecreamOrder" describes what this module handles.`,
              ko: `이 명령어는 모듈을 어떤 애플리케이션에 추가할지 묻습니다 - 우리의 아이스크림 가게 앱이므로 "koyo"를 선택하세요. 모듈 이름 "icecreamOrder"는 이 모듈이 무엇을 처리하는지 설명합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `After running this command, Akan.js creates a complete folder structure with all the files you need. Let's look at what gets created:`,
              ko: `이 명령어를 실행하면 Akan.js가 필요한 모든 파일이 포함된 완전한 폴더 구조를 생성합니다. 무엇이 생성되는지 살펴봅시다:`,
            })}
          </div>
          <Code.Snippet
            language="bash"
            copy={false}
            showLineNumbers={false}
            code={`
└── apps/          # ${l.trans({ en: "Application code", ko: "애플리케이션 코드" })}
    └── koyo/      # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
        └── lib/          # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
            └── icecreamOrder/  # ${l.trans({ en: "Icecream order domain module", ko: "아이스크림 주문 도메인 모듈" })}
                ├── icecreamOrder.abstract.md   # ${l.trans({ en: "Business intent", ko: "비즈니스 의도" })}
                ├── icecreamOrder.constant.ts   # ${l.trans({ en: "Types and schemas", ko: "타입과 스키마" })}
                ├── icecreamOrder.dictionary.ts # ${l.trans({ en: "Translations", ko: "번역" })}
                ├── icecreamOrder.document.ts   # ${l.trans({ en: "Document", ko: "문서" })}
                ├── icecreamOrder.service.ts    # ${l.trans({ en: "Business logic", ko: "비즈니스 로직" })}
                ├── icecreamOrder.signal.ts     # ${l.trans({ en: "API endpoints", ko: "API 엔드포인트" })}
                ├── icecreamOrder.store.ts      # ${l.trans({ en: "State management", ko: "상태 관리" })}
                ├── icecreamOrder.Template.tsx  # ${l.trans({ en: "Form UI", ko: "수정/생성 UI" })}
                ├── icecreamOrder.Unit.tsx      # ${l.trans({ en: "Overview UI", ko: "개요 UI" })}
                ├── icecreamOrder.Util.tsx      # ${l.trans({ en: "Utility UI", ko: "유틸리티 UI" })}
                ├── icecreamOrder.View.tsx      # ${l.trans({ en: "Detail view UI", ko: "상세 뷰 UI" })}
                └── icecreamOrder.Zone.tsx      # ${l.trans({ en: "Integration UI", ko: "통합 UI" })}`}
          />
          <div>
            {l.trans({
              en: `Each file has a specific purpose in organizing your ice cream order feature:`,
              ko: `각 파일은 아이스크림 주문 기능을 구성하는 데 특정한 목적을 가지고 있습니다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-primary">🧭</span>
              <div>
                <strong>{l.trans({ en: "abstract.md", ko: "abstract.md" })}</strong>:{" "}
                {l.trans({
                  en: "Describes the module's business intent, domain rules, workflows, and agent notes",
                  ko: "모듈의 비즈니스 의도, 도메인 규칙, 워크플로우, agent 주의사항을 설명",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">📋</span>
              <div>
                <strong>{l.trans({ en: "constant.ts", ko: "constant.ts" })}</strong>:{" "}
                {l.trans({
                  en: "Defines what an ice cream order looks like (size, toppings, etc.)",
                  ko: "아이스크림 주문이 어떻게 생겼는지 정의 (사이즈, 토핑 등)",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">🌍</span>
              <div>
                <strong>{l.trans({ en: "dictionary.ts", ko: "dictionary.ts" })}</strong>:{" "}
                {l.trans({
                  en: "Translates technical terms into user-friendly language",
                  ko: "기술적 용어를 사용자 친화적인 언어로 번역",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">🗄️</span>
              <div>
                <strong>{l.trans({ en: "document.ts", ko: "document.ts" })}</strong>:{" "}
                {l.trans({
                  en: "Handles database storage and retrieval",
                  ko: "데이터베이스 저장 및 검색 처리",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">⚙️</span>
              <div>
                <strong>{l.trans({ en: "service.ts", ko: "service.ts" })}</strong>:{" "}
                {l.trans({
                  en: "Contains business logic (creating orders, calculating prices)",
                  ko: "비즈니스 로직 포함 (주문 생성, 가격 계산)",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">🔗</span>
              <div>
                <strong>{l.trans({ en: "signal.ts", ko: "signal.ts" })}</strong>:{" "}
                {l.trans({
                  en: "Connects frontend to backend with API calls",
                  ko: "API 호출로 프론트엔드와 백엔드 연결",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">📦</span>
              <div>
                <strong>{l.trans({ en: "store.ts", ko: "store.ts" })}</strong>:{" "}
                {l.trans({
                  en: "Manages form state and user interactions",
                  ko: "폼 상태 및 사용자 상호작용 관리",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">🎨</span>
              <div>
                <strong>{l.trans({ en: "UI Files (.tsx)", ko: "UI 파일들 (.tsx)" })}</strong>:{" "}
                {l.trans({
                  en: "Create the visual components customers see and interact with",
                  ko: "고객이 보고 상호작용하는 시각적 컴포넌트 생성",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Don't worry about understanding every file right now! We'll work through them step by step. The important thing is that Akan.js is based on this organized structure.`,
              ko: `지금 당장 모든 파일을 이해할 필요는 없습니다! 단계별로 차근차근 진행해보겠습니다. 중요한 것은 Akan.js가 이런 체계적인 구조를 기반으로 작동한다는 것입니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="define-constant" title={l.trans({ en: "Define Constant", ko: "Constant 정의하기" })}>
        <Docs.Title>{l.trans({ en: "Define Constant", ko: "Constant 정의하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Constant file is a file that defines the shape of the object in the domain. It stores the shape of the object in the database and allows the client to query and represent data based on this shape.`,
              ko: `Constant 파일은 도메인의 객체가 어떻게 생겼는지 정의하는 파일입니다. 객체의 형태를 데이터베이스에 저장해 기억하고, 클라이언트에서 이 형태를 기반으로 데이터를 조회하고 표현할 수 있습니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.constant.ts"
            code={`
import { enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class IcecreamOrderStatus extends enumOf("icecreamOrderStatus", [
  "active",
  "processing",
  "served",
  "finished",
  "canceled",
] as const) {}

export class Topping extends enumOf("topping", [
  "fruitRings",
  "oreo",
  "strawberry",
  "mango",
  "cheeseCube",
  "corn",
  "granola",
  "banana",
  "fig",
] as const) {}

export class IcecreamOrderInput extends via((field) => ({
  size: field(Int, { min: 50, max: 200}), // [!code highlight:2]
  toppings: field([Topping]),
})) {}

export class IcecreamOrderObject extends via(IcecreamOrderInput, (field) => ({
  status: field(IcecreamOrderStatus, { default: "active" }), // [!code highlight]
})) {}

export class LightIcecreamOrder extends via(
  IcecreamOrderObject,
  ["size", "toppings", "status"] as const,
  (resolve) => ({})
) {}

export class IcecreamOrder extends via(IcecreamOrderObject, LightIcecreamOrder, (resolve) => ({})) {}

export class IcecreamOrderInsight extends via(IcecreamOrder, (field) => ({})) {}
`}
          />
          <div>
            {l.trans({
              en: `The ice cream order can be represented as an object like the above. The IcecreamOrderInput, which is information for creating an order, can create an order by specifying the size and toppings of the ice cream.`,
              ko: `아이스크림 주문은 위와 같은 객체로 표현할 수 있습니다. 주문을 생성하기 위한 정보인 IcecreamOrderInput은 아이스크림 사이즈와 토핑을 정하면 주문을 만들 수 있습니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Great! Now we have defined what our ice cream order looks like. But how will customers see "size" and "toppings" in their own language? That's where the dictionary comes in next.`,
              ko: `좋습니다! 이제 아이스크림 주문이 어떻게 생겼는지 정의했습니다. 하지만 고객들이 "size"와 "toppings"를 자신의 언어로 어떻게 볼 수 있을까요? 바로 여기서 dictionary가 필요합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="fill-dictionary" title={l.trans({ en: "Fill dictionary", ko: "Dictionary 채우기" })}>
        <Docs.Title>{l.trans({ en: "Fill dictionary", ko: "Dictionary 채우기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `To display and describe each data of the object to the user, you need to fill the dictionary file. You can set how to display each field to the user in the dictionary, and multi-language display is supported by default.`,
              ko: `객체의 각 데이터가 사용자에게 표기되고 설명되기 위해서는 dictionary 파일을 채워야 합니다. Dictionary에서 각 필드를 사용자에게 어떻게 표출할 지 설정할 수 있고, 다국어 표기도 기본으로 지원됩니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `The dictionary starts with two important entries that describe your entire module:`,
              ko: `Dictionary는 전체 모듈을 설명하는 두 가지 중요한 항목으로 시작합니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🏷️</span>
                <strong className="text-primary">modelName</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `This is what users will see as the title or name of your feature. Instead of the technical "icecreamOrder", users see "Ice cream Order" in English or "아이스크림 주문" in Korean.`,
                  ko: `사용자가 기능의 제목이나 이름으로 보게 될 내용입니다. 기술적인 "icecreamOrder" 대신 영어로는 "Ice cream Order", 한국어로는 "아이스크림 주문"을 보게 됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">📝</span>
                <strong className="text-primary">modelDesc</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `This provides a longer explanation of what this feature does. It helps users understand the purpose and context of ice cream orders in your shop.`,
                  ko: `이 기능이 무엇을 하는지에 대한 더 긴 설명을 제공합니다. 사용자가 가게에서 아이스크림 주문의 목적과 맥락을 이해하는 데 도움이 됩니다.`,
                })}
              </div>
            </div>
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/icecreamOrder.dictionary.ts"
            code={`
import { modelDictionary } from "akanjs/dictionary"; // [!code collapse:2]

import type { IcecreamOrder, IcecreamOrderInsight, IcecreamOrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal"; // [!code collapse:2]

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "IcecreamOrder is an option that customers can choose when ordering icecream at koyo store.",
      "아이스크림 주문은 koyo 가게에서 고객이 아이스크림을 주문할 때 커스텀할 수 있는 옵션들을 선택할 수 있습니다.",
    ])
  )
  .model<IcecreamOrder>((t) => ({
    size: t(["Size", "사이즈"]).desc(["Size of the icecream order", "아이스크림 주문의 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Toppings of the icecream order", "아이스크림 주문의 토핑"]),
    status: t(["Status", "상태"]).desc(["Status of the icecream order", "아이스크림 주문의 상태"]),
  }))
  .enum<IcecreamOrderStatus>("icecreamOrderStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Active status of the icecream order", "아이스크림 주문의 활성 상태"]),
    processing: t(["Processing", "처리중"]).desc([
      "Processing status of the icecream order",
      "아이스크림 주문의 처리중 상태",
    ]),
    served: t(["Served", "서빙완료"]).desc(["Served status of the icecream order", "아이스크림 주문의 서빙완료 상태"]),
    finished: t(["Finished", "완료"]).desc(["Finished status of the icecream order", "아이스크림 주문의 완료 상태"]),
    canceled: t(["Canceled", "취소"]).desc(["Canceled status of the icecream order", "아이스크림 주문의 취소 상태"]),
  }))
  .enum<Topping>("topping", (t) => ({
    fruitRings: t(["Fruit Rings", "과일 링"]).desc(["Fruit Rings topping", "과일 링 토핑"]),
    oreo: t(["Oreo", "오레오"]).desc(["Oreo topping", "오레오 토핑"]),
    strawberry: t(["Strawberry", "딸기"]).desc(["Strawberry topping", "딸기 토핑"]),
    mango: t(["Mango", "망고"]).desc(["Mango topping", "망고 토핑"]),
    cheeseCube: t(["Cheese Cube", "치즈 큐브"]).desc(["Cheese Cube topping", "치즈 큐브 토핑"]),
    corn: t(["Corn", "옥수수"]).desc(["Corn topping", "옥수수 토핑"]),
    granola: t(["Granola", "그래놀라"]).desc(["Granola topping", "그래놀라 토핑"]),
    banana: t(["Banana", "바나나"]).desc(["Banana topping", "바나나 토핑"]),
    fig: t(["Fig", "피그"]).desc(["Fig topping", "피그 토핑"]),
  }))
  .insight<IcecreamOrderInsight>((t) => ({})) // [!code collapse:7]
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["IcecreamOrder In Public", "IcecreamOrder 공개"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({}))
  .error({})
  .translate({});
`}
          />
          <div>
            {l.trans({
              en: `These translations make your app user-friendly! For example, when customers visit your ice cream shop website, they'll see "Ice cream Order" as a page title, not the technical "icecreamOrder". The description helps explain what the page is for.`,
              ko: `이러한 번역은 앱을 사용자 친화적으로 만듭니다! 예를 들어, 고객이 아이스크림 가게 웹사이트를 방문하면 기술적인 "icecreamOrder"가 아닌 "아이스크림 주문"을 페이지 제목으로 보게 됩니다. 설명은 페이지가 무엇을 위한 것인지 설명하는 데 도움이 됩니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Now customers will see "Size" instead of "size" and "Small/Medium/Large" instead of "50/100/200". Next, let's create the actual form where customers can place their orders.`,
              ko: `이제 고객들은 "size" 대신 "사이즈"를, "50/100/200" 대신 "소형/중형/대형"을 보게 됩니다. 다음으로, 고객이 실제로 주문할 수 있는 폼을 만들어봅시다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="make-template" title={l.trans({ en: "Make template file", ko: "Template 파일 만들기" })}>
        <Docs.Title>{l.trans({ en: "Make template file", ko: "Template 파일 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's create the order form that customers will use. The Template file creates input forms where customers can select ice cream size and toppings.`,
              ko: `이제 고객이 사용할 주문 폼을 만들어봅시다. Template 파일은 고객이 아이스크림 사이즈와 토핑을 선택할 수 있는 입력 폼을 생성합니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Template.tsx"
            code={`
"use client"; // [!code collapse:8]
import { Field, Layout } from "akanjs/ui";
import { cnst, st, usePage } from "@apps/koyo/client";

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const icecreamOrderForm = st.use.icecreamOrderForm();
  return (
    <Layout.Template className={className}>
      <Field.ToggleSelect
        label={l("icecreamOrder.size")}
        items={[50, 100, 200].map((size) => ({ label: \`\${size}cc\`, value: size }))}
        value={icecreamOrderForm.size}
        onChange={st.do.setSizeOnIcecreamOrder}
      />
      <Field.MultiToggleSelect
        label={l("icecreamOrder.toppings")}
        items={cnst.Topping}
        value={icecreamOrderForm.toppings}
        onChange={st.do.setToppingsOnIcecreamOrder}
      />
    </Layout.Template>
  );
};`}
          />
          <div>
            {l.trans({
              en: `This code creates two input fields: one for selecting ice cream size (small/medium/large) and another for choosing multiple toppings. The Field.ToggleSelect shows three size options as buttons, while Field.MultiToggleSelect allows customers to pick several toppings at once.`,
              ko: `이 코드는 두 개의 입력 필드를 만듭니다: 아이스크림 사이즈 선택(소/중/대)과 다중 토핑 선택입니다. Field.ToggleSelect는 세 가지 크기 옵션을 버튼으로 보여주고, Field.MultiToggleSelect는 고객이 여러 토핑을 한 번에 선택할 수 있게 합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `The "st.use.icecreamOrderForm()" gets the current form data, while "st.do.setSizeOnIcecreamOrder" and "st.do.setToppingsOnIcecreamOrder" update the form when customers make selections.`,
              ko: `"st.use.icecreamOrderForm()"은 현재 폼 데이터를 가져오고, "st.do.setSizeOnIcecreamOrder"와 "st.do.setToppingsOnIcecreamOrder"는 고객이 선택할 때 폼을 업데이트합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <div className="my-6 rounded-lg border border-base-300 bg-base-100 p-4">
        <div className="text-base-content/80">
          {l.trans({
            en: `🎉 Now customers can create orders using your form. But how do we show those orders in a nice, visual way? Let's create a card design to display each order beautifully.`,
            ko: `🎉 이제 고객들이 폼을 사용해서 주문을 생성할 수 있습니다. 하지만 그 주문들을 멋지고 시각적인 방법으로 어떻게 보여줄까요? 각 주문을 아름답게 표시할 카드 디자인을 만들어봅시다.`,
          })}
        </div>
      </div>
      <Scroll.Slide id="update-unit" title={l.trans({ en: "Update unit file", ko: "Unit 파일 업데이트" })}>
        <Docs.Title>{l.trans({ en: "Update unit file", ko: "Unit 파일 업데이트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The Unit file shows how each order looks in a list or card view. Think of it as the "receipt" or "order summary" that displays the order information nicely.`,
              ko: `Unit 파일은 각 주문이 목록이나 카드 형태로 어떻게 보이는지 보여줍니다. 주문 정보를 예쁘게 표시하는 "영수증"이나 "주문 요약"이라고 생각하면 됩니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
            code={`
import { clsx, ModelProps } from "akanjs/client"; // [!code collapse:3]
import { cnst, usePage } from "@apps/koyo/client";

export const Card = ({ icecreamOrder }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl border border-base-300 bg-base-100 px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <span className="inline-block rounded border border-base-300 bg-base-200 px-2 py-1 text-xs font-bold tracking-wider text-primary uppercase">
            {l("icecreamOrder.id")}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-block rounded bg-base-200 px-2 py-1 text-xs font-bold tracking-wider text-primary uppercase">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={clsx("ml-2 rounded-full border border-base-300 bg-base-100 px-3 py-1 text-sm font-semibold text-base-content/80", {
              "bg-primary text-primary-content": icecreamOrder.status === "active",
              "bg-warning text-warning-content": icecreamOrder.status === "processing",
              "bg-secondary text-secondary-content": icecreamOrder.status === "served",
              "bg-accent text-accent-content": icecreamOrder.status === "finished",
              "bg-neutral text-neutral-content": icecreamOrder.status === "canceled",
            })}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `This creates a card design for each ice cream order. The card shows the order ID and status with different colors - green for "active", blue for "processing", and red for "served".`,
              ko: `이것은 각 아이스크림 주문에 대한 카드 디자인을 만듭니다. 카드는 주문 ID와 상태를 다른 색상으로 보여줍니다 - "활성"은 녹색, "처리중"은 파란색, "완료"는 빨간색입니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `The clsx function changes the card's appearance based on the order status, and l() displays the status text in the user's language.`,
              ko: `clsx 함수는 주문 상태에 따라 카드의 모양을 바꾸고, l()은 사용자의 언어로 상태 텍스트를 표시합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <div className="my-6 rounded-lg border border-base-300 bg-base-100 p-4">
        <div className="text-base-content/80">
          {l.trans({
            en: `🚀 We have the form (Template) and the display card (Unit). Now let's put it all together on a webpage so customers can actually visit and use your ice cream ordering system!`,
            ko: `🚀 폼(Template)과 표시 카드(Unit)가 있습니다. 이제 고객들이 실제로 방문해서 아이스크림 주문 시스템을 사용할 수 있도록 웹페이지에 모든 것을 연결해봅시다!`,
          })}
        </div>
      </div>
      <Scroll.Slide id="expose-to-page" title={l.trans({ en: "Expose to page", ko: "페이지에 노출하기" })}>
        <Docs.Title>{l.trans({ en: "Expose to page", ko: "페이지에 노출하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Finally, let's create a page where customers can actually place their ice cream orders. This page connects everything together and makes it accessible through a web URL.`,
              ko: `마지막으로, 고객이 실제로 아이스크림 주문을 할 수 있는 페이지를 만들어봅시다. 이 페이지는 모든 것을 연결하고 웹 URL을 통해 접근 가능하게 만듭니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/page/_index.tsx"
            code={`import { Model } from "akanjs/ui";
import { cnst, fetch, IcecreamOrder, usePage } from "@apps/koyo/client";

export default async function Page() {
  const { l } = usePage();
  const { icecreamOrderInitInPublic } = await fetch.initIcecreamOrderInPublic();
  const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-5xl font-black">
        <div className="text-5xl font-bold">{l("icecreamOrder.modelName")}</div>
        <Model.New
          className="btn btn-primary"
          slice={fetch.slice.icecreamOrderInPublic}
          renderTitle="name"
          partial={icecreamOrderForm}
        >
          <IcecreamOrder.Template.General />
        </Model.New>
      </div>
      <IcecreamOrder.Zone.Card
        className="space-y-2"
        init={icecreamOrderInitInPublic}
        slice={fetch.slice.icecreamOrderInPublic}
      />
    </div>
  );
}
`}
          />
          <div>
            {l.trans({
              en: `This complete page implementation shows how all the pieces work together! Let's break down what each part does:`,
              ko: `이 완전한 페이지 구현은 모든 조각들이 어떻게 함께 작동하는지 보여줍니다! 각 부분이 무엇을 하는지 분해해 봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">🏷️</span>
                <strong className="text-primary">{`l("icecreamOrder.modelName")`}</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `This displays the page title using our dictionary! It shows "Ice cream Order" (or "아이스크림 주문" in Korean) as a big, bold heading.`,
                  ko: `이것은 우리의 dictionary를 사용해 페이지 제목을 표시합니다! "아이스크림 주문"을 크고 굵은 제목으로 보여줍니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">➕</span>
                <strong className="text-primary">Model.New Button</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `This creates a "New Order" button that opens the form (Template.General) when clicked. Customers can use this to place new ice cream orders.`,
                  ko: `클릭하면 폼(Template.General)을 여는 "새 주문" 버튼을 만듭니다. 고객들이 새로운 아이스크림 주문을 하는 데 사용할 수 있습니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-primary">📋</span>
                <strong className="text-primary">Zone.Card</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `This displays all existing ice cream orders as cards, showing the order details and status.`,
                  ko: `기존의 모든 아이스크림 주문을 카드로 표시하여 주문 세부사항과 상태를 보여줍니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `Now visit http://localhost:8282/icecreamOrder to see your ice cream ordering system!`,
              ko: `이제 http://localhost:8282/icecreamOrder를 방문하면 아이스크림 주문 시스템을 볼 수 있습니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
