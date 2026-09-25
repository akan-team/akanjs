import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const fileStructureItems: IntroItem[] = [
    {
      name: "*.constant.ts",
      desc: l.trans({
        en: "Defines the scalar schema using via() function and enums using enumOf(). This is where you declare fields, types, defaults, and validation rules.",
        ko: "via() 함수를 사용하여 스칼라 스키마를 정의하고 enumOf()를 사용하여 enum을 정의합니다. 여기서 필드, 타입, 기본값 및 유효성 검사 규칙을 선언합니다.",
      }),
      example: null,
    },
    {
      name: "*.dictionary.ts",
      desc: l.trans({
        en: "Provides internationalization using scalarDictionary() builder pattern. Defines translations for model name, field labels, descriptions, and enum values.",
        ko: "scalarDictionary() 빌더 패턴을 사용하여 국제화를 제공합니다. 모델 이름, 필드 레이블, 설명 및 enum 값에 대한 번역을 정의합니다.",
      }),
      example: null,
    },
    {
      name: "*.document.ts",
      desc: l.trans({
        en: "Optional file that extends functionality using by() function. Add custom methods for data transformations and computed values.",
        ko: "by() 함수를 사용하여 기능을 확장하는 선택적 파일입니다. 데이터 변환 및 계산된 값을 위한 커스텀 메서드를 추가합니다.",
      }),
      example: null,
    },
  ];

  const definingScalarItems: IntroItem[] = [
    {
      name: "enumOf(name, values)",
      desc: l.trans({
        en: 'Creates a typed enum class. The first argument is the enum name (used in dictionary), the second is an array of values with "as const" for type safety.',
        ko: '타입이 지정된 enum 클래스를 생성합니다. 첫 번째 인수는 enum 이름(dictionary에서 사용), 두 번째는 타입 안전을 위해 "as const"가 포함된 값 배열입니다.',
      }),
      example: null,
    },
    {
      name: "via((field) => ({...}))",
      desc: l.trans({
        en: "Creates a scalar class with typed fields. The field() function accepts a type and optional configuration for defaults, validation, and more.",
        ko: "타입이 지정된 필드를 가진 스칼라 클래스를 생성합니다. field() 함수는 타입과 기본값, 유효성 검사 등을 위한 선택적 구성을 받습니다.",
      }),
      example: null,
    },
    {
      name: "Field Options",
      desc: l.trans({
        en: "Options include: default (static or function), min/max (for numbers), minlength/maxlength (for strings), validate (custom validator function).",
        ko: "옵션에는: default (정적 또는 함수), min/max (숫자용), minlength/maxlength (문자열용), validate (커스텀 검증 함수)가 포함됩니다.",
      }),
      example: null,
    },
  ];

  const dictionaryItems: IntroItem[] = [
    {
      name: "scalarDictionary([languages])",
      desc: l.trans({
        en: "Initialize with supported languages array. The order determines which index corresponds to which language in translation arrays.",
        ko: "지원되는 언어 배열로 초기화합니다. 순서는 번역 배열에서 어떤 인덱스가 어떤 언어에 해당하는지를 결정합니다.",
      }),
      example: null,
    },
    {
      name: ".of((t) => ...)",
      desc: l.trans({
        en: "Define the scalar's own name and description. Use t([en, ko]) for the label and .desc([en, ko]) for the description.",
        ko: "스칼라 자체의 이름과 설명을 정의합니다. 레이블에는 t([en, ko])를, 설명에는 .desc([en, ko])를 사용합니다.",
      }),
      example: null,
    },
    {
      name: ".model<Type>((t) => ({...}))",
      desc: l.trans({
        en: "Define translations for each field. The generic type ensures all fields are covered. Each field has a label and description.",
        ko: "각 필드에 대한 번역을 정의합니다. 제네릭 타입은 모든 필드가 커버되도록 보장합니다. 각 필드는 레이블과 설명을 가집니다.",
      }),
      example: null,
    },
    {
      name: ".enum<Type>(name, (t) => ({...}))",
      desc: l.trans({
        en: "Define translations for enum values. The first argument is the enum name (matching enumOf()), the second defines translations for each value.",
        ko: "enum 값에 대한 번역을 정의합니다. 첫 번째 인수는 enum 이름(enumOf()와 일치), 두 번째는 각 값에 대한 번역을 정의합니다.",
      }),
      example: null,
    },
  ];

  const documentItems: IntroItem[] = [
    {
      name: "by(cnst.ClassName)",
      desc: l.trans({
        en: "Wraps the constant class and enables adding methods. Import the constant as cnst to avoid naming conflicts.",
        ko: "상수 클래스를 감싸고 메서드 추가를 활성화합니다. 이름 충돌을 피하기 위해 상수를 cnst로 임포트합니다.",
      }),
      example: null,
    },
    {
      name: "Custom Methods",
      desc: l.trans({
        en: "Add computed properties, validation helpers, and transformation methods directly in the class body.",
        ko: "계산된 속성, 유효성 검사 헬퍼, 변환 메서드를 클래스 본문에 직접 추가합니다.",
      }),
      example: null,
    },
    {
      name: "Access Fields",
      desc: l.trans({
        en: "Use 'this' to access all fields defined in the constant file. TypeScript provides full autocompletion.",
        ko: "'this'를 사용하여 상수 파일에 정의된 모든 필드에 접근합니다. TypeScript가 완전한 자동 완성을 제공합니다.",
      }),
      example: null,
    },
  ];

  const namingItems: IntroItem[] = [
    {
      name: "Scalar Directory",
      desc: "camelCase (e.g., encourageInfo)",
      example: null,
    },
    {
      name: "Constant File",
      desc: "[name].constant.ts (e.g., encourageInfo.constant.ts)",
      example: null,
    },
    {
      name: "Dictionary File",
      desc: "[name].dictionary.ts (e.g., encourageInfo.dictionary.ts)",
      example: null,
    },
    {
      name: "Document File",
      desc: "[name].document.ts (e.g., encourageInfo.document.ts)",
      example: null,
    },
    {
      name: "Scalar Class",
      desc: "PascalCase (e.g., EncourageInfo)",
      example: null,
    },
    {
      name: "Enum Class",
      desc: "PascalCase (e.g., Journey, LinkType)",
      example: null,
    },
    {
      name: "Enum Values",
      desc: "camelCase (e.g., firstJoin, waitPay)",
      example: null,
    },
  ];

  const bestPracticeItems: IntroItem[] = [
    {
      name: "Design for Reusability",
      desc: l.trans({
        en: "Create scalars that can be used across multiple modules. Think about common data patterns like addresses, contact info, or status tracking.",
        ko: "여러 모듈에서 사용할 수 있는 스칼라를 만드세요. 주소, 연락처 정보, 상태 추적과 같은 공통 데이터 패턴을 생각해보세요.",
      }),
      example: null,
    },
    {
      name: "Keep Scalars Focused",
      desc: l.trans({
        en: "Each scalar should represent a single concept. If a scalar grows too large, consider splitting it into smaller, composable pieces.",
        ko: "각 스칼라는 단일 개념을 나타내야 합니다. 스칼라가 너무 커지면 더 작고 조합 가능한 조각으로 분리하는 것을 고려하세요.",
      }),
      example: null,
    },
    {
      name: "Use Proper Defaults",
      desc: l.trans({
        en: "Provide sensible defaults for optional fields. Use function defaults (e.g., () => dayjs()) for dynamic values that should be computed at creation time.",
        ko: "선택적 필드에 합리적인 기본값을 제공하세요. 생성 시 계산되어야 하는 동적 값에는 함수 기본값 (예: () => dayjs())을 사용하세요.",
      }),
      example: null,
    },
    {
      name: "Complete Dictionary Coverage",
      desc: l.trans({
        en: "Always provide translations for all fields and enum values. Use the type system to ensure nothing is missed.",
        ko: "항상 모든 필드와 enum 값에 대한 번역을 제공하세요. 타입 시스템을 사용하여 누락되는 것이 없도록 하세요.",
      }),
      example: null,
    },
    {
      name: "Validate at Field Level",
      desc: l.trans({
        en: "Use field options like min/max, minlength/maxlength, and custom validate functions to ensure data integrity at the schema level.",
        ko: "min/max, minlength/maxlength 및 커스텀 validate 함수와 같은 필드 옵션을 사용하여 스키마 수준에서 데이터 무결성을 보장하세요.",
      }),
      example: null,
    },
  ];

  const integrationItems: IntroItem[] = [
    {
      name: "Domain Models",
      desc: l.trans({
        en: "Embed scalars in models using field([ScalarClass])",
        ko: "field([ScalarClass])를 사용하여 모델에 스칼라 임베드",
      }),
      example: null,
    },
    {
      name: "GraphQL",
      desc: l.trans({
        en: "Auto-generated types and enums for API contracts",
        ko: "API 계약을 위한 자동 생성된 타입 및 enum",
      }),
      example: null,
    },
    {
      name: "Validation",
      desc: l.trans({
        en: "Runtime type checking through field options",
        ko: "필드 옵션을 통한 런타임 타입 검사",
      }),
      example: null,
    },
    {
      name: "Internationalization",
      desc: l.trans({
        en: "Consistent terminology via scalarDictionary()",
        ko: "scalarDictionary()를 통한 일관된 용어",
      }),
      example: null,
    },
    {
      name: "UI Components",
      desc: l.trans({
        en: "Enum values can be directly used in select fields",
        ko: "Enum 값을 선택 필드에서 직접 사용 가능",
      }),
      example: null,
    },
    {
      name: "Dictionary Sharing",
      desc: l.trans({
        en: "Reuse enum translations across dictionaries",
        ko: "dictionary 간 enum 번역 재사용",
      }),
      example: null,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="introduction" title={l.trans({ en: "Scalar Modules Overview", ko: "스칼라 모듈 개요" })}>
        <Docs.Title>{l.trans({ en: "Scalar Modules Overview", ko: "스칼라 모듈 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Scalar modules provide reusable value objects for embedded documents, shared DTOs, and internationalized data structures across your application. Think of Scalars as reusable Lego pieces - small, focused data structures that can be combined into larger models.`,
              ko: `스칼라 모듈은 애플리케이션 전반에 걸쳐 임베디드 문서, 공유 DTO 및 국제화된 데이터 구조를 위한 재사용 가능한 값 객체를 제공합니다. 스칼라를 재사용 가능한 레고 조각으로 생각해보세요 - 더 큰 모델로 조합할 수 있는 작고 집중된 데이터 구조입니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Unlike full Models that have their own database collections, Scalars are embedded within other models. They are perfect for:`,
              ko: `자체 데이터베이스 컬렉션을 가진 전체 Model과 달리, Scalar는 다른 모델 안에 내장됩니다. 다음과 같은 용도에 완벽합니다:`,
            })}
          </div>
          <ul className="ml-6 list-disc space-y-2 py-3">
            <li>
              {l.trans({
                en: "Embedded documents in domain models (e.g., address, contact info)",
                ko: "도메인 모델의 임베디드 문서 (예: 주소, 연락처 정보)",
              })}
            </li>
            <li>
              {l.trans({
                en: "Shared DTOs and configuration objects across modules",
                ko: "모듈 간 공유 DTO 및 구성 객체",
              })}
            </li>
            <li>
              {l.trans({
                en: "Type-safe schemas with runtime validation",
                ko: "런타임 유효성 검사가 있는 타입 안전 스키마",
              })}
            </li>
            <li>
              {l.trans({
                en: "Internationalized data structures with full i18n support",
                ko: "완전한 i18n 지원이 있는 국제화된 데이터 구조",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="core-principles" title={l.trans({ en: "Core Principles", ko: "핵심 원칙" })}>
        <Docs.Title>{l.trans({ en: "Core Principles", ko: "핵심 원칙" })}</Docs.Title>
        <Docs.Description>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🔄</span>
                <strong className="text-blue-800">Reusability</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Designed for cross-module consumption. Define once, use everywhere.",
                  ko: "모듈 간 사용을 위해 설계됨. 한 번 정의하고 어디서든 사용.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">📦</span>
                <strong className="text-green-800">Stateless</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Pure data containers without business logic. Focus on structure, not behavior.",
                  ko: "비즈니스 로직 없는 순수 데이터 컨테이너. 동작이 아닌 구조에 집중.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">🛡️</span>
                <strong className="text-purple-800">Type-Safe</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Full TypeScript integration with runtime validation through field options.",
                  ko: "필드 옵션을 통한 런타임 유효성 검사와 완전한 TypeScript 통합.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">🧩</span>
                <strong className="text-yellow-800">Composable</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Embeddable within larger domain models. Scalars can contain other scalars.",
                  ko: "더 큰 도메인 모델 내에 임베딩 가능. 스칼라는 다른 스칼라를 포함할 수 있음.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-structure" title={l.trans({ en: "File Structure", ko: "파일 구조" })}>
        <Docs.Title>{l.trans({ en: "File Structure", ko: "파일 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Scalar modules are stored in the special __scalar directory within your library. Each scalar has its own directory with three key files:`,
              ko: `스칼라 모듈은 라이브러리 내의 특수한 __scalar 디렉토리에 저장됩니다. 각 스칼라는 세 개의 핵심 파일이 있는 자체 디렉토리를 가집니다:`,
            })}
          </div>
          <Code.Snippet
            language="bash"
            code={`{domain}/lib/
└── __scalar/                    # Special scalar directory
    └── [scalarName]/            # camelCase scalar name
        ├── [name].constant.ts   # Schema definition with via() & enumOf()
        ├── [name].dictionary.ts # I18n translations with scalarDictionary()
        └── [name].document.ts   # Method extensions with by()`}
          />
          <div className="my-4" />
          <Docs.IntroTable type="field" items={fileStructureItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="defining-scalars" title={l.trans({ en: "Defining Scalars", ko: "스칼라 정의하기" })}>
        <Docs.Title>{l.trans({ en: "Defining Scalars", ko: "스칼라 정의하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Akan.js uses a functional approach to define scalars. The via() function creates type-safe schema definitions, while enumOf() creates typed enum classes. Here's a real example from the framework:`,
              ko: `Akan.js는 스칼라를 정의하는 데 함수형 접근 방식을 사용합니다. via() 함수는 타입 안전 스키마 정의를 생성하고, enumOf()는 타입이 지정된 enum 클래스를 생성합니다. 프레임워크의 실제 예시입니다:`,
            })}
          </div>
          <Code.Snippet
            title="price.constant.ts"
            code={`import { Float, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Define enum
export class Currency extends enumOf("currency", ["usd", "krw", "eur"] as const) {}

// Define scalar
export class Price extends via((field) => ({
  amount: field(Float, { min: 0, default: 0 }),
  currency: field(Currency, { default: "usd" }),
})) {}`}
          />
          <div>
            {l.trans({
              en: `Let's understand the key patterns:`,
              ko: `핵심 패턴을 이해해봅시다:`,
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={definingScalarItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="internationalization" title={l.trans({ en: "scalarDictionary()", ko: "scalarDictionary()" })}>
        <Docs.Title>{l.trans({ en: "scalarDictionary()", ko: "scalarDictionary()" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The scalarDictionary() function provides a fluent builder pattern for defining translations. It ensures type safety and complete coverage of all fields and enum values.`,
              ko: `scalarDictionary() 함수는 번역을 정의하기 위한 플루언트 빌더 패턴을 제공합니다. 타입 안전성과 모든 필드 및 enum 값의 완전한 커버리지를 보장합니다.`,
            })}
          </div>
          <Code.Snippet
            title="price.dictionary.ts"
            code={`import { scalarDictionary } from "@akanjs/dictionary";
import type { Currency, Price } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price info", "가격 정보"]))
  .model<Price>((t) => ({
    amount: t(["Amount", "금액"]).desc(["Price amount", "가격 금액"]),
    currency: t(["Currency", "통화"]).desc(["Currency type", "통화 유형"]),
  }))
  .enum<Currency>("currency", (t) => ({
    usd: t(["USD", "달러"]).desc(["US Dollar", "미국 달러"]),
    krw: t(["KRW", "원"]).desc(["Korean Won", "한국 원"]),
    eur: t(["EUR", "유로"]).desc(["Euro", "유로"]),
  }));`}
          />
          <div>
            {l.trans({
              en: `Let's understand the dictionary builder pattern:`,
              ko: `dictionary 빌더 패턴을 이해해봅시다:`,
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={dictionaryItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="method-extensions"
        title={l.trans({ en: "Document Extensions with by()", ko: "by()로 Document 확장하기" })}
      >
        <Docs.Title>{l.trans({ en: "Document Extensions with by()", ko: "by()로 Document 확장하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The document file extends your scalar with custom methods using the by() function. This is optional but useful for adding computed properties and data transformation methods.`,
              ko: `document 파일은 by() 함수를 사용하여 커스텀 메서드로 스칼라를 확장합니다. 이것은 선택 사항이지만 계산된 속성과 데이터 변환 메서드를 추가하는 데 유용합니다.`,
            })}
          </div>
          <Code.Snippet
            title="price.document.ts"
            code={`import { by } from "@akanjs/document";
import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {
  getFormatted() {
    const symbols = { usd: "$", krw: "₩", eur: "€" };
    return \`\${symbols[this.currency]}\${this.amount}\`;
  }
}`}
          />
          <div>
            {l.trans({
              en: `Key points about document extensions:`,
              ko: `document 확장에 대한 핵심 포인트:`,
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={documentItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="naming-conventions" title={l.trans({ en: "Naming Conventions", ko: "명명 규칙" })}>
        <Docs.Title>{l.trans({ en: "Naming Conventions", ko: "명명 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Consistent naming is crucial for maintainability. Follow these conventions:`,
              ko: `일관된 명명은 유지보수성에 중요합니다. 다음 규칙을 따르세요:`,
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={namingItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Best Practices", ko: "모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Best Practices", ko: "모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={bestPracticeItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="integration" title={l.trans({ en: "Integration Points", ko: "통합 포인트" })}>
        <Docs.Title>{l.trans({ en: "Integration Points", ko: "통합 포인트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Scalars integrate seamlessly with other parts of the Akan.js framework:`,
              ko: `스칼라는 Akan.js 프레임워크의 다른 부분과 원활하게 통합됩니다:`,
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={integrationItems} />
          <div className="my-6 rounded-lg bg-gradient-to-r from-purple-100 to-blue-100 p-6">
            <div className="mb-3 font-bold text-lg text-purple-800">
              {l.trans({ en: "🎉 What You've Learned:", ko: "🎉 배운 내용:" })}
            </div>
            <ul className="space-y-2 text-purple-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "How to create scalars using via() and enumOf() functions",
                  ko: "via()와 enumOf() 함수를 사용하여 스칼라를 만드는 방법",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "How to define internationalization with scalarDictionary()",
                  ko: "scalarDictionary()로 국제화를 정의하는 방법",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "How to extend scalars with custom methods using by()",
                  ko: "by()를 사용하여 커스텀 메서드로 스칼라를 확장하는 방법",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Naming conventions and best practices for scalars",
                  ko: "스칼라의 명명 규칙과 모범 사례",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "How scalars integrate with models and other framework features",
                  ko: "스칼라가 모델 및 기타 프레임워크 기능과 통합되는 방법",
                })}
              </li>
            </ul>
          </div>
          <div>
            {l.trans({
              en: `Check out the Tutorials section for hands-on examples of creating and using scalars in real applications.`,
              ko: `실제 애플리케이션에서 스칼라를 생성하고 사용하는 실습 예제를 보려면 Tutorials 섹션을 확인하세요.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
