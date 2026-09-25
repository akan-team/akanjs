import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="show-details" title={l.trans({ en: "Show Details", ko: "상세하게 보여주기" })}>
        <Docs.Title>{l.trans({ en: "Show Details", ko: "상세하게 보여주기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Imagine walking into an ice cream shop and placing an order. You'd want to see exactly what you ordered, right? Maybe check if you remembered to add those strawberries, or confirm the size you picked. That's exactly what detailed views do in our application - they give customers a complete, beautiful summary of their order that they can access anytime with just a click.`,
              ko: `아이스크림 가게에 들어가서 주문을 한다고 상상해보세요. 어떤 것을 주문했는지 정확히 보고 싶을 테니까요? 딸기를 추가했는지 확인하거나, 선택한 크기가 맞는지 확인하고 싶을 것입니다. 바로 이것이 우리 애플리케이션의 상세 뷰가 하는 일입니다 - 고객들에게 단지 한 번의 클릭으로 언제든 접근할 수 있는 주문의 완전하고 아름다운 요약을 제공합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Think of it like the difference between an order ticket and a detailed receipt. The summary card is like a stub - it shows the basics so you can identify the order. But the detailed view is like the full receipt that shows everything: every topping you chose, when you placed the order, and whether it's ready to pick up. It's the complete story of your ice cream order!`,
              ko: `주문번호표와 상세 영수증의 차이처럼 생각해보세요. 요약 카드는 스텁과 같습니다 - 주문을 식별할 수 있도록 기본적인 정보를 보여줍니다. 하지만 상세 뷰는 모든 것을 보여주는 전체 영수증과 같습니다: 선택한 모든 토핑, 주문한 시간, 그리고 받을 준비가 되었는지까지. 아이스크림 주문의 완전한 이야기인 것이죠!`,
            })}
          </div>
          <div>
            {l.trans({
              en: `In Akan.js, showing detailed views follows a clean architecture pattern. We use three main components that work together:`,
              ko: `Akan.js에서 상세 뷰를 보여주는 것은 깔끔한 아키텍처 패턴을 따릅니다. 함께 작동하는 세 가지 주요 컴포넌트를 사용합니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🎯</span>
                <strong className="text-blue-800">ViewWrapper (Util.tsx)</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `A clickable wrapper that triggers the view modal when clicked. Think of it as the "View Details" button functionality.`,
                  ko: `클릭하면 뷰 모달을 트리거하는 클릭 가능한 래퍼입니다. "상세보기" 버튼 기능이라고 생각하면 됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🖼️</span>
                <strong className="text-green-800">ViewModal (Model component)</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `A modal popup that displays when customers want to see details. It handles opening, closing, and data loading automatically.`,
                  ko: `고객이 세부사항을 보고 싶을 때 표시되는 모달 팝업입니다. 열기, 닫기, 데이터 로딩을 자동으로 처리합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">📋</span>
                <strong className="text-purple-800">Detail View (View.tsx)</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `The actual content inside the modal that displays all the order information in a beautiful, organized layout.`,
                  ko: `모달 안의 실제 내용으로, 모든 주문 정보를 아름답고 체계적인 레이아웃으로 표시합니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `This separation allows each component to have a single responsibility: the wrapper handles clicking, the modal handles the popup behavior, and the view handles the display formatting.`,
              ko: `이러한 분리는 각 컴포넌트가 단일 책임을 갖도록 합니다: 래퍼는 클릭을 처리하고, 모달은 팝업 동작을 처리하며, 뷰는 표시 형식을 처리합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="view-wrapper" title={l.trans({ en: "Add View/Edit Modal", ko: "보기/수정 모달 추가하기" })}>
        <Docs.Title>{l.trans({ en: "Add View/Edit Modal", ko: "보기/수정 모달 추가하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's add a View/Edit modal to our ice cream order page. This creates a popup window where customers can see all their order details in an organized format. The modal functions like a detailed receipt that appears when customers want to review their order information.`,
              ko: `이제 아이스크림 주문 페이지에 보기/수정 모달을 추가해봅시다. 이것은 고객들이 모든 주문 세부사항을 체계적인 형식으로 볼 수 있는 팝업 창을 생성합니다. 모달은 고객이 주문 정보를 검토하고 싶을 때 나타나는 상세 영수증처럼 기능합니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
            code={`
"use client"; // [!code collapse:3]
import { ClientInit, ClientView } from "@akanjs/signal";
import { cnst, IcecreamOrder } from "@koyo/client";
import { DefaultOf } from "@akanjs/constant";
import { Load, Model } from "@akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"icecreamOrder", cnst.LightIcecreamOrder>;
  sliceName?: string;
}
export const Card = ({ className, init, sliceName }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderItem={(icecreamOrder: cnst.LightIcecreamOrder) => (
          <IcecreamOrder.Unit.Card key={icecreamOrder.id} icecreamOrder={icecreamOrder} />
        )}
      />
      <Model.ViewEditModal
        sliceName={sliceName ?? "icecreamOrder"}
        renderTitle={(icecreamOrder: DefaultOf<cnst.IcecreamOrder>) =>
          \`IcecreamOrder - \${icecreamOrder.id ? icecreamOrder.id : "New"}\`
        }
        renderView={(icecreamOrder: cnst.IcecreamOrder) => (
          <IcecreamOrder.View.General className="w-full" icecreamOrder={icecreamOrder} />
        )}
        renderTemplate={() => <IcecreamOrder.Template.General />}
      />
    </>
  );
};

interface ViewProps { // [!code collapse:12]
  className?: string;
  view: ClientView<"icecreamOrder", cnst.IcecreamOrder>;
}
export const View = ({ view }: ViewProps) => {
  return (
    <Load.View
      view={view}
      renderView={(icecreamOrder) => <IcecreamOrder.View.General icecreamOrder={icecreamOrder} />}
    />
  );
};
`}
          />
          <div>
            {l.trans({
              en: `This code creates a modal system that handles the display and editing of orders. Let's examine what each part does:`,
              ko: `이 코드는 주문의 표시와 편집을 처리하는 모달 시스템을 생성합니다. 각 부분이 무엇을 하는지 살펴봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">👆</span>
              <div>
                <strong>{l.trans({ en: "Load.Units Component", ko: "Load.Units 컴포넌트" })}</strong>:{" "}
                {l.trans({
                  en: "Renders all order cards in a list format, with each card displaying basic order information",
                  ko: "모든 주문 카드를 목록 형식으로 렌더링하며, 각 카드는 기본 주문 정보를 표시합니다",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">📱</span>
              <div>
                <strong>{l.trans({ en: "Model.ViewEditModal", ko: "Model.ViewEditModal" })}</strong>:{" "}
                {l.trans({
                  en: "Creates the modal popup that appears when customers click to view details. It automatically loads order data and displays it in a structured format",
                  ko: "고객이 세부사항을 보기 위해 클릭할 때 나타나는 모달 팝업을 생성합니다. 주문 데이터를 자동으로 로드하고 구조화된 형식으로 표시합니다",
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `The ViewEditModal component handles opening, closing, data loading, and content display automatically. You specify what content to show, and it manages the technical implementation. This approach allows you to add detailed views throughout your application with minimal code.`,
              ko: `ViewEditModal 컴포넌트는 열기, 닫기, 데이터 로딩, 콘텐츠 표시를 자동으로 처리합니다. 표시할 콘텐츠를 지정하면 기술적 구현을 관리해줍니다. 이러한 접근 방식을 통해 최소한의 코드로 애플리케이션 전체에 상세 뷰를 추가할 수 있습니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide
        id="button-on-unit"
        title={l.trans({ en: "Add View Button to Cards", ko: "카드에 뷰 버튼 추가하기" })}
      >
        <Docs.Title>{l.trans({ en: "Add View Button to Cards", ko: "카드에 뷰 버튼 추가하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's add a "View" button to each order card. This button provides a clear interface element that customers can click to access detailed order information. The button will be positioned and styled to integrate with the existing card design.`,
              ko: `이제 각 주문 카드에 "보기" 버튼을 추가해봅시다. 이 버튼은 고객이 상세한 주문 정보에 접근하기 위해 클릭할 수 있는 명확한 인터페이스 요소를 제공합니다. 버튼은 기존 카드 디자인과 통합되도록 배치되고 스타일링됩니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
            code={`
import { clsx, ModelProps } from "@akanjs/client"; // [!code collapse:2]
import { cnst, usePage } from "@koyo/client";
import { Model } from "@akanjs/ui"; // [!code ++]

export const Card = ({ icecreamOrder }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl bg-linear-to-br from-pink-100 via-yellow-50 to-pink-200 px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-lg font-semibold text-pink-700">
          <span className="inline-block rounded bg-pink-200 px-2 py-1 text-xs font-bold tracking-wider uppercase">
            {l("icecreamOrder.id")}
          </span>
          <span className="ml-2 font-mono text-pink-900">#{icecreamOrder.id.slice(-4)}</span> // [!code ++]
        </div>
        <div className="mt-4 flex items-center gap-2"> // [!code collapse:16]
          <span className="inline-block rounded bg-yellow-200 px-2 py-1 text-xs font-bold tracking-wider text-yellow-800 uppercase">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={clsx("ml-2 rounded-full px-3 py-1 text-sm font-semibold", {
              "bg-green-100 text-green-700": icecreamOrder.status === "active",
              "bg-blue-100 text-blue-700": icecreamOrder.status === "processing",
              "bg-red-100 text-red-700": icecreamOrder.status === "served",
              "bg-purple-100 text-purple-700": icecreamOrder.status === "finished",
              "bg-gray-100 text-gray-700": icecreamOrder.status === "canceled",
            })}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
      </div>
      <div className="bg-base-100/50 flex items-center justify-center gap-2 rounded-xl p-4"> // [!code ++:7]
        <Model.ViewWrapper sliceName="icecreamOrder" modelId={icecreamOrder.id}>
          <button className="btn btn-primary">
            <span>{l.trans({ en: "View", ko: "보기" })}</span>
          </button>
        </Model.ViewWrapper>
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `The key addition here is the ViewWrapper around the button:`,
              ko: `여기서 핵심 추가사항은 버튼 주변의 ViewWrapper입니다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">🎯</span>
              <div>
                <strong>Model.ViewWrapper</strong>:{" "}
                {l.trans({
                  en: "This wraps our button and handles the click functionality to show the detailed view",
                  ko: "이것은 버튼을 감싸고 상세 뷰를 보여주는 클릭 기능을 처리합니다",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">🆔</span>
              <div>
                <strong>sliceName and modelId props</strong>:{" "}
                {l.trans({
                  en: "We pass the sliceName and modelId so the modal knows which order to display details for",
                  ko: "sliceName과 modelId를 전달하여 모달이 어떤 주문의 세부사항을 표시할지 알 수 있도록 합니다",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">🎨</span>
              <div>
                <strong>Button styling</strong>:{" "}
                {l.trans({
                  en: "The button uses btn-primary and btn-xl classes for consistent styling across the app",
                  ko: "버튼은 앱 전체에서 일관된 스타일링을 위해 btn-primary와 btn-xl 클래스를 사용합니다",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="design-detail-view" title={l.trans({ en: "Design Detail View", ko: "상세 뷰 디자인하기" })}>
        <Docs.Title>{l.trans({ en: "Design Detail View", ko: "상세 뷰 디자인하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's create the detailed view component in View.tsx that displays all the ice cream order information in a structured layout. This component will organize and present the order data in a readable format when the modal opens.`,
              ko: `이제 View.tsx에서 모든 아이스크림 주문 정보를 구조화된 레이아웃으로 표시하는 상세 뷰 컴포넌트를 만들어봅시다. 이 컴포넌트는 모달이 열릴 때 주문 데이터를 읽기 쉬운 형식으로 구성하고 표시합니다.`,
            })}
          </div>
          <Code.Snippet
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.View.tsx"
            code={`
import { clsx } from "@akanjs/client"; // [!code collapse:8]
import { cnst, usePage } from "@koyo/client";

interface GeneralProps {
  className?: string;
  icecreamOrder: cnst.IcecreamOrder;
}

export const General = ({ className, icecreamOrder }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={clsx(className, "mx-auto w-full space-y-6 rounded-xl p-8 shadow-lg")}>
      <div className="flex items-center gap-3 border-b pb-4">
        <span className="text-3xl font-extrabold text-pink-600">🍦</span>
        <span className="text-2xl font-bold">{l("icecreamOrder.modelName")}</span>
        <span className="ml-auto text-xs text-base-content/50">#{icecreamOrder.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="font-semibold text-base-content/50">{l("icecreamOrder.size")}</div>
        <div>{icecreamOrder.size} cc</div>
        <div className="font-semibold text-base-content/50">{l("icecreamOrder.toppings")}</div>
        <div className="flex flex-wrap gap-2">
          {icecreamOrder.toppings.length === 0 ? (
            <span className="italic text-gray-400">
              {l.trans({ en: "No toppings", ko: "토핑 없음" })}
            </span>
          ) : (
            icecreamOrder.toppings.map((topping) => (
              <span
                key={topping}
                className="inline-block rounded-full bg-pink-100 px-2 py-1 text-xs font-medium text-pink-700"
              >
                {l(\`topping.\${topping}\`)}
              </span>
            ))
          )}
        </div>
        <div className="font-semibold text-base-content/50">{l("icecreamOrder.status")}</div>
        <div>
          <span
            className={clsx("inline-block rounded-full px-2 py-1 text-xs font-semibold", {
              "bg-green-100 text-green-700": icecreamOrder.status === "active",
              "bg-yellow-100 text-yellow-700": icecreamOrder.status === "processing",
              "bg-red-100 text-red-700": icecreamOrder.status === "served",
              "bg-purple-100 text-purple-700": icecreamOrder.status === "finished",
              "bg-gray-100 text-gray-700": icecreamOrder.status === "canceled",
            })}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
        <div className="font-semibold text-base-content/50">{l("icecreamOrder.createdAt")}</div>
        <div className="text-gray-500">{icecreamOrder.createdAt.format("YYYY-MM-DD HH:mm:ss")}</div>
        <div className="font-semibold text-base-content/50">{l("icecreamOrder.updatedAt")}</div>
        <div className="text-gray-500">{icecreamOrder.updatedAt.format("YYYY-MM-DD HH:mm:ss")}</div>
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `This detailed view component creates a comprehensive display of the ice cream order:`,
              ko: `이 상세 뷰 컴포넌트는 아이스크림 주문의 포괄적인 표시를 생성합니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-pink-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-pink-600">🎨</span>
                <strong className="text-pink-800">{l.trans({ en: "Header Section", ko: "헤더 섹션" })}</strong>
              </div>
              <div className="text-pink-700 text-sm">
                {l.trans({
                  en: `Shows an ice cream emoji, the order title from dictionary, and the order ID number for reference`,
                  ko: `아이스크림 이모지, dictionary의 주문 제목, 참조용 주문 ID 번호를 보여줍니다`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">📊</span>
                <strong className="text-blue-800">{l.trans({ en: "Grid Layout", ko: "그리드 레이아웃" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Uses a 2-column grid to organize field labels and values in a clean, scannable format`,
                  ko: `2열 그리드를 사용하여 필드 레이블과 값을 깔끔하고 읽기 쉬운 형식으로 구성합니다`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🏷️</span>
                <strong className="text-green-800">{l.trans({ en: "Visual Elements", ko: "시각적 요소" })}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `Toppings display as colored badges, status shows with conditional styling, and timestamps are formatted for readability`,
                  ko: `토핑은 색상 배지로 표시되고, 상태는 조건부 스타일링으로 표시되며, 타임스탬프는 가독성을 위해 형식화됩니다`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="test-implementation" title={l.trans({ en: "Test Your Implementation", ko: "구현 테스트하기" })}>
        <Docs.Title>{l.trans({ en: "Test Your Implementation", ko: "구현 테스트하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Let's test the detailed view implementation. Navigate to your ice cream order page and click the "View" button on any order card to verify that the system works correctly.`,
              ko: `상세 뷰 구현을 테스트해봅시다. 아이스크림 주문 페이지로 이동해서 주문 카드의 "보기" 버튼을 클릭하여 시스템이 올바르게 작동하는지 확인하세요.`,
            })}
          </div>
          <div className="my-4 rounded-lg bg-blue-50 p-4">
            <div className="mb-2 font-semibold text-blue-800">
              {l.trans({ en: "Testing Steps:", ko: "테스트 단계:" })}
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-blue-700 text-sm">
              <li>
                {l.trans({
                  en: "Navigate to http://localhost:4201/icecreamOrder",
                  ko: "http://localhost:4201/icecreamOrder로 이동",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Create a new ice cream order if you don't have any",
                  ko: "주문이 없다면 새 아이스크림 주문을 생성",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Click the 'View' button on any order card",
                  ko: "주문 카드의 '보기' 버튼 클릭",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Verify the modal opens with detailed order information",
                  ko: "상세 주문 정보가 포함된 모달이 열리는지 확인",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Check that all fields display correctly with proper translations",
                  ko: "모든 필드가 적절한 번역과 함께 올바르게 표시되는지 확인",
                })}
              </li>
            </ol>
          </div>
          <div>
            {l.trans({
              en: `A modal popup should appear displaying all order details: size, toppings (as colored badges), status (with conditional colors), and timestamps. The modal closes when you click outside it or press the X button.`,
              ko: `모든 주문 세부사항을 표시하는 모달 팝업이 나타나야 합니다: 사이즈, 토핑(색상 배지로), 상태(조건부 색상으로), 타임스탬프. 모달 밖을 클릭하거나 X 버튼을 누르면 모달이 닫힙니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide
        id="best-practices"
        title={l.trans({ en: "Best Practices for Detail Views", ko: "상세 뷰 모범 사례" })}
      >
        <Docs.Title>{l.trans({ en: "Best Practices for Detail Views", ko: "상세 뷰 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Here are some important best practices to follow when creating detail views in Akan.js:`,
              ko: `Akan.js에서 상세 뷰를 만들 때 따라야 할 중요한 모범 사례들입니다:`,
            })}
          </div>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✅</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Use Dictionary Translations", ko: "Dictionary 번역 사용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `Always use l() for displaying field names and values. This ensures consistency and proper multilingual support.`,
                  ko: `필드 이름과 값을 표시할 때는 항상 l()을 사용하세요. 이렇게 하면 일관성과 적절한 다국어 지원이 보장됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🎨</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Consistent Visual Hierarchy", ko: "일관된 시각적 계층구조" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Use grid layouts, consistent spacing, and clear visual separation between different pieces of information.`,
                  ko: `그리드 레이아웃, 일관된 간격, 다른 정보 간의 명확한 시각적 분리를 사용하세요.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">🔧</span>
                <strong className="text-purple-800">
                  {l.trans({ en: "Reusable Components", ko: "재사용 가능한 컴포넌트" })}
                </strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `Separate the ViewWrapper logic from the actual view content. This allows the wrapper to be reused across different display contexts.`,
                  ko: `ViewWrapper 로직을 실제 뷰 내용과 분리하세요. 이렇게 하면 래퍼를 다른 표시 맥락에서 재사용할 수 있습니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">⚡</span>
                <strong className="text-yellow-800">
                  {l.trans({ en: "Handle Empty States", ko: "빈 상태 처리" })}
                </strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: `Always provide fallback displays for empty or null values, like showing "No toppings" when the toppings array is empty.`,
                  ko: `토핑 배열이 비어있을 때 "토핑 없음"을 표시하는 것처럼 빈 값이나 null 값에 대한 대체 표시를 항상 제공하세요.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="next-steps" title={l.trans({ en: "What's Next?", ko: "다음은 무엇인가요?" })}>
        <Docs.Title>{l.trans({ en: "What's Next?", ko: "다음은 무엇인가요?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `You have successfully implemented detailed views for your ice cream orders. Customers can now click on any order to see all the specifics in an organized format. The modal system provides a clean interface for viewing order information.`,
              ko: `아이스크림 주문에 대한 상세 뷰를 성공적으로 구현했습니다. 이제 고객들이 주문을 클릭해서 체계적인 형식으로 모든 세부사항을 볼 수 있습니다. 모달 시스템은 주문 정보를 보기 위한 깔끔한 인터페이스를 제공합니다.`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-pink-100 to-yellow-100 p-6">
            <div className="mb-3 font-bold text-lg text-pink-800">
              {l.trans({ en: "🎉 What You've Accomplished:", ko: "🎉 달성한 것들:" })}
            </div>
            <ul className="space-y-2 text-pink-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Created reusable ViewWrapper components",
                  ko: "재사용 가능한 ViewWrapper 컴포넌트 생성",
                })}
              </li>
              <li>✓ {l.trans({ en: "Added view buttons to order cards", ko: "주문 카드에 뷰 버튼 추가" })}</li>
              <li>✓ {l.trans({ en: "Designed comprehensive detail views", ko: "포괄적인 상세 뷰 디자인" })}</li>
              <li>✓ {l.trans({ en: "Implemented modal popup functionality", ko: "모달 팝업 기능 구현" })}</li>
              <li>✓ {l.trans({ en: "Used proper translations and styling", ko: "적절한 번역과 스타일링 사용" })}</li>
            </ul>
          </div>
          <div>
            {l.trans({
              en: `In the next tutorial, we'll add status management functionality that allows shop staff to update orders from "active" to "processing" to "served". This will complete the order workflow system and provide full lifecycle management for ice cream orders.`,
              ko: `다음 튜토리얼에서는 가게 직원이 주문을 "활성"에서 "처리중"으로, "완료"로 업데이트할 수 있는 상태 관리 기능을 추가할 것입니다. 이것으로 주문 워크플로우 시스템이 완성되고 아이스크림 주문에 대한 전체 생명주기 관리가 제공될 것입니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
