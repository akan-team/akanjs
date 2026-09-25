import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Scalar Types", ko: "스칼라 타입" })}>
        <Docs.Title>{l.trans({ en: "Scalar Types", ko: "스칼라 타입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Scalar types are primitive data types used in GraphQL and MongoDB schemas. Akan.js provides a set of predefined scalar types that map to GraphQL scalars and are used throughout the framework for type-safe model definitions.",
              ko: "스칼라 타입은 GraphQL과 MongoDB 스키마에서 사용되는 기본 데이터 타입입니다. Akan.js는 GraphQL 스칼라에 매핑되는 미리 정의된 스칼라 타입 세트를 제공하며, 타입 안전한 모델 정의를 위해 프레임워크 전반에서 사용됩니다.",
            })}
          </div>
          <Code.Snippet
            title="Supported Scalar Types"
            code={`// Built-in JavaScript types
String    // Text data
Boolean   // true/false
Date      // Date and time (uses dayjs)

// Custom Akan.js scalar classes
ID        // MongoDB ObjectId (24-char hex string)
Int       // Integer numbers
Float     // Floating-point numbers
Upload    // File upload (GraphQL Upload)
JSON      // Arbitrary JSON data
Map       // Key-value mapping`}
          />
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">📦</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Import from @akanjs/base", ko: "@akanjs/base에서 import" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                <code>{'import { ID, Int, Float, Upload, JSON } from "@akanjs/base";'}</code>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="scalar-table"
        title={l.trans({ en: "Scalar Type Reference Table", ko: "스칼라 타입 레퍼런스 테이블" })}
      >
        <Docs.Title>{l.trans({ en: "Scalar Type Reference Table", ko: "스칼라 타입 레퍼런스 테이블" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Complete reference of all scalar types with their GraphQL mapping, MongoDB type, default values, and example usage.",
              ko: "모든 스칼라 타입의 GraphQL 매핑, MongoDB 타입, 기본값, 사용 예시를 포함한 전체 레퍼런스입니다.",
            })}
          </div>
          <div className="my-6 overflow-x-auto">
            <table className="table-zebra table w-full text-sm">
              <thead>
                <tr className="bg-base-300">
                  <th>{l.trans({ en: "Type", ko: "타입" })}</th>
                  <th>{l.trans({ en: "GraphQL", ko: "GraphQL" })}</th>
                  <th>{l.trans({ en: "MongoDB", ko: "MongoDB" })}</th>
                  <th>{l.trans({ en: "Default", ko: "기본값" })}</th>
                  <th>{l.trans({ en: "Example Value", ko: "예시 값" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code className="text-blue-600">String</code>
                  </td>
                  <td>String</td>
                  <td>String</td>
                  <td>
                    <code>{`""`}</code>
                  </td>
                  <td>
                    <code>{`"Hello World"`}</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="text-blue-600">Boolean</code>
                  </td>
                  <td>Boolean</td>
                  <td>Boolean</td>
                  <td>
                    <code>false</code>
                  </td>
                  <td>
                    <code>true</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="text-blue-600">Date</code>
                  </td>
                  <td>Date (custom)</td>
                  <td>Date</td>
                  <td>
                    <code>dayjs(new Date(-1))</code>
                  </td>
                  <td>
                    <code>{`"2024-01-15T09:30:00Z"`}</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="text-purple-600">ID</code>
                  </td>
                  <td>ID</td>
                  <td>ObjectId</td>
                  <td>
                    <code>null</code>
                  </td>
                  <td>
                    <code>{`"1234567890abcdef12345678"`}</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="text-purple-600">Int</code>
                  </td>
                  <td>Int</td>
                  <td>Number</td>
                  <td>
                    <code>0</code>
                  </td>
                  <td>
                    <code>42</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="text-purple-600">Float</code>
                  </td>
                  <td>Float</td>
                  <td>Number</td>
                  <td>
                    <code>0</code>
                  </td>
                  <td>
                    <code>3.14159</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="text-purple-600">Upload</code>
                  </td>
                  <td>Upload (GraphQL Upload)</td>
                  <td>-</td>
                  <td>-</td>
                  <td>FileUpload stream</td>
                </tr>
                <tr>
                  <td>
                    <code className="text-purple-600">JSON</code>
                  </td>
                  <td>JSON (custom)</td>
                  <td>Mixed</td>
                  <td>
                    <code>{`{}`}</code>
                  </td>
                  <td>
                    <code>{`{ "key": "value" }`}</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="text-purple-600">Map</code>
                  </td>
                  <td>JSON</td>
                  <td>Map</td>
                  <td>
                    <code>{`{}`}</code>
                  </td>
                  <td>
                    <code>{`{ "a": 1, "b": 2 }`}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Docs.Alert>
            <div>
              {l.trans({
                en: "Blue types (String, Boolean, Date) are JavaScript built-ins. Purple types (ID, Int, Float, Upload, JSON) are custom Akan.js classes that need to be imported.",
                ko: "파란색 타입(String, Boolean, Date)은 JavaScript 내장 타입입니다. 보라색 타입(ID, Int, Float, Upload, JSON)은 import가 필요한 Akan.js 커스텀 클래스입니다.",
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="usage-constant" title={l.trans({ en: "constant.ts Scalars", ko: "constant.ts 스칼라" })}>
        <Docs.Title>{l.trans({ en: "constant.ts Scalars", ko: "constant.ts 스칼라" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Scalar types are used in constant.ts files to define model field types. Here are practical examples of how each scalar type is used:",
              ko: "스칼라 타입은 constant.ts 파일에서 모델 필드 타입을 정의하는 데 사용됩니다. 각 스칼라 타입이 사용되는 실제 예시입니다:",
            })}
          </div>

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "String - Text Data", ko: "String - 텍스트 데이터" })}</strong>
          </div>
          <Code.Snippet
            title="String Usage"
            code={`import { via } from "@akanjs/constant";

export class ProfileInput extends via((field) => ({
  // Basic string field
  name: field(String),
  
  // String with validation
  email: field(String, { 
    type: "email", 
    text: "search"  // Enable text search
  }),
  
  // String with length constraints
  bio: field(String, { 
    minlength: 10, 
    maxlength: 500 
  }),
  
  // Password field (hashed on save)
  password: field(String, { 
    type: "password", 
    minlength: 8 
  }),
})) {}`}
          />

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "Boolean - True/False", ko: "Boolean - 참/거짓" })}</strong>
          </div>
          <Code.Snippet
            title="Boolean Usage"
            code={`export class SettingsInput extends via((field) => ({
  // Boolean with default
  isActive: field(Boolean, { default: true }),
  isPublic: field(Boolean, { default: false }),
  
  // Optional boolean
  isVerified: field(Boolean).optional(),
})) {}`}
          />

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "Date - Date and Time", ko: "Date - 날짜와 시간" })}</strong>
          </div>
          <Code.Snippet
            title="Date Usage"
            code={`import { dayjs } from "@akanjs/base";

export class EventInput extends via((field) => ({
  // Date with dynamic default (current time)
  startAt: field(Date, { default: () => dayjs() }),
  
  // Date with specific time
  dueAt: field(Date, { default: () => dayjs().set("hour", 19) }),
  
  // Optional date
  completedAt: field(Date).optional(),
})) {}`}
          />

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "Int & Float - Numbers", ko: "Int & Float - 숫자" })}</strong>
          </div>
          <Code.Snippet
            title="Int & Float Usage"
            code={`import { Int, Float } from "@akanjs/base";

export class ProductInput extends via((field) => ({
  // Integer with default and constraints
  quantity: field(Int, { default: 0, min: 0, max: 9999 }),
  
  // Integer for view count
  viewCount: field(Int, { default: 0 }),
  
  // Float for decimal values
  price: field(Float, { default: 0, min: 0 }),
  
  // Float for percentages
  discountRate: field(Float, { default: 0, min: 0, max: 100 }),
})) {}`}
          />

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "ID - MongoDB ObjectId", ko: "ID - MongoDB ObjectId" })}</strong>
          </div>
          <Code.Snippet
            title="ID Usage"
            code={`import { ID } from "@akanjs/base";

export class BookmarkInput extends via((field) => ({
  // ID for referencing other documents
  targetId: field(ID),
  
  // Optional ID reference
  parentId: field(ID).optional(),
  
  // Array of IDs
  tagIds: field([ID]),
})) {}`}
          />

          <div className="mt-6 mb-4">
            <strong>{l.trans({ en: "JSON - Arbitrary Data", ko: "JSON - 임의 데이터" })}</strong>
          </div>
          <Code.Snippet
            title="JSON Usage"
            code={`import { JSON } from "@akanjs/base";

export class ArticleInput extends via((field) => ({
  // JSON for rich text content (e.g., TipTap editor)
  content: field(JSON, { default: [] }),
  
  // JSON for flexible metadata
  metadata: field(JSON, { default: {} }),
  
  // JSON for configuration objects
  settings: field(JSON, { 
    default: { theme: "light", fontSize: 14 } 
  }),
})) {}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="complete-example" title={l.trans({ en: "Complete Model Example", ko: "전체 모델 예제" })}>
        <Docs.Title>{l.trans({ en: "Complete Model Example", ko: "전체 모델 예제" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Here's a complete example showing various scalar types used together in a model definition:",
              ko: "모델 정의에서 다양한 스칼라 타입이 함께 사용되는 전체 예제입니다:",
            })}
          </div>
          <Code.Snippet
            title="article.constant.ts"
            code={`import { dayjs, Int, Float, JSON, ID } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Input model - fields for creation
export class ArticleInput extends via((field) => ({
  // String fields
  title: field(String, { minlength: 1, maxlength: 200 }),
  slug: field(String, { text: "search" }),
  
  // JSON for rich text content
  content: field(JSON, { default: [] }),
  
  // Boolean flags
  isPublic: field(Boolean, { default: false }),
  isFeatured: field(Boolean, { default: false }),
})) {}

// Object model - additional managed fields
export class ArticleObject extends via(ArticleInput, (field) => ({
  // ID for author reference
  authorId: field(ID),
  
  // Integer counters
  viewCount: field(Int, { default: 0, min: 0 }),
  likeCount: field(Int, { default: 0, min: 0 }),
  commentCount: field(Int, { default: 0, min: 0 }),
  
  // Float for rating
  rating: field(Float, { default: 0, min: 0, max: 5 }),
  
  // Date fields
  publishedAt: field(Date).optional(),
  lastEditedAt: field(Date, { default: () => dayjs() }),
  
  // Array of IDs for tags
  tagIds: field([ID]),
  
  // JSON for SEO metadata
  seoMeta: field(JSON, { 
    default: { 
      description: "", 
      keywords: [] 
    } 
  }),
})) {}

// Light model - essential fields only
export class LightArticle extends via(
  ArticleObject,
  ["title", "slug", "isPublic", "publishedAt", "viewCount"] as const,
  (resolve) => ({})
) {}

// Full model
export class Article extends via(ArticleObject, LightArticle, (resolve) => ({})) {}`}
          />
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">💡</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Scalar Types Used", ko: "사용된 스칼라 타입" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    <strong>String</strong>: title, slug
                  </li>
                  <li>
                    <strong>Boolean</strong>: isPublic, isFeatured
                  </li>
                  <li>
                    <strong>Int</strong>: viewCount, likeCount, commentCount
                  </li>
                  <li>
                    <strong>Float</strong>: rating
                  </li>
                  <li>
                    <strong>Date</strong>: publishedAt, lastEditedAt
                  </li>
                  <li>
                    <strong>ID</strong>: authorId, tagIds
                  </li>
                  <li>
                    <strong>JSON</strong>: content, seoMeta
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Scalar Best Practices", ko: "스칼라 모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Scalar Best Practices", ko: "스칼라 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Use Int for Counts and Quantities", ko: "개수와 수량에는 Int 사용" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Use Int instead of Float for whole numbers like counts, quantities, and IDs. It provides better performance and prevents floating-point issues.",
                  ko: "개수, 수량, ID와 같은 정수에는 Float 대신 Int를 사용하세요. 더 나은 성능을 제공하고 부동소수점 문제를 방지합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Use dayjs() for Date Defaults", ko: "Date 기본값에는 dayjs() 사용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Always use a function for Date defaults: { default: () => dayjs() }. Static defaults would capture the build time, not creation time.",
                  ko: "Date 기본값에는 항상 함수를 사용하세요: { default: () => dayjs() }. 정적 기본값은 생성 시간이 아닌 빌드 시간을 캡처합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">
                  {l.trans({ en: "Use ID for Document References", ko: "문서 참조에는 ID 사용" })}
                </strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Use ID type when you need to store a reference to another MongoDB document. It automatically converts to ObjectId in the database.",
                  ko: "다른 MongoDB 문서에 대한 참조를 저장해야 할 때 ID 타입을 사용하세요. 데이터베이스에서 자동으로 ObjectId로 변환됩니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">4️⃣</span>
                <strong className="text-yellow-800">
                  {l.trans({ en: "Use JSON for Flexible Content", ko: "유연한 콘텐츠에는 JSON 사용" })}
                </strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Use JSON type for rich text content (TipTap editor), flexible metadata, or configuration objects. Avoid using it for structured data - define proper fields instead.",
                  ko: "리치 텍스트 콘텐츠(TipTap 에디터), 유연한 메타데이터, 설정 객체에는 JSON 타입을 사용하세요. 구조화된 데이터에는 사용을 피하고 대신 적절한 필드를 정의하세요.",
                })}
              </div>
            </div>
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-purple-100 to-pink-100 p-6">
            <div className="mb-3 font-bold text-lg text-purple-800">
              {l.trans({ en: "🎉 What You've Learned:", ko: "🎉 학습한 내용:" })}
            </div>
            <ul className="space-y-2 text-purple-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "9 scalar types: String, Boolean, Date, ID, Int, Float, Upload, JSON, Map",
                  ko: "9가지 스칼라 타입: String, Boolean, Date, ID, Int, Float, Upload, JSON, Map",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Custom scalar classes (ID, Int, Float, Upload, JSON) from @akanjs/base",
                  ko: "@akanjs/base의 커스텀 스칼라 클래스 (ID, Int, Float, Upload, JSON)",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "GraphQL and MongoDB type mappings for each scalar",
                  ko: "각 스칼라의 GraphQL과 MongoDB 타입 매핑",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Practical usage patterns in constant.ts model definitions",
                  ko: "constant.ts 모델 정의에서의 실용적인 사용 패턴",
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
