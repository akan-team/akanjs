import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="constant-overview" title="scalar.constant.ts">
        <Docs.Title>scalar.constant.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar constant defines the shape of a small reusable value. It should be simple enough to understand without reading a service, signal, or store file.",
              ko: "scalar constant는 작고 재사용 가능한 값의 형태를 정의합니다. service, signal, store 파일을 읽지 않아도 이해할 수 있을 만큼 단순해야 합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Most scalar constants need only `via()`, `field()`, optional defaults, and sometimes a small enum.",
              ko: "대부분의 scalar constant에는 `via()`, `field()`, optional default, 때로는 작은 enum 정도만 필요합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="basic-shape" title={l.trans({ en: "Basic Shape", ko: "기본 형태" })}>
        <Docs.Title>{l.trans({ en: "Basic Shape", ko: "기본 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `via((field) => ({ ... }))` and describe each value with `field(Type)`. The class name should describe the business value, not the parent model that happens to use it.",
              ko: "`via((field) => ({ ... }))`를 사용하고 각 값을 `field(Type)`으로 설명합니다. class 이름은 이 값을 사용하는 상위 model이 아니라 비즈니스 값 자체를 설명해야 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.constant.ts"
          code={`import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float),
  currency: field(String),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="defaults-optional"
        title={l.trans({ en: "Defaults And Optional Fields", ko: "Default와 optional" })}
      >
        <Docs.Title>{l.trans({ en: "Defaults And Optional Fields", ko: "Default와 optional" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Add defaults when a value should have a stable initial state. Use `.optional()` when the parent model can exist without that field.",
              ko: "값이 안정적인 초기 상태를 가져야 하면 default를 추가합니다. 상위 model이 해당 field 없이도 존재할 수 있다면 `.optional()`을 사용합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`currency` can default to a normal business value such as `KRW`.",
                ko: "`currency`는 `KRW`처럼 일반적인 비즈니스 값으로 default를 둘 수 있습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`memo` can be optional because not every price needs a note.",
                ko: "모든 price에 note가 필요한 것은 아니므로 `memo`는 optional일 수 있습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title="price.constant.ts"
          code={`export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(String, { default: "KRW" }),
  memo: field(String).optional(),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="arrays" title={l.trans({ en: "Array Fields", ko: "Array field" })}>
        <Docs.Title>{l.trans({ en: "Array Fields", ko: "Array field" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use an array field when the scalar naturally contains a repeated value. Keep the example small: a contact info value may have several emails.",
              ko: "scalar가 자연스럽게 반복 값을 포함한다면 array field를 사용합니다. 예시는 작게 유지합니다. contact info 값은 여러 email을 가질 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="contactInfo.constant.ts"
          code={`import { via } from "akanjs/constant";

export class ContactInfo extends via((field) => ({
  name: field(String),
  emails: field([String]),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="enum-fields" title={l.trans({ en: "Enum Fields", ko: "Enum field" })}>
        <Docs.Title>{l.trans({ en: "Enum Fields", ko: "Enum field" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `enumOf()` when a field should only allow a fixed set of values. The enum name string is also used by the dictionary file, so keep it short and stable.",
              ko: "field가 고정된 값 중 하나만 허용해야 한다면 `enumOf()`를 사용합니다. enum name string은 dictionary 파일에서도 사용하므로 짧고 안정적으로 유지합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.constant.ts"
          code={`import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Currency extends enumOf("currency", ["KRW", "USD"] as const) {}

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(Currency, { default: "KRW" }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="helper-methods" title={l.trans({ en: "Small Helpers", ko: "작은 helper" })}>
        <Docs.Title>{l.trans({ en: "Small Helpers", ko: "작은 helper" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A constant may include a small pure helper when the behavior belongs to the value itself. Keep it independent from server requests, database calls, and external services.",
              ko: "동작이 값 자체에 속한다면 constant에 작은 순수 helper를 둘 수 있습니다. server request, database call, external service와는 독립적으로 유지합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.constant.ts"
          code={`export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(Currency, { default: "KRW" }),
})) {
  isFree() {
    return this.amount === 0;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
