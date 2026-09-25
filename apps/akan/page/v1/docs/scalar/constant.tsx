import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem, type OptionItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const fieldOptions: OptionItem[] = [
    {
      key: "default",
      type: "Any | Function",
      default: "undefined",
      desc: l.trans({
        en: "Default field value (static or factory function)",
        ko: "기본 필드 값 (정적 또는 팩토리 함수)",
      }),
      example: "{ default: 0 } or { default: () => dayjs() }",
    },
    {
      key: "min",
      type: "Number",
      default: "-",
      desc: l.trans({ en: "Minimum numeric value", ko: "최소 숫자 값" }),
      example: "{ min: 0 }",
    },
    {
      key: "max",
      type: "Number",
      default: "-",
      desc: l.trans({ en: "Maximum numeric value", ko: "최대 숫자 값" }),
      example: "{ max: 100 }",
    },
    {
      key: "minlength",
      type: "Number",
      default: "-",
      desc: l.trans({ en: "Minimum string length", ko: "최소 문자열 길이" }),
      example: "{ minlength: 3 }",
    },
    {
      key: "maxlength",
      type: "Number",
      default: "-",
      desc: l.trans({ en: "Maximum string length", ko: "최대 문자열 길이" }),
      example: "{ maxlength: 255 }",
    },
    {
      key: "validate",
      type: "Function",
      default: "-",
      desc: l.trans({ en: "Custom validation function", ko: "커스텀 유효성 검사 함수" }),
      example: "{ validate: isPhoneNumber }",
    },
    {
      key: "example",
      type: "Any",
      default: "-",
      desc: l.trans({ en: "Example value for documentation", ko: "문서화를 위한 예시 값" }),
      example: "{ example: [0, 0] }",
    },
  ];

  const fileStructureItems: IntroItem[] = [
    {
      name: l.trans({ en: "Directory", ko: "디렉토리" }),
      desc: "camelCase",
      example: "encourageInfo",
    },
    {
      name: l.trans({ en: "File", ko: "파일" }),
      desc: "<scalarName>.constant.ts",
      example: "encourageInfo.constant.ts",
    },
    {
      name: l.trans({ en: "Scalar Class", ko: "스칼라 클래스" }),
      desc: "PascalCase",
      example: "EncourageInfo",
    },
    {
      name: l.trans({ en: "Enum Class", ko: "Enum 클래스" }),
      desc: "PascalCase",
      example: "Journey, NotiSetting",
    },
    {
      name: l.trans({ en: "Enum Values", ko: "Enum 값" }),
      desc: "camelCase",
      example: "firstJoin, waitPay",
    },
  ];

  const viaPatternPoints: IntroItem[] = [
    {
      name: "via((field) => ({...}))",
      desc: l.trans({
        en: "Creates a class with typed fields. The callback receives the field() helper function.",
        ko: "타입이 지정된 필드를 가진 클래스를 생성합니다. 콜백은 field() 헬퍼 함수를 받습니다.",
      }),
      example: null,
    },
    {
      name: "field(Type)",
      desc: l.trans({
        en: "Defines a single field. First argument is the type (String, Number, Date, etc.).",
        ko: "단일 필드를 정의합니다. 첫 번째 인수는 타입입니다 (String, Number, Date 등).",
      }),
      example: null,
    },
    {
      name: "field(Type, { options })",
      desc: l.trans({
        en: "Optional second argument is an options object for defaults, validation, etc.",
        ko: "선택적인 두 번째 인수는 기본값, 유효성 검사 등을 위한 옵션 객체입니다.",
      }),
      example: null,
    },
  ];

  const enumPoints: IntroItem[] = [
    {
      name: "enumOf(name, values)",
      desc: l.trans({
        en: "First argument is the enum name (used in dictionary/GraphQL). Second is the value array.",
        ko: "첫 번째 인수는 enum 이름 (dictionary/GraphQL에서 사용됨). 두 번째는 값 배열입니다.",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "camelCase Values", ko: "camelCase 값" }),
      desc: l.trans({
        en: 'Always use camelCase for enum values (e.g., "waitPay", not "WAIT_PAY").',
        ko: '항상 enum 값에 camelCase를 사용하세요 (예: "waitPay", "WAIT_PAY" 아님).',
      }),
      example: null,
    },
    {
      name: "as const",
      desc: l.trans({
        en: "Add 'as const' to the values array for better TypeScript type inference.",
        ko: "더 나은 TypeScript 타입 추론을 위해 값 배열에 'as const'를 추가하세요.",
      }),
      example: null,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="introduction" title={l.trans({ en: "Scalar Constant", ko: "스칼라 Constant" })}>
        <Docs.Title>{l.trans({ en: "Scalar Constant", ko: "스칼라 Constant" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The constant file (*.constant.ts) is where you define the schema for your scalar. Using the via() function and enumOf() helper, you create type-safe, reusable value objects that can be embedded in other models.`,
              ko: `constant 파일 (*.constant.ts)은 스칼라의 스키마를 정의하는 곳입니다. via() 함수와 enumOf() 헬퍼를 사용하여 다른 모델에 임베드할 수 있는 타입 안전하고 재사용 가능한 값 객체를 생성합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="file-structure"
        title={l.trans({
          en: "File Structure and Location",
          ko: "파일 구조 및 위치",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "File Structure and Location",
            ko: "파일 구조 및 위치",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Scalar constants follow strict naming conventions and directory structure:",
              ko: "Scalar 상수는 엄격한 명명 규칙과 디렉토리 구조를 따릅니다:",
            })}
          </div>
          <Code.Snippet
            language="bash"
            code={`# File location convention
{app,lib}/
└── */lib/__scalar/
    └── <scalarName>/                 # camelCase directory
        └── <scalarName>.constant.ts  # scalar definition file`}
          />
          <Docs.IntroTable type="field" items={fileStructureItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="basic-syntax"
        title={l.trans({
          en: "Basic Syntax with via()",
          ko: "via()를 사용한 기본 문법",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Basic Syntax with via()",
            ko: "via()를 사용한 기본 문법",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The via() function is the foundation for defining scalars. It takes a callback that receives the field() function, which you use to define each field's type and options.`,
              ko: `via() 함수는 스칼라를 정의하는 기반입니다. field() 함수를 받는 콜백을 취하며, 이를 사용하여 각 필드의 타입과 옵션을 정의합니다.`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Basic Structure", ko: "기본 구조" })}
            code={`import { via } from "@akanjs/constant";

export class ScalarName extends via((field) => ({
  fieldName: field(FieldType),
  fieldWithOptions: field(FieldType, { ...options }),
})) {
  // Optional: Add instance methods here
}`}
          />
          <div>
            {l.trans({
              en: `Here's a simple real-world example:`,
              ko: `간단한 실제 예시입니다:`,
            })}
          </div>
          <Code.Snippet
            title="restrictInfo.constant.ts"
            code={`import { via } from "@akanjs/constant";

export class RestrictInfo extends via((field) => ({
  until: field(Date),
  reason: field(String),
})) {}`}
          />
          <Docs.IntroTable type="method" items={viaPatternPoints} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="field-types"
        title={l.trans({
          en: "Available Field Types",
          ko: "사용 가능한 필드 타입",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Available Field Types",
            ko: "사용 가능한 필드 타입",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Akan.js provides several built-in types that you can use with the field() function:`,
              ko: `Akan.js는 field() 함수와 함께 사용할 수 있는 여러 내장 타입을 제공합니다:`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Primitive Types", ko: "기본 타입" })}
            code={`import { ID, Int, Float } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class Example extends via((field) => ({
  // String type
  name: field(String),
  
  // Number types
  count: field(Int),        // Integer
  price: field(Float),      // Floating point
  
  // Boolean type
  isActive: field(Boolean),
  
  // Date type (internally uses Dayjs)
  createdAt: field(Date),
  
  // ID type (MongoDB ObjectId)
  referenceId: field(ID),
})) {}`}
          />
          <div>
            {l.trans({
              en: `Array types are defined by wrapping the type in square brackets:`,
              ko: `배열 타입은 타입을 대괄호로 감싸서 정의합니다:`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Array Types", ko: "배열 타입" })}
            code={`export class Example extends via((field) => ({
  // Array of strings
  tags: field([String]),
  
  // Array of numbers
  scores: field([Int]),
  
  // Array of other scalars
  items: field([OtherScalar]),
  
  // Nested arrays (2D matrix)
  matrix: field([[Int]]),
})) {}`}
          />
          <div>
            {l.trans({
              en: `Optional fields can be defined using the .optional() chain:`,
              ko: `선택적 필드는 .optional() 체인을 사용하여 정의할 수 있습니다:`,
            })}
          </div>
          <Code.Snippet
            title="fileMeta.constant.ts"
            code={`import { ID, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class FileMeta extends via((field) => ({
  fileId: field(ID).optional(),    // Optional field
  lastModifiedAt: field(Date),
  size: field(Int),
})) {}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="enum-definition"
        title={l.trans({
          en: "Defining Enums with enumOf()",
          ko: "enumOf()로 Enum 정의하기",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Defining Enums with enumOf()",
            ko: "enumOf()로 Enum 정의하기",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The enumOf() function creates typed enum classes. Define enums before using them in your scalar fields.`,
              ko: `enumOf() 함수는 타입이 지정된 enum 클래스를 생성합니다. 스칼라 필드에서 사용하기 전에 enum을 정의하세요.`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Basic Enum", ko: "기본 Enum" })}
            code={`import { enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Simple enum definition
export class NotiSetting extends enumOf("notiSetting", [
  "disagree",
  "fewer",
  "normal",
  "block"
]) {}

// Using enum in a scalar
export class NotiInfo extends via((field) => ({
  setting: field(NotiSetting, { default: "normal" }),
})) {}`}
          />
          <div>
            {l.trans({
              en: `For more complex enums with many values, use "as const" for better type inference:`,
              ko: `더 복잡한 enum의 경우 더 나은 타입 추론을 위해 "as const"를 사용하세요:`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Multiple enums with 'as const'", ko: "as const를 사용한 여러 enum" })}
            code={`import { dayjs, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Use "as const" for better type inference
export class Status extends enumOf("status", [
  "pending", "active", "completed", "cancelled"
] as const) {}

export class Order extends via((field) => ({
  status: field(Status, { default: "pending" }),
  orderedAt: field(Date, { default: () => dayjs() }),
})) {}`}
          />
          <Docs.IntroTable type="field" items={enumPoints} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="field-options"
        title={l.trans({
          en: "Field Options",
          ko: "필드 옵션",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Field Options",
            ko: "필드 옵션",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The second argument to field() is an options object that configures defaults, validation, and behavior:`,
              ko: `field()의 두 번째 인수는 기본값, 유효성 검사 및 동작을 구성하는 옵션 객체입니다:`,
            })}
          </div>
          <Docs.OptionTable items={fieldOptions} />
          <div>
            {l.trans({
              en: `Here's how to use various options:`,
              ko: `다양한 옵션 사용 방법입니다:`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Options Examples", ko: "옵션 예시" })}
            code={`import { dayjs, Int, Float } from "@akanjs/base";
import { isPhoneNumber } from "@akanjs/common";
import { via } from "@akanjs/constant";

export class OrderInfo extends via((field) => ({
  // Static default value
  quantity: field(Int, { default: 1 }),
  
  // Dynamic default using factory function
  orderedAt: field(Date, { default: () => dayjs() }),
  
  // Number range validation
  rating: field(Float, { min: 0, max: 5 }),
  
  // String length validation  
  description: field(String, { minlength: 10, maxlength: 500 }),
  
  // Custom validation function
  phone: field(String, { validate: isPhoneNumber }),
  
  // Combined options
  price: field(Float, { 
    default: 0, 
    min: 0,
    example: 29.99 
  }),
})) {}`}
          />
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🎯</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Static vs Dynamic Defaults", ko: "정적 vs 동적 기본값" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: `Use static values for constants (0, "active"). Use factory functions for values that should be computed at creation time (dayjs(), new ObjectId()).`,
                  ko: `상수에는 정적 값을 사용하세요 (0, "active"). 생성 시 계산되어야 하는 값에는 팩토리 함수를 사용하세요 (dayjs(), new ObjectId()).`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">✅</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Custom Validation", ko: "커스텀 유효성 검사" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: `The validate option accepts a function that returns true/false or throws an error. Use it for complex validation logic.`,
                  ko: `validate 옵션은 true/false를 반환하거나 오류를 던지는 함수를 받습니다. 복잡한 유효성 검사 로직에 사용하세요.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="instance-methods"
        title={l.trans({
          en: "Adding Instance Methods",
          ko: "인스턴스 메서드 추가하기",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Adding Instance Methods",
            ko: "인스턴스 메서드 추가하기",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `You can add instance methods directly to the scalar class for computed properties and utility functions:`,
              ko: `계산된 속성과 유틸리티 함수를 위해 스칼라 클래스에 인스턴스 메서드를 직접 추가할 수 있습니다:`,
            })}
          </div>
          <Code.Snippet
            title={l.trans({ en: "Instance Methods", ko: "인스턴스 메서드" })}
            code={`import { Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class Stock extends via((field) => ({
  total: field(Int, { default: 0, min: 0 }),
  current: field(Int, { default: 0, min: 0 }),
})) {
  getPercentage() {
    if (this.total === 0) return 0;
    return (this.current / this.total) * 100;
  }
}`}
          />
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">💡</span>
              <div>
                {l.trans({
                  en: "Instance methods have access to all fields via 'this'. Use them for calculations based on field values.",
                  ko: "인스턴스 메서드는 'this'를 통해 모든 필드에 접근할 수 있습니다. 필드 값을 기반으로 한 계산에 사용하세요.",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">🔧</span>
              <div>
                {l.trans({
                  en: "Methods defined in constant.ts are available on both server and client. For server-only logic, use document.ts instead.",
                  ko: "constant.ts에 정의된 메서드는 서버와 클라이언트 모두에서 사용 가능합니다. 서버 전용 로직은 document.ts를 대신 사용하세요.",
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
              en: `Avoid these common mistakes when defining scalar constants:`,
              ko: `스칼라 상수를 정의할 때 다음과 같은 흔한 실수를 피하세요:`,
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
                  <td>{l.trans({ en: "Enum case", ko: "Enum 케이스" })}</td>
                  <td>
                    <code className="text-error">{"enumOf('status', ['ACTIVE'])"}</code>
                  </td>
                  <td>
                    <code className="text-success">{"enumOf('status', ['active'])"}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Array syntax", ko: "배열 문법" })}</td>
                  <td>
                    <code className="text-error">{"field(Array<Int>)"}</code>
                  </td>
                  <td>
                    <code className="text-success">{"field([Int])"}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Dynamic default", ko: "동적 기본값" })}</td>
                  <td>
                    <code className="text-error">{"{ default: dayjs() }"}</code>
                  </td>
                  <td>
                    <code className="text-success">{"{ default: () => dayjs() }"}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Missing export", ko: "누락된 export" })}</td>
                  <td>
                    <code className="text-error">{"class Status extends enumOf(...)"}</code>
                  </td>
                  <td>
                    <code className="text-success">{"export class Status extends enumOf(...)"}</code>
                  </td>
                </tr>
                <tr className="hover">
                  <td>{l.trans({ en: "Optional field", ko: "선택적 필드" })}</td>
                  <td>
                    <code className="text-error">{"field(ID, { nullable: true })"}</code>
                  </td>
                  <td>
                    <code className="text-success">{"field(ID).optional()"}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="alert alert-warning mt-4">
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
                en: "Important: For Date defaults that should be computed at creation time, always use a factory function: { default: () => dayjs() }",
                ko: "중요: 생성 시 계산되어야 하는 Date 기본값은 항상 팩토리 함수를 사용하세요: { default: () => dayjs() }",
              })}
            </span>
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
                  en: "File location: __scalar/<camelCase>/<camelCase>.constant.ts",
                  ko: "파일 위치: __scalar/<camelCase>/<camelCase>.constant.ts",
                }),
                l.trans({ en: "Import via from '@akanjs/constant'", ko: "'@akanjs/constant'에서 via import" }),
                l.trans({
                  en: "Import enumOf from '@akanjs/base' (if using enums)",
                  ko: "'@akanjs/base'에서 enumOf import (enum 사용 시)",
                }),
                l.trans({ en: "Export all classes (scalar and enums)", ko: "모든 클래스 export (스칼라 및 enum)" }),
                l.trans({ en: "Use PascalCase for class names", ko: "클래스 이름에 PascalCase 사용" }),
                l.trans({ en: "Use camelCase for enum values", ko: "enum 값에 camelCase 사용" }),
                l.trans({ en: "Use [Type] syntax for arrays", ko: "배열에 [Type] 문법 사용" }),
                l.trans({ en: "Use factory functions for dynamic defaults", ko: "동적 기본값에 팩토리 함수 사용" }),
                l.trans({ en: "Use .optional() for nullable fields", ko: "nullable 필드에 .optional() 사용" }),
                l.trans({ en: "Add 'as const' for large enum value arrays", ko: "큰 enum 값 배열에 'as const' 추가" }),
              ].map((item, index) => (
                <li key={index} className="flex items-start">
                  <input type="checkbox" className="checkbox checkbox-primary mt-1 mr-2" readOnly />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-blue-100 to-purple-100 p-6">
            <div className="mb-3 font-bold text-blue-800 text-lg">
              {l.trans({ en: "💡 Pro Tips:", ko: "💡 프로 팁:" })}
            </div>
            <ul className="space-y-2 text-blue-700 text-sm">
              <li>
                •{" "}
                {l.trans({
                  en: "Keep scalars focused - if it grows too large, split it into multiple scalars",
                  ko: "스칼라를 집중적으로 유지하세요 - 너무 커지면 여러 스칼라로 분리",
                })}
              </li>
              <li>
                •{" "}
                {l.trans({
                  en: "Scalars are value objects - avoid adding ID or timestamp fields (use Models for that)",
                  ko: "스칼라는 값 객체입니다 - ID나 타임스탬프 필드 추가를 피하세요 (Model을 사용)",
                })}
              </li>
              <li>
                •{" "}
                {l.trans({
                  en: "Define enums before the scalar class that uses them",
                  ko: "enum을 사용하는 스칼라 클래스 전에 enum을 정의하세요",
                })}
              </li>
              <li>
                •{" "}
                {l.trans({
                  en: "Don't forget to create dictionary.ts for i18n support",
                  ko: "i18n 지원을 위한 dictionary.ts 생성을 잊지 마세요",
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
