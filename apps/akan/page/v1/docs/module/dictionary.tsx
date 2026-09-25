import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const coreMethods: IntroItem[] = [
    {
      name: ".of((t) => ...)",
      desc: l.trans({
        en: "Define model name & description.",
        ko: "모델 이름과 설명을 정의합니다.",
      }),
      example: `.of((t) => t(["Product", "상품"]).desc(["Description", "설명"]))`,
    },
    {
      name: ".model<T>((t) => ...)",
      desc: l.trans({
        en: "Define field translations.",
        ko: "필드 번역을 정의합니다.",
      }),
      example: `.model<Product>((t) => ({ name: t(["Name", "이름"]) }))`,
    },
  ];

  const featureMethods: IntroItem[] = [
    {
      name: ".insight<T>((t) => ...)",
      desc: l.trans({
        en: "Define insight field translations.",
        ko: "Insight 필드 번역을 정의합니다.",
      }),
      example: `.insight<ProductInsight>((t) => ({ total: t(["Total", "합계"]) }))`,
    },
    {
      name: ".query<T>((fn) => ...)",
      desc: l.trans({
        en: "Define query/filter translations.",
        ko: "쿼리/필터 번역을 정의합니다.",
      }),
      example: `.query<ProductFilter>((fn) => ({ search: fn(["Search", "검색"]) }))`,
    },
    {
      name: ".enum<T>(name, (t) => ...)",
      desc: l.trans({
        en: "Define enum value translations.",
        ko: "Enum 값 번역을 정의합니다.",
      }),
      example: `.enum<Status>("status", (t) => ({ active: t(["Active", "활성"]) }))`,
    },
    {
      name: ".slice<T>((fn) => ...)",
      desc: l.trans({
        en: "Define slice translations.",
        ko: "Slice 번역을 정의합니다.",
      }),
      example: `.slice<ProductSlice>((fn) => ({ popular: fn(["Popular", "인기"]) }))`,
    },
    {
      name: ".endpoint<T>((fn) => ...)",
      desc: l.trans({
        en: "Define endpoint translations.",
        ko: "Endpoint 번역을 정의합니다.",
      }),
      example: `.endpoint<ProductEndpoint>((fn) => ({ sell: fn(["Sell", "판매"]) }))`,
    },
  ];

  const utilityMethods: IntroItem[] = [
    {
      name: ".error({ ... })",
      desc: l.trans({
        en: "Define error messages.",
        ko: "에러 메시지를 정의합니다.",
      }),
      example: `.error({ notFound: ["Not Found", "없음"] })`,
    },
    {
      name: ".translate({ ... })",
      desc: l.trans({
        en: "Define custom UI translations.",
        ko: "커스텀 UI 번역을 정의합니다.",
      }),
      example: `.translate({ welcome: ["Welcome", "환영합니다"] })`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="dictionary-overview" title={"model.dictionary.ts"}>
        <Docs.Title>{"model.dictionary.ts"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The dictionary file provides internationalization (i18n) for your module. It defines translations for model names, field labels, enum values, API endpoints, error messages, and custom UI text.",
              ko: "dictionary 파일은 모듈의 국제화(i18n)를 제공합니다. 모델 이름, 필드 레이블, enum 값, API 엔드포인트, 에러 메시지, 커스텀 UI 텍스트에 대한 번역을 정의합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🌐</span>
                <strong className="text-blue-800">{l.trans({ en: "Frontend Usage", ko: "프론트엔드 사용" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Multi-language UI - field labels, button text, status badges, toast messages all use dictionary translations.",
                  ko: "다국어 UI - 필드 레이블, 버튼 텍스트, 상태 배지, 토스트 메시지 모두 dictionary 번역을 사용합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">⚙️</span>
                <strong className="text-green-800">{l.trans({ en: "Backend Usage", ko: "백엔드 사용" })}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "API documentation (Swagger/OpenAPI), error messages with proper translations, database schema descriptions.",
                  ko: "API 문서(Swagger/OpenAPI), 적절한 번역이 포함된 에러 메시지, 데이터베이스 스키마 설명.",
                })}
              </div>
            </div>
          </div>
          <Code.Snippet
            title="Dictionary Builder Structure"
            code={`import { modelDictionary } from "@akanjs/dictionary";
import type { Product, ProductInsight, ProductFilter } from "./product.constant";
import type { ProductEndpoint, ProductSlice } from "./product.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => ...)        // Model name & description
  .model<Product>((t) => ...)       // Model field translations
  .insight<ProductInsight>((t) => ...)  // Insight field translations
  .query<ProductFilter>((fn) => ...)    // Query/Filter translations
  .enum<ProductStatus>("productStatus", (t) => ...)  // Enum translations
  .slice<ProductSlice>((fn) => ...)     // Slice translations
  .endpoint<ProductEndpoint>((fn) => ...) // Endpoint translations
  .error({ ... })        // Error messages
  .translate({ ... });   // Custom translations`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="translation-methods" title={l.trans({ en: "Core Translations", ko: "핵심 번역" })}>
        <Docs.Title>{l.trans({ en: "Core Translations", ko: "핵심 번역" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Basic translations for the model itself and its fields.",
              ko: "모델 자체와 필드에 대한 기본 번역입니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={coreMethods} />

        <div className="mb-8" />

        <Docs.SubTitle>{l.trans({ en: "2. Feature Translations", ko: "2. 기능 번역" })}</Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Translations for various features like insights, queries, enums, slices, and endpoints.",
              ko: "Insight, 쿼리, Enum, Slice, Endpoint 등 다양한 기능에 대한 번역입니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={featureMethods} />

        <div className="mb-8" />

        <Docs.SubTitle>{l.trans({ en: "3. Utility Translations", ko: "3. 유틸리티 번역" })}</Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Translations for error messages and custom UI text.",
              ko: "에러 메시지와 커스텀 UI 텍스트에 대한 번역입니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={utilityMethods} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="usage-examples" title={l.trans({ en: "Translation Usage", ko: "번역 사용" })}>
        <Docs.Title>{l.trans({ en: "Translation Usage", ko: "번역 사용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Translations defined in the dictionary are automatically used by the framework, but can also be accessed manually.",
              ko: "Dictionary에 정의된 번역은 프레임워크에서 자동으로 사용되지만, 수동으로 접근할 수도 있습니다.",
            })}
          </div>
        </Docs.Description>

        <div className="mb-4" />
        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <div className="mb-2">
            <span className="font-bold font-mono text-primary text-sm">Manual Access</span>
          </div>
          <Code.Snippet
            language="typescript"
            code={`// Accessing model name
l("product.modelName"); // "Product" or "상품"

// Accessing field label
l("product.name"); // "Name" or "상품명"

// Accessing enum label
l("product.enum-productStatus-active"); // "Active" or "판매중"

// Accessing error message
throw new Revert("product.error.outOfStock"); // "Out of stock" or "재고 부족"

// Accessing custom translation
l("product.sellSuccess"); // "Sale completed!" or "판매가 완료되었습니다"`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="best-practices"
        title={l.trans({ en: "Dictionary Best Practices", ko: "Dictionary 모범 사례" })}
      >
        <Docs.Title>{l.trans({ en: "Dictionary Best Practices", ko: "Dictionary 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">{l.trans({ en: "Consistent Naming", ko: "일관된 명명" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Field keys must exactly match the field names in your constant.ts. TypeScript will warn you about mismatches.",
                  ko: "필드 키는 constant.ts의 필드 이름과 정확히 일치해야 합니다. TypeScript가 불일치에 대해 경고합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Descriptive Labels", ko: "설명적인 레이블" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Use clear, user-friendly labels. 'Assignee' is better than 'progressBy'. 'Due Date' is better than 'due'.",
                  ko: "명확하고 사용자 친화적인 레이블을 사용합니다. 'progressBy'보다 '담당자'가 낫습니다. 'due'보다 '기한'이 낫습니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">{l.trans({ en: "Add Descriptions", ko: "설명 추가" })}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Always add .desc() for fields that might need tooltips or additional context. It helps new developers and users.",
                  ko: "툴팁이나 추가 컨텍스트가 필요할 수 있는 필드에는 항상 .desc()를 추가합니다. 새로운 개발자와 사용자에게 도움이 됩니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">4️⃣</span>
                <strong className="text-yellow-800">
                  {l.trans({ en: "Toast Message Convention", ko: "토스트 메시지 규칙" })}
                </strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Use pattern: [action]Loading, [action]Success, [action]Error. Example: sellLoading, sellSuccess.",
                  ko: "[action]Loading, [action]Success, [action]Error 패턴을 사용합니다. 예: sellLoading, sellSuccess.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
