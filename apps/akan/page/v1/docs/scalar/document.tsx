import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide
        id="introduction"
        title={l.trans({
          en: "Scalar Document Implementation Guide",
          ko: "스칼라 Document 구현 가이드",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Scalar Document Implementation Guide",
            ko: "스칼라 Document 구현 가이드",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The document file (*.document.ts) is an optional file that extends your scalar with custom methods using the by() function. While constant.ts defines the data structure and dictionary.ts provides translations, document.ts adds runtime behavior and utility methods.`,
              ko: `document 파일 (*.document.ts)은 by() 함수를 사용하여 커스텀 메서드로 스칼라를 확장하는 선택적 파일입니다. constant.ts가 데이터 구조를 정의하고 dictionary.ts가 번역을 제공하는 반면, document.ts는 런타임 동작과 유틸리티 메서드를 추가합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `This guide covers the by() function syntax, when to use document.ts, and patterns for adding methods.`,
              ko: `이 가이드는 by() 함수 문법, document.ts를 사용해야 할 때, 메서드 추가 패턴을 다룹니다.`,
            })}
          </div>
        </Docs.Description>
        <div className="my-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-blue-600">📁</span>
              <strong className="text-blue-800">{l.trans({ en: "File Structure", ko: "파일 구조" })}</strong>
            </div>
            <Code.Snippet
              language="bash"
              code={`__scalar/
└── <scalarName>/
    ├── <name>.constant.ts   # Schema
    ├── <name>.dictionary.ts # I18n
    └── <name>.document.ts   # Methods (optional)`}
            />
          </div>
          <div className="rounded-lg bg-green-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-green-600">🎯</span>
              <strong className="text-green-800">{l.trans({ en: "When to Use", ko: "사용 시기" })}</strong>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-green-700 text-sm">
              <li>{l.trans({ en: "Add computed properties", ko: "계산된 속성 추가" })}</li>
              <li>{l.trans({ en: "Add utility methods", ko: "유틸리티 메서드 추가" })}</li>
              <li>{l.trans({ en: "Add data transformation logic", ko: "데이터 변환 로직 추가" })}</li>
              <li>{l.trans({ en: "Add validation helpers", ko: "유효성 검사 헬퍼 추가" })}</li>
            </ul>
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="basic-syntax"
        title={l.trans({
          en: "Basic Syntax with by()",
          ko: "by()를 사용한 기본 문법",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Basic Syntax with by()",
            ko: "by()를 사용한 기본 문법",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The by() function wraps your constant class and enables you to add instance methods. It preserves all the fields and types from the constant while allowing you to extend functionality.`,
              ko: `by() 함수는 constant 클래스를 감싸고 인스턴스 메서드를 추가할 수 있게 합니다. constant의 모든 필드와 타입을 유지하면서 기능을 확장할 수 있습니다.`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Basic Structure", ko: "기본 구조" })}
            code={`import { by } from "@akanjs/document";

import * as cnst from "./yourScalar.constant";

export class YourScalar extends by(cnst.YourScalar) {
  // Add custom methods here
}`}
          />
          <div>
            {l.trans({
              en: `Let's understand each part:`,
              ko: `각 부분을 이해해봅시다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">📦</span>
                <strong className="text-blue-800">{"import { by } from '@akanjs/document'"}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Import the by() function from @akanjs/document. This is the only import needed for scalar documents.`,
                  ko: `@akanjs/document에서 by() 함수를 import합니다. 스칼라 document에 필요한 유일한 import입니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🔗</span>
                <strong className="text-green-800">{"import * as cnst"}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `Import the constant module as 'cnst' namespace. This convention prevents naming conflicts between the constant class and document class.`,
                  ko: `constant 모듈을 'cnst' 네임스페이스로 import합니다. 이 규칙은 constant 클래스와 document 클래스 간의 이름 충돌을 방지합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">⚡</span>
                <strong className="text-purple-800">{"extends by(cnst.YourScalar)"}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: `The by() function creates a base class from your constant. Your document class extends this to inherit all fields and add methods.`,
                  ko: `by() 함수는 constant로부터 기본 클래스를 생성합니다. document 클래스는 이를 확장하여 모든 필드를 상속하고 메서드를 추가합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="minimal-document"
        title={l.trans({
          en: "Minimal Document (No Methods)",
          ko: "최소 Document (메서드 없음)",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Minimal Document (No Methods)",
            ko: "최소 Document (메서드 없음)",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Most scalar document files are minimal - they simply wrap the constant class without adding any methods. This is useful for consistency and potential future extensions.`,
              ko: `대부분의 스칼라 document 파일은 최소한입니다 - 메서드를 추가하지 않고 constant 클래스를 단순히 감쌉니다. 이는 일관성과 향후 확장 가능성을 위해 유용합니다.`,
            })}
          </div>
          <Code.Snippet
            code={`import { by } from "@akanjs/document";
import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {}`}
          />
          <div className="alert alert-info my-4">
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
                en: "Even empty document files are useful! They provide a clear extension point for future methods and maintain a consistent file structure.",
                ko: "빈 document 파일도 유용합니다! 향후 메서드를 위한 명확한 확장 포인트를 제공하고 일관된 파일 구조를 유지합니다.",
              })}
            </span>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="adding-methods"
        title={l.trans({
          en: "Adding Custom Methods",
          ko: "커스텀 메서드 추가하기",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Adding Custom Methods",
            ko: "커스텀 메서드 추가하기",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `You can add instance methods directly in the class body. These methods have access to all fields via 'this' and can perform calculations, validations, or transformations.`,
              ko: `클래스 본문에 인스턴스 메서드를 직접 추가할 수 있습니다. 이 메서드들은 'this'를 통해 모든 필드에 접근할 수 있으며 계산, 유효성 검사 또는 변환을 수행할 수 있습니다.`,
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
              en: `Common patterns for document methods:`,
              ko: `document 메서드의 일반적인 패턴:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🧮</span>
                <strong className="text-blue-800">{l.trans({ en: "Computed Properties", ko: "계산된 속성" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Methods that calculate values from existing fields (e.g., getPercentage(), getTotal()).",
                  ko: "기존 필드에서 값을 계산하는 메서드 (예: getPercentage(), getTotal()).",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✅</span>
                <strong className="text-green-800">{l.trans({ en: "Status Checkers", ko: "상태 확인" })}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Methods that check conditions and return booleans (e.g., isActive(), isExpired(), hasStock()).",
                  ko: "조건을 확인하고 불리언을 반환하는 메서드 (예: isActive(), isExpired(), hasStock()).",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">🔄</span>
                <strong className="text-purple-800">{l.trans({ en: "Data Transformers", ko: "데이터 변환" })}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Methods that transform or format data (e.g., getFormattedDate(), getDisplayName()).",
                  ko: "데이터를 변환하거나 포맷하는 메서드 (예: getFormattedDate(), getDisplayName()).",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">🔍</span>
                <strong className="text-yellow-800">{l.trans({ en: "Parsers/Extractors", ko: "파서/추출기" })}</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Methods that extract specific information from fields (e.g., getService() parsing pod names).",
                  ko: "필드에서 특정 정보를 추출하는 메서드 (예: pod 이름을 파싱하는 getService()).",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="method-examples"
        title={l.trans({
          en: "Method Examples",
          ko: "메서드 예시",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Method Examples",
            ko: "메서드 예시",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Here are practical examples of methods you might add to scalar documents:`,
              ko: `스칼라 document에 추가할 수 있는 메서드의 실용적인 예시입니다:`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Stock - Computed & Status", ko: "Stock - 계산 & 상태" })}
            code={`export class Stock extends by(cnst.Stock) {
  getPercentage() {
    if (this.total === 0) return 0;
    return (this.current / this.total) * 100;
  }
  
  isLow() {
    return this.getPercentage() < 30;
  }
}`}
          />
          <Code.Snippet
            title={l.trans({ en: "DateRange - Formatting", ko: "DateRange - 포맷팅" })}
            code={`export class DateRange extends by(cnst.DateRange) {
  getDisplay(format = "YYYY-MM-DD") {
    return \`\${dayjs(this.start).format(format)} ~ \${dayjs(this.end).format(format)}\`;
  }
  
  isExpired() {
    return dayjs().isAfter(this.end);
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="constant-vs-document"
        title={l.trans({ en: "Constant vs Document", ko: "Constant vs Document" })}
      >
        <Docs.Title>{l.trans({ en: "Constant vs Document", ko: "Constant vs Document" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `You can define methods in either constant.ts or document.ts. Here's when to use each:`,
              ko: `constant.ts 또는 document.ts에서 메서드를 정의할 수 있습니다. 각각을 사용할 때:`,
            })}
          </div>
          <div className="my-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-blue-600">📋</span>
                <strong className="text-blue-800">constant.ts</strong>
              </div>
              <ul className="list-disc space-y-2 pl-5 text-blue-700 text-sm">
                <li>
                  {l.trans({
                    en: "Simple methods that only use field values",
                    ko: "필드 값만 사용하는 간단한 메서드",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "Methods needed on both client and server",
                    ko: "클라이언트와 서버 모두에서 필요한 메서드",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "No external dependencies needed",
                    ko: "외부 의존성이 필요 없음",
                  })}
                </li>
              </ul>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-purple-600">📄</span>
                <strong className="text-purple-800">document.ts</strong>
              </div>
              <ul className="list-disc space-y-2 pl-5 text-purple-700 text-sm">
                <li>
                  {l.trans({
                    en: "Methods with complex logic",
                    ko: "복잡한 로직이 있는 메서드",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "Methods that may need server-side imports",
                    ko: "서버 측 import가 필요할 수 있는 메서드",
                  })}
                </li>
                <li>
                  {l.trans({
                    en: "Separation of concerns (schema vs behavior)",
                    ko: "관심사 분리 (스키마 vs 동작)",
                  })}
                </li>
              </ul>
            </div>
          </div>
          <Code.Snippet
            title={l.trans({ en: "Methods in constant.ts", ko: "constant.ts의 메서드" })}
            code={`// price.constant.ts - Simple methods in via()
export class Price extends via((field) => ({
  amount: field(Float, { min: 0 }),
  currency: field(Currency),
})) {
  isZero() {
    return this.amount === 0;
  }
}`}
          />
          <div className="alert alert-warning my-4">
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
                en: "Note: If you define methods in both constant.ts and document.ts, the document.ts methods will override constant.ts methods.",
                ko: "참고: constant.ts와 document.ts 모두에서 메서드를 정의하면 document.ts 메서드가 constant.ts 메서드를 오버라이드합니다.",
              })}
            </span>
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
                  {l.trans({ en: "Use 'cnst' Namespace", ko: "'cnst' 네임스페이스 사용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Always import constant as 'cnst' to avoid naming conflicts: import * as cnst from './scalar.constant'",
                  ko: "이름 충돌을 피하기 위해 항상 constant를 'cnst'로 import: import * as cnst from './scalar.constant'",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Match Class Names", ko: "클래스 이름 일치" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "The document class name should match the constant class name for consistency.",
                  ko: "일관성을 위해 document 클래스 이름은 constant 클래스 이름과 일치해야 합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Keep Methods Pure", ko: "메서드를 순수하게 유지" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Scalar document methods should be pure functions that don't modify state or have side effects.",
                  ko: "스칼라 document 메서드는 상태를 수정하거나 부작용이 없는 순수 함수여야 합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Use Descriptive Names", ko: "설명적인 이름 사용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Use clear method names: getPercentage(), isActive(), hasStock() rather than calc(), check(), has().",
                  ko: "명확한 메서드 이름 사용: calc(), check(), has() 대신 getPercentage(), isActive(), hasStock().",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Create Even If Empty", ko: "비어있어도 생성" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Create document.ts even without methods for consistency and future extensibility.",
                  ko: "일관성과 향후 확장성을 위해 메서드가 없어도 document.ts를 생성하세요.",
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
                  en: "File location: __scalar/<name>/<name>.document.ts",
                  ko: "파일 위치: __scalar/<name>/<name>.document.ts",
                }),
                l.trans({
                  en: "Import by from '@akanjs/document'",
                  ko: "'@akanjs/document'에서 by import",
                }),
                l.trans({
                  en: "Import constant as 'cnst' namespace",
                  ko: "constant를 'cnst' 네임스페이스로 import",
                }),
                l.trans({
                  en: "Class name matches constant class name",
                  ko: "클래스 이름이 constant 클래스 이름과 일치",
                }),
                l.trans({
                  en: "Extends by(cnst.ClassName)",
                  ko: "by(cnst.ClassName)을 확장",
                }),
                l.trans({
                  en: "Export the document class",
                  ko: "document 클래스 export",
                }),
                l.trans({
                  en: "Methods use 'this' to access fields",
                  ko: "메서드가 'this'로 필드에 접근",
                }),
                l.trans({
                  en: "Methods are pure (no side effects)",
                  ko: "메서드가 순수 (부작용 없음)",
                }),
              ].map((item, index) => (
                <li key={index} className="flex items-start">
                  <input type="checkbox" className="checkbox checkbox-primary mt-1 mr-2" readOnly />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-purple-100 to-blue-100 p-6">
            <div className="mb-3 font-bold text-lg text-purple-800">
              {l.trans({ en: "💡 Pro Tips:", ko: "💡 프로 팁:" })}
            </div>
            <ul className="space-y-2 text-purple-700 text-sm">
              <li>
                •{" "}
                {l.trans({
                  en: "Document methods are available on both client and server - be careful with server-only imports",
                  ko: "Document 메서드는 클라이언트와 서버 모두에서 사용 가능 - 서버 전용 import에 주의",
                })}
              </li>
              <li>
                •{" "}
                {l.trans({
                  en: "For simple scalars with no methods, an empty document class is perfectly fine",
                  ko: "메서드가 없는 간단한 스칼라의 경우 빈 document 클래스도 괜찮습니다",
                })}
              </li>
              <li>
                •{" "}
                {l.trans({
                  en: "Consider defining frequently-used methods in constant.ts for better tree-shaking",
                  ko: "더 나은 트리쉐이킹을 위해 자주 사용되는 메서드는 constant.ts에 정의하는 것을 고려",
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
