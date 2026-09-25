import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="dictionary-overview" title="scalar.dictionary.ts">
        <Docs.Title>scalar.dictionary.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar dictionary gives translated labels to a scalar value. It normally describes the scalar name, field labels, and enum values.",
              ko: "scalar dictionary는 scalar 값에 번역된 label을 붙입니다. 보통 scalar 이름, field label, enum 값을 설명합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Keep it smaller than a module dictionary. A scalar usually does not have query, sort, slice, endpoint, or signal labels.",
              ko: "module dictionary보다 작게 유지합니다. scalar에는 보통 query, sort, slice, endpoint, signal label이 없습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="basic-pattern" title={l.trans({ en: "Basic Pattern", ko: "기본 패턴" })}>
        <Docs.Title>{l.trans({ en: "Basic Pattern", ko: "기본 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Start with `scalarDictionary(["en", "ko"])`. Then add the scalar name with `.of()`, field labels with `.model()`, and enum labels with `.enum()` when the scalar has an enum.',
              ko: '`scalarDictionary(["en", "ko"])`로 시작합니다. `.of()`로 scalar 이름을 붙이고, `.model()`로 field label을 붙이며, enum이 있다면 `.enum()`으로 enum label을 붙입니다.',
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.dictionary.ts"
          code={`import { scalarDictionary } from "akanjs/dictionary";

import type { Price } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price value", "가격 값"]))
  .model<Price>((t) => ({
    amount: t(["Amount", "금액"]).desc(["Price amount", "가격 금액"]),
    currency: t(["Currency", "통화"]).desc(["Currency code", "통화 코드"]),
  }));`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="builder-order" title={l.trans({ en: "Builder Order", ko: "Builder 순서" })}>
        <Docs.Title>{l.trans({ en: "Builder Order", ko: "Builder 순서" })}</Docs.Title>
        <Docs.Description>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <code>.of()</code>:{" "}
              {l.trans({
                en: "names the scalar itself.",
                ko: "scalar 자체의 이름을 정의합니다.",
              })}
            </li>
            <li>
              <code>.model()</code>:{" "}
              {l.trans({
                en: "labels each field from the scalar constant.",
                ko: "scalar constant의 각 field에 label을 붙입니다.",
              })}
            </li>
            <li>
              <code>.enum()</code>:{" "}
              {l.trans({
                en: "labels enum values only when the scalar has an enum.",
                ko: "scalar에 enum이 있을 때만 enum 값에 label을 붙입니다.",
              })}
            </li>
            <li>
              <code>.translate()</code>:{" "}
              {l.trans({
                en: "adds small scalar-specific text only when needed.",
                ko: "필요할 때만 작은 scalar 전용 문구를 추가합니다.",
              })}
            </li>
          </ol>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="language-order" title={l.trans({ en: "Language Order", ko: "언어 순서" })}>
        <Docs.Title>{l.trans({ en: "Language Order", ko: "언어 순서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'The language array controls every translation tuple. If the dictionary starts with `["en", "ko"]`, write English first and Korean second everywhere.',
              ko: '언어 배열이 모든 번역 tuple의 순서를 결정합니다. dictionary가 `["en", "ko"]`로 시작하면 모든 곳에서 영어를 먼저, 한국어를 두 번째로 작성합니다.',
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="language order"
          code={`export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price value", "가격 값"]));`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="enum-matching" title={l.trans({ en: "Enum Name Matching", ko: "Enum 이름 맞추기" })}>
        <Docs.Title>{l.trans({ en: "Enum Name Matching", ko: "Enum 이름 맞추기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When a scalar constant uses `enumOf()`, the dictionary `.enum()` name must match the `enumOf()` name exactly.",
              ko: "scalar constant가 `enumOf()`를 사용한다면 dictionary의 `.enum()` 이름은 `enumOf()` 이름과 정확히 같아야 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.constant.ts"
          code={`export class Currency extends enumOf("currency", ["KRW", "USD"] as const) {}`}
        />
        <Code.Snippet
          title="price.dictionary.ts"
          code={`export const dictionary = scalarDictionary(["en", "ko"])
  .enum<Currency>("currency", (t) => ({
    KRW: t(["KRW", "원"]).desc(["Korean won", "한국 원"]),
    USD: t(["USD", "달러"]).desc(["US dollar", "미국 달러"]),
  }));`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="custom-text" title={l.trans({ en: "Small Custom Text", ko: "작은 custom text" })}>
        <Docs.Title>{l.trans({ en: "Small Custom Text", ko: "작은 custom text" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `.translate()` only for short text that belongs to the scalar itself. If the text belongs to a page or action, keep it in the parent module dictionary.",
              ko: "`.translate()`는 scalar 자체에 속한 짧은 문구에만 사용합니다. 문구가 page나 action에 속한다면 상위 module dictionary에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.dictionary.ts"
          code={`export const dictionary = scalarDictionary(["en", "ko"])
  .translate({
    free: ["Free", "무료"],
  });`}
        />
        <Code.Snippet
          title="PriceLabel.tsx"
          code={`import { usePage } from "@apps/myapp/client";

export const PriceLabel = () => {
  const { l } = usePage();

  return (
    <div>
      <div>{l("price.amount")}</div>
      <div>{l("price.free")}</div>
    </div>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
