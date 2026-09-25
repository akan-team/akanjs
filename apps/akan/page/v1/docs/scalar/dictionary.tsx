import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const scalarMethods: IntroItem[] = [
    {
      name: ".of((t) => ...)",
      desc: l.trans({
        en: "Define scalar name & description.",
        ko: "스칼라 이름과 설명을 정의합니다.",
      }),
      example: `.of((t) => t(["Scalar Name", "스칼라 이름"]).desc(["Description", "설명"]))`,
    },
    {
      name: ".model<T>((t) => ...)",
      desc: l.trans({
        en: "Define field translations.",
        ko: "필드 번역을 정의합니다.",
      }),
      example: `.model<YourScalar>((t) => ({ fieldName: t(["Label", "레이블"]) }))`,
    },
    {
      name: ".enum<T>(name, (t) => ...)",
      desc: l.trans({
        en: "Define enum value translations.",
        ko: "Enum 값 번역을 정의합니다.",
      }),
      example: `.enum<YourEnum>("enumName", (t) => ({ value1: t(["Label", "레이블"]) }))`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="introduction" title={l.trans({ en: "Scalar Dictionary", ko: "스칼라 Dictionary" })}>
        <Docs.Title>{l.trans({ en: "Scalar Dictionary", ko: "스칼라 Dictionary" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The dictionary file (*.dictionary.ts) provides internationalization for your scalar. Using the scalarDictionary() builder pattern, you define translations for the scalar name, field labels, descriptions, and enum values.`,
              ko: `dictionary 파일 (*.dictionary.ts)은 스칼라에 대한 국제화를 제공합니다. scalarDictionary() 빌더 패턴을 사용하여 스칼라 이름, 필드 레이블, 설명 및 enum 값에 대한 번역을 정의합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `This guide covers the scalarDictionary() syntax, chaining methods, and best practices for defining translations.`,
              ko: `이 가이드는 scalarDictionary() 문법, 체이닝 메서드 및 번역 정의를 위한 모범 사례를 다룹니다.`,
            })}
          </div>
          <div className="my-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🌐</span>
                <strong className="text-blue-800">{l.trans({ en: "Key Benefits", ko: "주요 이점" })}</strong>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-blue-700 text-sm">
                <li>{l.trans({ en: "End-to-end type safety", ko: "엔드투엔드 타입 안전성" })}</li>
                <li>{l.trans({ en: "Fluent builder pattern", ko: "플루언트 빌더 패턴" })}</li>
                <li>{l.trans({ en: "Automatic validation via generics", ko: "제네릭을 통한 자동 검증" })}</li>
                <li>{l.trans({ en: "Multi-language support", ko: "다국어 지원" })}</li>
              </ul>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">📁</span>
                <strong className="text-green-800">{l.trans({ en: "File Structure", ko: "파일 구조" })}</strong>
              </div>
              <Code.Snippet
                language="bash"
                code={`__scalar/
└── <scalarName>/
    ├── <name>.constant.ts
    └── <name>.dictionary.ts`}
              />
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="translation-methods"
        title={l.trans({ en: "Scalar Dictionary Builder", ko: "Scalar Dictionary 빌더" })}
      >
        <Docs.Title>{l.trans({ en: "Scalar Dictionary Builder", ko: "Scalar Dictionary 빌더" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The scalarDictionary() function creates a type-safe dictionary using a fluent builder pattern.",
              ko: "scalarDictionary() 함수는 플루언트 빌더 패턴을 사용하여 타입 안전한 dictionary를 생성합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={scalarMethods} />

        <div className="mb-8" />

        <Docs.SubTitle>{l.trans({ en: "Translation Format", ko: "번역 형식" })}</Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Each translation uses the t() function with an array of values matching the language order.",
              ko: "각 번역은 언어 순서와 일치하는 값 배열과 함께 t() 함수를 사용합니다.",
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Pattern", ko: "패턴" })}
            code={`t(["English Label", "한국어 레이블"]).desc(["Description", "설명"])`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="translation-format"
        title={l.trans({
          en: "Translation Format",
          ko: "번역 형식",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Translation Format",
            ko: "번역 형식",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Each translation uses the t() function with an array of values. The array order matches the language order defined in scalarDictionary().`,
              ko: `각 번역은 값 배열과 함께 t() 함수를 사용합니다. 배열 순서는 scalarDictionary()에서 정의한 언어 순서와 일치합니다.`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Translation Pattern", ko: "번역 패턴" })}
            code={`// Language order: ["en", "ko"]
// Index 0 = English, Index 1 = Korean

t(["English Label", "한국어 레이블"]).desc(["English description", "한국어 설명"])`}
          />
          <div className="my-4 overflow-x-auto">
            <table className="table-zebra table w-full">
              <thead>
                <tr>
                  <th>{l.trans({ en: "Method", ko: "메서드" })}</th>
                  <th>{l.trans({ en: "Purpose", ko: "목적" })}</th>
                  <th>{l.trans({ en: "Example", ko: "예시" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>t([...])</code>
                  </td>
                  <td>{l.trans({ en: "Define the label/name", ko: "레이블/이름 정의" })}</td>
                  <td>
                    <code>{'t(["Status", "상태"])'}</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>.desc([...])</code>
                  </td>
                  <td>{l.trans({ en: "Define the description", ko: "설명 정의" })}</td>
                  <td>
                    <code>{'.desc(["Current status", "현재 상태"])'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="alert alert-info">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="h-6 w-6 shrink-0 stroke-current"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              {l.trans({
                en: "Both label and description are required for complete internationalization support.",
                ko: "완전한 국제화 지원을 위해 레이블과 설명 모두 필요합니다.",
              })}
            </span>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="complete-example"
        title={l.trans({
          en: "Complete Example",
          ko: "완전한 예시",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Complete Example",
            ko: "완전한 예시",
          })}
        </Docs.Title>
        <Docs.Description>
          <Code.Snippet
            title="price.dictionary.ts"
            code={`import { scalarDictionary } from "@akanjs/dictionary";
import type { Currency, Price } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price information", "가격 정보"]))
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
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="enum-matching"
        title={l.trans({
          en: "Enum Name Matching",
          ko: "Enum 이름 매칭",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Enum Name Matching",
            ko: "Enum 이름 매칭",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The first argument to .enum() must match the name used in enumOf() from the constant file. This ensures proper type checking and runtime resolution.`,
              ko: `.enum()의 첫 번째 인수는 constant 파일의 enumOf()에서 사용된 이름과 일치해야 합니다. 이렇게 하면 적절한 타입 검사와 런타임 해석이 보장됩니다.`,
            })}
          </div>
          <div className="my-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 font-bold text-sm">constant.ts</div>
              <Code.Snippet
                code={`export class Currency extends enumOf("currency", [
  "usd", "krw", "eur"
]) {}`}
              />
            </div>
            <div>
              <div className="mb-2 font-bold text-sm">dictionary.ts</div>
              <Code.Snippet
                code={`// Must match: "currency"
.enum<Currency>("currency", (t) => ({
  usd: t(["USD", "달러"]).desc([...]),
  krw: t(["KRW", "원"]).desc([...]),
  eur: t(["EUR", "유로"]).desc([...]),
}))`}
              />
            </div>
          </div>
          <div className="alert alert-warning">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>
              {l.trans({
                en: 'Important: The enum name string must exactly match the first argument of enumOf(). For example, enumOf("journey", [...]) requires .enum<Journey>("journey", ...).',
                ko: '중요: enum 이름 문자열은 enumOf()의 첫 번째 인수와 정확히 일치해야 합니다. 예: enumOf("journey", [...])는 .enum<Journey>("journey", ...)가 필요합니다.',
              })}
            </span>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="type-imports"
        title={l.trans({
          en: "Type Imports",
          ko: "타입 Import",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Type Imports",
            ko: "타입 Import",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Always import types from the constant file to ensure type safety. The generic parameters enforce that all fields and enum values have translations.`,
              ko: `타입 안전성을 보장하기 위해 항상 constant 파일에서 타입을 import하세요. 제네릭 파라미터는 모든 필드와 enum 값에 번역이 있도록 강제합니다.`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Import Pattern", ko: "Import 패턴" })}
            code={`import { scalarDictionary } from "@akanjs/dictionary";

// Import types using "import type" for cleaner code
import type { EncourageInfo, Inquiry, Journey } from "./encourageInfo.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => ...)
  .model<EncourageInfo>((t) => ({
    // TypeScript ensures all fields of EncourageInfo are defined
  }))
  .enum<Journey>("journey", (t) => ({
    // TypeScript ensures all values of Journey enum are defined
  }))
  .enum<Inquiry>("inquiry", (t) => ({
    // TypeScript ensures all values of Inquiry enum are defined
  }));`}
          />
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">✓</span>
              <div>
                <strong>{"import type"}</strong>:{" "}
                {l.trans({
                  en: "Use 'import type' for type-only imports. This ensures no runtime code is included.",
                  ko: "타입 전용 import에는 'import type'을 사용하세요. 이렇게 하면 런타임 코드가 포함되지 않습니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              <div>
                <strong>{".model<Type>"}</strong>:{" "}
                {l.trans({
                  en: "Provides autocomplete for field names and validates that all fields are translated.",
                  ko: "필드 이름에 대한 자동완성을 제공하고 모든 필드가 번역되었는지 검증합니다.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">✓</span>
              <div>
                <strong>{".enum<Type>"}</strong>:{" "}
                {l.trans({
                  en: "Provides autocomplete for enum values and validates that all values are translated.",
                  ko: "enum 값에 대한 자동완성을 제공하고 모든 값이 번역되었는지 검증합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="common-mistakes"
        title={l.trans({
          en: "Common Mistakes",
          ko: "흔한 실수",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Common Mistakes",
            ko: "흔한 실수",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Avoid these common mistakes when defining scalar dictionaries:`,
              ko: `스칼라 dictionary를 정의할 때 다음과 같은 흔한 실수를 피하세요:`,
            })}
          </div>
          <div className="my-4 overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>{l.trans({ en: "Issue", ko: "문제" })}</th>
                  <th>{l.trans({ en: "Wrong", ko: "잘못된 예" })}</th>
                  <th>{l.trans({ en: "Correct", ko: "올바른 예" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover">
                  <td>{l.trans({ en: "Missing .desc()", ko: ".desc() 누락" })}</td>
                  <td>
                    <code className="text-error">{'t(["Label", "레이블"])'}</code>
                  </td>
                  <td>
                    <code className="text-success">{'t(["Label", "레이블"]).desc(["Desc", "설명"])'}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Wrong enum name", ko: "잘못된 enum 이름" })}</td>
                  <td>
                    <code className="text-error">{'.enum<Journey>("Journey", ...)'}</code>
                  </td>
                  <td>
                    <code className="text-success">{'.enum<Journey>("journey", ...)'}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Missing export", ko: "export 누락" })}</td>
                  <td>
                    <code className="text-error">{"const dictionary = ..."}</code>
                  </td>
                  <td>
                    <code className="text-success">{"export const dictionary = ..."}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Wrong array order", ko: "잘못된 배열 순서" })}</td>
                  <td>
                    <code className="text-error">{'t(["한국어", "English"])'}</code>
                  </td>
                  <td>
                    <code className="text-success">{'t(["English", "한국어"])'}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Missing field", ko: "필드 누락" })}</td>
                  <td>
                    <code className="text-error">{"// TypeScript error"}</code>
                  </td>
                  <td>
                    <code className="text-success">{l.trans({ en: "All fields defined", ko: "모든 필드 정의" })}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="best-practices"
        title={l.trans({
          en: "Best Practices",
          ko: "모범 사례",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Best Practices",
            ko: "모범 사례",
          })}
        </Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Always Use Type Generics", ko: "항상 타입 제네릭 사용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Use .model<Type> and .enum<Type> to ensure TypeScript validates all fields and values are translated.",
                  ko: ".model<Type>과 .enum<Type>을 사용하여 TypeScript가 모든 필드와 값이 번역되었는지 검증하도록 하세요.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Consistent Language Order", ko: "일관된 언어 순서" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: 'Always use the same language order (e.g., ["en", "ko"]) across all dictionaries in your project.',
                  ko: '프로젝트의 모든 dictionary에서 항상 같은 언어 순서 (예: ["en", "ko"])를 사용하세요.',
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Meaningful Descriptions", ko: "의미 있는 설명" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Provide helpful descriptions that explain the field's purpose, not just repeat the label.",
                  ko: "레이블을 단순 반복하지 말고 필드의 목적을 설명하는 유용한 설명을 제공하세요.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Export as 'dictionary'", ko: "'dictionary'로 Export" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Use the standard export name 'dictionary' for consistency with the framework's auto-import system.",
                  ko: "프레임워크의 자동 import 시스템과의 일관성을 위해 표준 export 이름 'dictionary'를 사용하세요.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="checklist"
        title={l.trans({
          en: "Implementation Checklist",
          ko: "구현 체크리스트",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Implementation Checklist",
            ko: "구현 체크리스트",
          })}
        </Docs.Title>
        <Docs.Description>
          <div className="rounded-lg bg-base-200 p-4">
            <ul className="space-y-2">
              {[
                l.trans({
                  en: "File location: __scalar/<name>/<name>.dictionary.ts",
                  ko: "파일 위치: __scalar/<name>/<name>.dictionary.ts",
                }),
                l.trans({
                  en: "Import scalarDictionary from '@akanjs/dictionary'",
                  ko: "'@akanjs/dictionary'에서 scalarDictionary import",
                }),
                l.trans({
                  en: "Import types from constant file using 'import type'",
                  ko: "'import type'을 사용하여 constant 파일에서 타입 import",
                }),
                l.trans({
                  en: 'Initialize with correct language order: ["en", "ko"]',
                  ko: '올바른 언어 순서로 초기화: ["en", "ko"]',
                }),
                l.trans({
                  en: "Define scalar name/description with .of()",
                  ko: ".of()로 스칼라 이름/설명 정의",
                }),
                l.trans({
                  en: "Define all field translations with .model<Type>()",
                  ko: ".model<Type>()로 모든 필드 번역 정의",
                }),
                l.trans({
                  en: "Define all enum translations with .enum<Type>(name)",
                  ko: ".enum<Type>(name)으로 모든 enum 번역 정의",
                }),
                l.trans({
                  en: "Ensure enum name matches enumOf() name",
                  ko: "enum 이름이 enumOf() 이름과 일치하는지 확인",
                }),
                l.trans({
                  en: "Include both label and description for all entries",
                  ko: "모든 항목에 레이블과 설명 모두 포함",
                }),
                l.trans({
                  en: "Export as 'dictionary'",
                  ko: "'dictionary'로 export",
                }),
              ].map((item, index) => (
                <li key={index} className="flex items-start">
                  <input type="checkbox" className="checkbox checkbox-primary mt-1 mr-2" readOnly />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-green-100 to-blue-100 p-6">
            <div className="mb-3 font-bold text-green-800 text-lg">
              {l.trans({ en: "💡 Pro Tips:", ko: "💡 프로 팁:" })}
            </div>
            <ul className="space-y-2 text-green-700 text-sm">
              <li>
                •{" "}
                {l.trans({
                  en: "TypeScript will show errors if you miss any fields or enum values - use this to your advantage!",
                  ko: "TypeScript는 필드나 enum 값을 누락하면 오류를 표시합니다 - 이를 활용하세요!",
                })}
              </li>
              <li>
                •{" "}
                {l.trans({
                  en: "The dictionary is used for UI labels, form validation messages, and API documentation",
                  ko: "dictionary는 UI 레이블, 폼 유효성 검사 메시지, API 문서에 사용됩니다",
                })}
              </li>
              <li>
                •{" "}
                {l.trans({
                  en: "Keep descriptions concise but informative - they appear in tooltips and help text",
                  ko: "설명은 간결하지만 유익하게 - 툴팁과 도움말 텍스트에 표시됩니다",
                })}
              </li>
            </ul>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
