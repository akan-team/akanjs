import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem, type OptionItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const fieldOptions: OptionItem[] = [
    {
      key: "default",
      type: "any | (() => any)",
      desc: l.trans({
        en: "Default value when no value is provided. Can be a static value or a function for dynamic defaults.",
        ko: "값이 제공되지 않을 때의 기본값. 정적 값 또는 동적 기본값을 위한 함수일 수 있습니다.",
      }),
      example: 'field(String, { default: "untitled" }) or field(Date, { default: () => dayjs() })',
    },
    {
      key: "nullable",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "If true, the field can be null or omitted. Equivalent to using .optional() chain method.",
        ko: "true면 필드가 null이거나 생략될 수 있습니다. .optional() 체인 메서드와 동일합니다.",
      }),
      example: "field(String, { nullable: true })",
    },
    {
      key: "ref",
      type: "string",
      desc: l.trans({
        en: "Reference collection name for ID fields. Used for MongoDB population.",
        ko: "ID 필드의 참조 컬렉션 이름. MongoDB population에 사용됩니다.",
      }),
      example: 'field(ID, { ref: "user" })',
    },
    {
      key: "refPath",
      type: "string",
      desc: l.trans({
        en: "Dynamic reference path - uses another field's value to determine the referenced collection.",
        ko: "동적 참조 경로 - 다른 필드의 값을 사용하여 참조 컬렉션을 결정합니다.",
      }),
      example: 'field(ID, { refPath: "targetType" }) // where targetType is "user" or "project"',
    },
    {
      key: "refType",
      type: '"child" | "parent" | "relation"',
      desc: l.trans({
        en: "Type of reference relationship. Affects how population and cascading operations work.",
        ko: "참조 관계의 타입. population과 cascade 작업 방식에 영향을 줍니다.",
      }),
      example: 'field(ID, { ref: "project", refType: "parent" })',
    },
    {
      key: "type",
      type: '"email" | "password" | "url"',
      desc: l.trans({
        en: "Preset type that applies default validation and example values for common patterns.",
        ko: "일반적인 패턴에 대해 기본 유효성 검사와 예시 값을 적용하는 프리셋 타입.",
      }),
      example: 'field(String, { type: "email" })',
    },
    {
      key: "fieldType",
      type: '"property" | "hidden" | "resolve"',
      default: '"property"',
      desc: l.trans({
        en: "property: normal field, hidden: backend-only (not sent to frontend), resolve: computed field (not stored in DB).",
        ko: "property: 일반 필드, hidden: 백엔드 전용(프론트에 전송 안됨), resolve: 계산 필드(DB에 저장 안됨).",
      }),
      example: 'field(String, { fieldType: "hidden" }) // for sensitive data like OTP codes',
    },
    {
      key: "immutable",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "If true, field cannot be modified after document creation. Only set during create.",
        ko: "true면 문서 생성 후 필드를 수정할 수 없습니다. 생성 시에만 설정됩니다.",
      }),
      example: "field(ID, { ref: 'user', immutable: true }) // creator field",
    },
    {
      key: "min",
      type: "number",
      desc: l.trans({
        en: "Minimum value constraint for Int or Float fields. Validation runs on save.",
        ko: "Int 또는 Float 필드의 최소값 제약. 저장 시 유효성 검사가 실행됩니다.",
      }),
      example: "field(Int, { min: 0 })",
    },
    {
      key: "max",
      type: "number",
      desc: l.trans({
        en: "Maximum value constraint for Int or Float fields. Validation runs on save.",
        ko: "Int 또는 Float 필드의 최대값 제약. 저장 시 유효성 검사가 실행됩니다.",
      }),
      example: "field(Float, { min: 0, max: 1 })",
    },
    {
      key: "minlength",
      type: "number",
      desc: l.trans({
        en: "Minimum string length constraint for String fields.",
        ko: "String 필드의 최소 문자열 길이 제약.",
      }),
      example: "field(String, { minlength: 2 })",
    },
    {
      key: "maxlength",
      type: "number",
      desc: l.trans({
        en: "Maximum string length constraint for String fields.",
        ko: "String 필드의 최대 문자열 길이 제약.",
      }),
      example: "field(String, { maxlength: 100 })",
    },
    {
      key: "enum",
      type: "EnumClass",
      desc: l.trans({
        en: "Restrict field values to enum values. Typically used with enumOf() defined classes.",
        ko: "필드 값을 enum 값으로 제한합니다. 일반적으로 enumOf()로 정의된 클래스와 함께 사용됩니다.",
      }),
      example: "field(String, { enum: ProductStatus })",
    },
    {
      key: "select",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "If false, field is excluded from default queries. Use for sensitive or large fields.",
        ko: "false면 기본 쿼리에서 필드가 제외됩니다. 민감하거나 큰 필드에 사용합니다.",
      }),
      example: "field(String, { select: false }) // requires explicit select to retrieve",
    },
    {
      key: "accumulate",
      type: "object",
      desc: l.trans({
        en: "MongoDB aggregation expression for Insight fields. Calculates statistics across matched documents.",
        ko: "Insight 필드용 MongoDB 집계 표현식. 일치하는 문서들의 통계를 계산합니다.",
      }),
      example: "field(Int, { default: 0, accumulate: { $sum: 1 } })",
    },
    {
      key: "example",
      type: "any",
      desc: l.trans({
        en: "Example value for API documentation generation (Swagger/OpenAPI).",
        ko: "API 문서 생성(Swagger/OpenAPI)을 위한 예시 값.",
      }),
      example: 'field(String, { example: "contact@example.com" })',
    },
    {
      key: "of",
      type: "Type",
      desc: l.trans({
        en: "Value type for Map fields. The key is always string, value type is specified by 'of'.",
        ko: "Map 필드의 값 타입. 키는 항상 string이고, 값 타입은 'of'로 지정합니다.",
      }),
      example: "field(Map, { of: Date }) // Map<string, Dayjs>",
    },
    {
      key: "validate",
      type: "(value, model) => boolean",
      desc: l.trans({
        en: "Custom validation function. Receives the field value and full model, returns boolean.",
        ko: "커스텀 유효성 검사 함수. 필드 값과 전체 모델을 받아 boolean을 반환합니다.",
      }),
      example: "field(String, { validate: isPhoneNumber })",
    },
    {
      key: "text",
      type: '"search" | "filter"',
      desc: l.trans({
        en: "Enable text indexing for full-text search (search) or filtering (filter) capabilities.",
        ko: "전체 텍스트 검색(search) 또는 필터링(filter) 기능을 위한 텍스트 인덱싱을 활성화합니다.",
      }),
      example: 'field(String, { text: "search" })',
    },
    {
      key: "meta",
      type: "object",
      desc: l.trans({
        en: "Custom metadata object for additional field information used by UI components or plugins.",
        ko: "UI 컴포넌트나 플러그인에서 사용하는 추가 필드 정보를 위한 커스텀 메타데이터 객체.",
      }),
      example: 'field(String, { meta: { placeholder: "Enter name...", icon: "user" } })',
    },
  ];

  const enumPoints: IntroItem[] = [
    {
      name: "as const",
      desc: l.trans({
        en: "Required for TypeScript to infer literal types instead of string[]",
        ko: "TypeScript가 string[] 대신 리터럴 타입을 추론하는 데 필수",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "First argument", ko: "첫 번째 인수" }),
      desc: l.trans({
        en: "The enum name used in dictionary translations",
        ko: "딕셔너리 번역에 사용되는 enum 이름",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Generated type", ko: "생성되는 타입" }),
      desc: l.trans({
        en: 'Access values via ProductStatus["value"] type (e.g., "active" | "soldOut" | ...)',
        ko: 'ProductStatus["value"] 타입으로 값에 접근 (예: "active" | "soldOut" | ...)',
      }),
      example: null,
    },
  ];

  const viaPatternPoints: IntroItem[] = [
    {
      name: "via((field) => ({...}))",
      desc: l.trans({
        en: "Creates a new class with the specified fields. The field() function takes a type and optional options.",
        ko: "지정된 필드로 새 클래스를 생성합니다. field() 함수는 타입과 선택적 옵션을 받습니다.",
      }),
      example: null,
    },
    {
      name: "field(Type, options?)",
      desc: l.trans({
        en: "Type can be: String, Int, Float, Boolean, Date, JSON, ID, [Array], custom classes, or enums.",
        ko: "Type은 String, Int, Float, Boolean, Date, JSON, ID, [배열], 커스텀 클래스, enum이 가능합니다.",
      }),
      example: null,
    },
    {
      name: ".optional()",
      desc: l.trans({
        en: "Chain .optional() to make a field nullable. The field can then be omitted or set to null.",
        ko: ".optional()을 체이닝하여 필드를 nullable로 만듭니다. 필드를 생략하거나 null로 설정할 수 있습니다.",
      }),
      example: null,
    },
  ];

  const objectFields: IntroItem[] = [
    {
      name: "status",
      desc: l.trans({
        en: "Document lifecycle state, controlled by service methods",
        ko: "문서 생명주기 상태, 서비스 메서드로 제어",
      }),
      example: null,
    },
    {
      name: "stock",
      desc: l.trans({
        en: "Inventory count, default to 0, modified by sell operations",
        ko: "재고 수량, 기본값 0, 판매 작업으로 수정",
      }),
      example: null,
    },
    {
      name: "soldCount",
      desc: l.trans({
        en: "Accumulated sales count for analytics",
        ko: "분석용 누적 판매 수량",
      }),
      example: null,
    },
  ];

  const lightClassPoints: IntroItem[] = [
    {
      name: l.trans({ en: "Performance Benefits", ko: "성능 이점" }),
      desc: l.trans({
        en: "When fetching 100 products for a list, Light ensures only essential fields are transferred, reducing payload size and database load.",
        ko: "목록을 위해 100개의 상품을 가져올 때 Light는 필수 필드만 전송되도록 하여 페이로드 크기와 데이터베이스 부하를 줄입니다.",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Field Selection", ko: "필드 선택" }),
      desc: l.trans({
        en: "Choose fields that appear in list UIs: identifiers, status, key metadata. Exclude: content, files, detailed nested objects.",
        ko: "목록 UI에 나타나는 필드 선택: 식별자, 상태, 주요 메타데이터. 제외: 콘텐츠, 파일, 상세 중첩 객체.",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Resolve Function", ko: "Resolve 함수" }),
      desc: l.trans({
        en: "The (resolve) => ({}) function can add computed/virtual fields that are calculated server-side but not stored in DB.",
        ko: "(resolve) => ({}) 함수는 DB에 저장되지 않지만 서버 측에서 계산되는 computed/virtual 필드를 추가할 수 있습니다.",
      }),
      example: null,
    },
  ];

  const fullModelPoints: IntroItem[] = [
    {
      name: l.trans({ en: "Static Methods", ko: "정적 메서드" }),
      desc: l.trans({
        en: "Static methods operate on arrays of items. Use for filtering, grouping, or computing derived data from lists.",
        ko: "정적 메서드는 항목 배열에서 작동합니다. 목록에서 필터링, 그룹화, 파생 데이터 계산에 사용합니다.",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Usage Example", ko: "사용 예제" }),
      desc: "const activeProducts = cnst.Product.getActiveList(productList);",
      example: null,
    },
  ];

  const insightAccumulateOptions: IntroItem[] = [
    {
      name: "{ $sum: 1 }",
      desc: l.trans({
        en: "Simple count - adds 1 for each matching document",
        ko: "단순 카운트 - 일치하는 각 문서에 1을 추가",
      }),
      example: null,
    },
    {
      name: '{ $sum: "$fieldName" }',
      desc: l.trans({
        en: "Sum of field values across all matching documents",
        ko: "일치하는 모든 문서의 필드 값 합계",
      }),
      example: null,
    },
    {
      name: "{ $cond: [...] }",
      desc: l.trans({
        en: "Conditional aggregation - count only documents matching a condition",
        ko: "조건부 집계 - 조건에 일치하는 문서만 카운트",
      }),
      example: null,
    },
  ];

  const scalarPoints: IntroItem[] = [
    {
      name: l.trans({ en: "When to use Scalars", ko: "스칼라를 사용하는 경우" }),
      desc: l.trans({
        en: "Data that belongs to a single parent (1:N embedded). No need for separate queries or references. Data always accessed with parent document.",
        ko: "단일 부모에 속하는 데이터 (1:N 임베딩). 별도의 쿼리나 참조가 필요 없음. 항상 부모 문서와 함께 접근되는 데이터.",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Scalar Location", ko: "스칼라 위치" }),
      desc: l.trans({
        en: "Scalars are typically placed in __scalar/ directory to indicate they're embedded types, not standalone collections.",
        ko: "스칼라는 일반적으로 __scalar/ 디렉토리에 배치하여 독립적인 컬렉션이 아닌 임베딩 타입임을 나타냅니다.",
      }),
      example: null,
    },
  ];

  const relationPatterns: IntroItem[] = [
    {
      name: l.trans({ en: "Scalar Embedding", ko: "스칼라 임베딩" }),
      desc: l.trans({
        en: "Embed scalar objects directly in the document. Best for 1:N relationships where child data is always accessed with parent.",
        ko: "스칼라 객체를 문서에 직접 임베딩합니다. 자식 데이터가 항상 부모와 함께 접근되는 1:N 관계에 적합합니다.",
      }),
      example: `// Scalar embedded as array
export class ProductObject extends via(ProductInput, (field) => ({
  options: field([ProductOption]),  // Array of ProductOption scalar
})) {}`,
    },
    {
      name: l.trans({ en: "Reference by ID", ko: "ID 참조" }),
      desc: l.trans({
        en: "Store only the ObjectID of related document. Best when you need to query the referenced collection separately.",
        ko: "관련 문서의 ObjectID만 저장합니다. 참조된 컬렉션을 별도로 쿼리해야 할 때 적합합니다.",
      }),
      example: `// Reference by ID (for population)
export class MissionInput extends via((field) => ({
  drone: field(ID, { ref: "drone" }),  // ObjectID reference
})) {}`,
    },
    {
      name: l.trans({ en: "Light Model Reference", ko: "Light 모델 참조" }),
      desc: l.trans({
        en: "Embed a Light version of another model. Best when you need key fields without full population.",
        ko: "다른 모델의 Light 버전을 임베딩합니다. 전체 population 없이 주요 필드가 필요할 때 적합합니다.",
      }),
      example: `// Light model reference (denormalized)
export class ProductInput extends via((field) => ({
  category: field(LightCategory),  // Embedded Light model
  seller: field(LightSeller),
})) {}`,
    },
  ];

  const fieldTypeOptions: IntroItem[] = [
    {
      name: "property",
      desc: l.trans({
        en: "Normal field - stored in DB, sent to frontend",
        ko: "일반 필드 - DB에 저장, 프론트엔드로 전송",
      }),
      example: null,
    },
    {
      name: "hidden",
      desc: l.trans({
        en: "Backend only - stored in DB but never sent to frontend (e.g., OTP codes)",
        ko: "백엔드 전용 - DB에 저장되지만 프론트엔드로 전송 안됨 (예: OTP 코드)",
      }),
      example: null,
    },
    {
      name: "resolve",
      desc: l.trans({
        en: "Virtual field - computed on query, not stored in DB (e.g., view count from other collection)",
        ko: "가상 필드 - 쿼리 시 계산, DB에 저장 안됨 (예: 다른 컬렉션의 조회수)",
      }),
      example: null,
    },
  ];

  const refTypeOptions: IntroItem[] = [
    {
      name: "parent",
      desc: l.trans({
        en: "This document belongs to the referenced document",
        ko: "이 문서가 참조된 문서에 속함",
      }),
      example: null,
    },
    {
      name: "child",
      desc: l.trans({
        en: "Referenced document belongs to this document",
        ko: "참조된 문서가 이 문서에 속함",
      }),
      example: null,
    },
    {
      name: "relation",
      desc: l.trans({ en: "Many-to-many relationship without ownership", ko: "소유권 없는 다대다 관계" }),
      example: null,
    },
  ];

  const bestPracticePoints: IntroItem[] = [
    {
      name: l.trans({ en: "Class Ordering", ko: "클래스 순서" }),
      desc: l.trans({
        en: "Define in order: Enums → Input → Object → Light → Full → Insight. This prevents forward reference issues.",
        ko: "순서대로 정의: Enum → Input → Object → Light → Full → Insight. 이렇게 하면 전방 참조 문제를 방지합니다.",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Light Field Selection", ko: "Light 필드 선택" }),
      desc: l.trans({
        en: "Include: id, status, key identifiers, timestamps. Exclude: large content fields, files, detailed nested objects.",
        ko: "포함: id, 상태, 주요 식별자, 타임스탬프. 제외: 큰 콘텐츠 필드, 파일, 상세 중첩 객체.",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Default Values", ko: "기본값" }),
      desc: l.trans({
        en: "Always provide defaults for Object fields. Use functions for dynamic values like dates: () => dayjs()",
        ko: "Object 필드에 항상 기본값을 제공합니다. 날짜 같은 동적 값에는 함수 사용: () => dayjs()",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Static Methods", ko: "정적 메서드" }),
      desc: l.trans({
        en: "Add static utility methods to Full class for filtering/grouping logic. Keep them pure (no side effects).",
        ko: "Full 클래스에 필터링/그룹화 로직을 위한 정적 유틸리티 메서드를 추가합니다. 순수 함수로 유지하세요(부작용 없음).",
      }),
      example: null,
    },
    {
      name: l.trans({ en: "Import Paths", ko: "Import 경로" }),
      desc: l.trans({
        en: "Always use direct file imports for other constants to avoid circular references. Never import from barrel files.",
        ko: "다른 constant를 import할 때 순환 참조를 피하기 위해 항상 직접 파일 import를 사용합니다. barrel 파일에서 절대 import하지 않습니다.",
      }),
      example: null,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="constant-overview" title={"model.constant.ts"}>
        <Docs.Title>{"model.constant.ts"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The constant file defines the data shape (schema) of your domain. It ensures consistency between database storage, API communication, and frontend usage by creating a single source of truth.",
              ko: "constant 파일은 도메인의 데이터 형태(스키마)를 정의합니다. 데이터베이스 저장, API 통신, 프론트엔드 사용 간의 단일 진실 소스를 만들어 일관성을 보장합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">📐</span>
                <strong className="text-blue-800">{l.trans({ en: "Type Safety", ko: "타입 안전성" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Schema definitions are shared across backend and frontend, ensuring type consistency throughout your application.",
                  ko: "스키마 정의가 백엔드와 프론트엔드에서 공유되어 애플리케이션 전체의 타입 일관성을 보장합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🔄</span>
                <strong className="text-green-800">{l.trans({ en: "Auto Generation", ko: "자동 생성" })}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "From your constant definitions, the framework auto-generates MongoDB schemas, GraphQL types, REST APIs, and client-side types.",
                  ko: "constant 정의에서 프레임워크가 MongoDB 스키마, GraphQL 타입, REST API, 클라이언트 타입을 자동 생성합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="class-hierarchy" title={l.trans({ en: "Class Hierarchy Pattern", ko: "클래스 계층구조 패턴" })}>
        <Docs.Title>{l.trans({ en: "Class Hierarchy Pattern", ko: "클래스 계층구조 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js uses a hierarchical class pattern to organize schema definitions. Each layer has a specific purpose and builds upon the previous one.",
              ko: "Akan.js는 스키마 정의를 구성하기 위해 계층적 클래스 패턴을 사용합니다. 각 계층은 특정 목적을 가지며 이전 계층 위에 구축됩니다.",
            })}
          </div>
          <div className="my-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 font-bold text-white">
                1
              </div>
              <div className="flex-1 rounded-lg bg-blue-50 p-4">
                <strong className="text-blue-800">Input</strong>
                <div className="text-blue-700 text-sm">
                  {l.trans({
                    en: "Fields required to create a new document (user-provided data)",
                    ko: "새 문서를 생성하는 데 필요한 필드 (사용자 제공 데이터)",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 font-bold text-white">
                2
              </div>
              <div className="flex-1 rounded-lg bg-green-50 p-4">
                <strong className="text-green-800">Object</strong>
                <div className="text-green-700 text-sm">
                  {l.trans({
                    en: "Input + system-generated fields (status, timestamps, computed values)",
                    ko: "Input + 시스템 생성 필드 (상태, 타임스탬프, 계산된 값)",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500 font-bold text-white">
                3
              </div>
              <div className="flex-1 rounded-lg bg-purple-50 p-4">
                <strong className="text-purple-800">Light</strong>
                <div className="text-purple-700 text-sm">
                  {l.trans({
                    en: "Lightweight version with selected fields for list queries (prevents overfetching)",
                    ko: "목록 쿼리를 위해 선택된 필드만 포함하는 경량 버전 (과도한 데이터 fetch 방지)",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
                4
              </div>
              <div className="flex-1 rounded-lg bg-orange-50 p-4">
                <strong className="text-orange-800">Full (Model)</strong>
                <div className="text-orange-700 text-sm">
                  {l.trans({
                    en: "Complete model with all fields and static/instance utility methods",
                    ko: "모든 필드와 정적/인스턴스 유틸리티 메서드가 포함된 완전한 모델",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-500 font-bold text-white">
                5
              </div>
              <div className="flex-1 rounded-lg bg-pink-50 p-4">
                <strong className="text-pink-800">Insight</strong>
                <div className="text-pink-700 text-sm">
                  {l.trans({
                    en: "Statistical aggregation fields for analytics (count, sum, avg)",
                    ko: "분석을 위한 통계 집계 필드 (count, sum, avg)",
                  })}
                </div>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="enum-definition"
        title={l.trans({ en: "Defining Enums with enumOf()", ko: "enumOf()로 Enum 정의하기" })}
      >
        <Docs.Title>{l.trans({ en: "Defining Enums with enumOf()", ko: "enumOf()로 Enum 정의하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Before defining your model classes, you typically need to define enums for status fields and other categorical values. The enumOf() function creates type-safe enum classes.",
              ko: "모델 클래스를 정의하기 전에 일반적으로 상태 필드와 기타 범주형 값에 대한 enum을 정의해야 합니다. enumOf() 함수는 타입 안전한 enum 클래스를 생성합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.constant.ts"
            code={`import { enumOf } from "@akanjs/base";

// Define status enum - use 'as const' for literal types
export class ProductStatus extends enumOf("productStatus", [
  "active",
  "soldOut",
  "archived",
] as const) {}`}
          />
          <div>
            {l.trans({
              en: "Key points about enumOf():",
              ko: "enumOf()의 핵심 포인트:",
            })}
          </div>
          <Docs.IntroTable type="field" items={enumPoints} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="input-class"
        title={l.trans({ en: "Input Class - Creation Fields", ko: "Input 클래스 - 생성 필드" })}
      >
        <Docs.Title>{l.trans({ en: "Input Class - Creation Fields", ko: "Input 클래스 - 생성 필드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Input class defines fields required when creating a new document. These are the values a user or system must provide.",
              ko: "Input 클래스는 새 문서를 생성할 때 필요한 필드를 정의합니다. 이것은 사용자나 시스템이 제공해야 하는 값입니다.",
            })}
          </div>
          <Code.Snippet
            title="product.constant.ts"
            code={`import { Int } from "@akanjs/base";
import { via } from "@akanjs/constant";
import { cnst as shared } from "@shared";

import { LightCategory } from "../category/category.constant";

export class ProductInput extends via((field) => ({
  name: field(String),                     // Required string
  price: field(Int),                       // Required integer
  description: field(String, { default: "" }), // String with default
  category: field(LightCategory),          // Reference to category
  images: field([shared.File]),            // Array of File scalars
})) {}`}
          />
          <div>
            {l.trans({
              en: "Understanding the via() pattern:",
              ko: "via() 패턴 이해하기:",
            })}
          </div>
          <Docs.IntroTable type="method" items={viaPatternPoints} />
          <div className="rounded-lg bg-amber-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-amber-600">💡</span>
              <strong className="text-amber-800">{l.trans({ en: "Usage in Code", ko: "코드에서의 사용" })}</strong>
            </div>
            <div className="text-amber-700 text-sm">
              {l.trans({
                en: "Input fields are used in: fetch.createProduct(input), st.do.setNameOnProduct(value), productForm state",
                ko: "Input 필드는 다음에서 사용됩니다: fetch.createProduct(input), st.do.setNameOnProduct(value), productForm 상태",
              })}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="object-class" title={l.trans({ en: "Object Class", ko: "Object 클래스" })}>
        <Docs.Title>{l.trans({ en: "Object Class", ko: "Object 클래스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Object class extends Input and adds fields that are automatically set by the system. These fields are typically modified through service methods, not through direct user input.",
              ko: "Object 클래스는 Input을 확장하고 시스템에서 자동으로 설정하는 필드를 추가합니다. 이 필드들은 일반적으로 직접적인 사용자 입력이 아닌 서비스 메서드를 통해 수정됩니다.",
            })}
          </div>
          <Code.Snippet
            title="product.constant.ts"
            code={`import { Int } from "@akanjs/base";

// Object extends Input and adds system fields
export class ProductObject extends via(ProductInput, (field) => ({
  status: field(ProductStatus, { default: "active" }),
  stock: field(Int, { default: 0 }),       // Stock quantity
  soldCount: field(Int, { default: 0 }),   // Total sold count
})) {}`}
          />
          <div>
            {l.trans({
              en: "Common Object fields:",
              ko: "일반적인 Object 필드들:",
            })}
          </div>
          <Docs.IntroTable type="field" items={objectFields} />
          <Docs.Alert>
            <div>
              {l.trans({
                en: "Note: The via(BaseClass, (field) => ({...})) syntax means: 'extend BaseClass and add these new fields'. All fields from ProductInput are inherited.",
                ko: "참고: via(BaseClass, (field) => ({...})) 구문은 'BaseClass를 확장하고 이 새 필드들을 추가'를 의미합니다. ProductInput의 모든 필드가 상속됩니다.",
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="light-class"
        title={l.trans({ en: "Light Class - Optimized for Lists", ko: "Light 클래스 - 목록 최적화" })}
      >
        <Docs.Title>
          {l.trans({ en: "Light Class - Optimized for Lists", ko: "Light 클래스 - 목록 최적화" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Light class picks only necessary fields from Object for list views. This prevents overfetching when displaying multiple items in tables or cards.",
              ko: "Light 클래스는 목록 뷰를 위해 Object에서 필요한 필드만 선택합니다. 테이블이나 카드에 여러 항목을 표시할 때 과도한 데이터 fetch를 방지합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.constant.ts"
            code={`// Light picks specific fields from Object
export class LightProduct extends via(
  ProductObject,
  // Array of field names to include
  ["name", "price", "status", "category", "stock"] as const,
  // resolve function for computed fields (usually empty)
  (resolve) => ({})
) {}`}
          />
          <Docs.IntroTable type="field" items={lightClassPoints} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="full-model"
        title={l.trans({ en: "Full Model - Complete with Methods", ko: "Full 모델 - 메서드 포함 완전체" })}
      >
        <Docs.Title>
          {l.trans({ en: "Full Model - Complete with Methods", ko: "Full 모델 - 메서드 포함 완전체" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Full model (often named after the domain like 'Product') combines Object and Light, and adds static utility methods for data manipulation.",
              ko: "Full 모델(보통 'Product'처럼 도메인 이름으로 지정)은 Object와 Light를 결합하고 데이터 조작을 위한 정적 유틸리티 메서드를 추가합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.constant.ts"
            code={`// Full model combines Object and Light, adds utility methods
export class Product extends via(ProductObject, LightProduct, (resolve) => ({})) {
  // Static methods for filtering/grouping lists
  static getActiveList(list: LightProduct[]) {
    return list.filter((p) => p.status === "active");
  }
}`}
          />
          <Docs.IntroTable type="method" items={fullModelPoints} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="insight-class" title={l.trans({ en: "Insight Class", ko: "Insight 클래스" })}>
        <Docs.Title>{l.trans({ en: "Insight Class", ko: "Insight 클래스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Insight class defines aggregation fields for analytics. When querying, the framework calculates these statistics using MongoDB aggregation pipeline.",
              ko: "Insight 클래스는 분석을 위한 집계 필드를 정의합니다. 쿼리할 때 프레임워크는 MongoDB 집계 파이프라인을 사용하여 이러한 통계를 계산합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.constant.ts"
            code={`import { Int } from "@akanjs/base";

export class ProductInsight extends via(Product, (field) => ({
  // Sum of stock using aggregation
  totalStock: field(Int, { 
    default: 0, 
    accumulate: { $sum: "$stock" } 
  }),
  totalSold: field(Int, { 
    default: 0, 
    accumulate: { $sum: "$soldCount" } 
  }),
})) {}`}
          />
          <div>
            {l.trans({
              en: "Understanding the accumulate option:",
              ko: "accumulate 옵션 이해하기:",
            })}
          </div>
          <Docs.IntroTable type="field" items={insightAccumulateOptions} />
          <div>
            {l.trans({
              en: "Usage in code:",
              ko: "코드에서의 사용:",
            })}
          </div>
          <Code.Snippet
            title="Using Insight"
            code={`// In store.ts
const insight = await fetch.productInsightInCategory(categoryId);
console.log(insight.count);       // Total products
console.log(insight.totalStock);  // Sum of all stock

// In component
const productInsight = st.use.productInsight();
<span>Total: {productInsight.count}</span>`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="scalar-embedding"
        title={l.trans({ en: "Scalar - Embedded Objects", ko: "스칼라 - 내장 객체" })}
      >
        <Docs.Title>{l.trans({ en: "Scalar - Embedded Objects", ko: "스칼라 - 내장 객체" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Scalars are embedded objects that don't have their own collection. They're stored within the parent document and defined using via() without the full class hierarchy.",
              ko: "스칼라는 자체 컬렉션이 없는 내장 객체입니다. 부모 문서 내에 저장되며 전체 클래스 계층구조 없이 via()를 사용하여 정의됩니다.",
            })}
          </div>
          <Code.Snippet
            title="milestone.constant.ts"
            code={`import { dayjs } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Simple scalar - embedded in parent documents
export class Milestone extends via((field) => ({
  goal: field(String),
  output: field(String),
  at: field(Date, { default: dayjs() }),
})) {}`}
          />
          <div>
            {l.trans({
              en: "Using scalars in parent models:",
              ko: "부모 모델에서 스칼라 사용하기:",
            })}
          </div>
          <Code.Snippet
            title="bizContract.constant.ts"
            code={`import { Milestone } from "../__scalar/milestone/milestone.constant";
import { Cashflow, CashUnit } from "../__scalar/cashflow/cashflow.constant";

export class BizContractInput extends via((field) => ({
  title: field(String),
  // Array of scalar objects
  milestones: field([Milestone]),
  cashflows: field([Cashflow]),
  cashUnit: field(CashUnit, { default: "krw" }),
})) {}`}
          />
          <Docs.IntroTable type="field" items={scalarPoints} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="relation-patterns" title={l.trans({ en: "Relation Patterns", ko: "관계 패턴" })}>
        <Docs.Title>{l.trans({ en: "Relation Patterns", ko: "관계 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "There are three main ways to establish relationships between models in Akan.js, following MongoDB schema design principles.",
              ko: "Akan.js에서 모델 간 관계를 설정하는 세 가지 주요 방법이 있으며, MongoDB 스키마 디자인 원칙을 따릅니다.",
            })}
          </div>
          <Docs.IntroTable type="method" items={relationPatterns} />
          <Docs.Alert>
            <div>
              {l.trans({
                en: "⚠️ Import Warning: Direct imports between constant files can cause circular references. Always import from the specific file path, not from barrel files (index.ts).",
                ko: "⚠️ Import 경고: constant 파일 간 직접 import는 순환 참조를 일으킬 수 있습니다. barrel 파일(index.ts)이 아닌 특정 파일 경로에서 항상 import하세요.",
              })}
            </div>
            <Code.Snippet
              code={`// ❌ Wrong - may cause circular reference
import { LightUser } from "../cnst";

// ✅ Correct - direct file import
import { LightUser } from "../user/user.constant";`}
            />
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="field-options" title={l.trans({ en: "Field Options Reference", ko: "필드 옵션 참조" })}>
        <Docs.Title>{l.trans({ en: "Field Options Reference", ko: "필드 옵션 참조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The field() function accepts various options to configure validation, defaults, database behavior, and more. Here's the complete reference:",
              ko: "field() 함수는 유효성 검사, 기본값, 데이터베이스 동작 등을 구성하기 위한 다양한 옵션을 받습니다. 전체 참조는 다음과 같습니다:",
            })}
          </div>
          <div className="my-4">
            <Docs.OptionTable items={fieldOptions} />
          </div>
          <div className="my-4 space-y-3">
            <Docs.SubTitle>fieldType Options</Docs.SubTitle>
            <Docs.IntroTable type="field" items={fieldTypeOptions} />
            <div className="mb-4" />
            <Docs.SubTitle>refType Options</Docs.SubTitle>
            <Docs.IntroTable type="field" items={refTypeOptions} />
          </div>
          <div>
            {l.trans({
              en: "Common field patterns:",
              ko: "일반적인 필드 패턴:",
            })}
          </div>
          <Code.Snippet
            title="Common Field Patterns"
            code={`export class ExampleInput extends via((field) => ({
  name: field(String, { minlength: 2, maxlength: 100 }),
  count: field(Int, { min: 0, max: 100, default: 0 }),
  createdAt: field(Date, { default: () => dayjs() }),
  tags: field([String]),
  status: field(MyStatus, { default: "active" }),
  description: field(String).optional(),
  email: field(String, { type: "email" }),
  owner: field(ID, { ref: "user", immutable: true }),
  secretCode: field(String, { fieldType: "hidden" }),
})) {}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Constant Best Practices", ko: "Constant 모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Constant Best Practices", ko: "Constant 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <Docs.IntroTable type="field" items={bestPracticePoints} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
