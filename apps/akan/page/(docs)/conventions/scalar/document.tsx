import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="document-overview" title="scalar.document.ts">
        <Docs.Title>scalar.document.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar document file is optional. Add it when a scalar value needs a small method that reads its own fields and returns a useful result.",
              ko: "scalar document 파일은 선택 사항입니다. scalar 값이 자기 field를 읽고 유용한 결과를 반환하는 작은 method를 필요로 할 때 추가합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "If the scalar only needs fields and labels, the constant and dictionary files may be enough.",
              ko: "scalar에 field와 label만 필요하다면 constant와 dictionary 파일만으로 충분할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="basic-wrapper" title={l.trans({ en: "Basic Wrapper", ko: "기본 wrapper" })}>
        <Docs.Title>{l.trans({ en: "Basic Wrapper", ko: "기본 wrapper" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Import the constant file as `cnst`, then wrap the constant class with `by(cnst.Price)`. This gives the document class the same fields as the constant class.",
              ko: "constant 파일을 `cnst`로 import한 뒤 constant class를 `by(cnst.Price)`로 감쌉니다. 이렇게 하면 document class가 constant class와 같은 field를 가집니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.document.ts"
          code={`import { by } from "akanjs/document";

import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="helper-example" title={l.trans({ en: "Small Helper Example", ko: "작은 helper 예시" })}>
        <Docs.Title>{l.trans({ en: "Small Helper Example", ko: "작은 helper 예시" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A useful scalar document method is usually short. It reads the scalar fields and returns a display value, boolean, or small calculated result.",
              ko: "유용한 scalar document method는 보통 짧습니다. scalar field를 읽고 표시 값, boolean, 작은 계산 결과를 반환합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="price.document.ts"
          code={`import { by } from "akanjs/document";

import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {
  getLabel() {
    return \`\${this.amount.toLocaleString()} \${this.currency}\`;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use It", ko: "사용하는 경우" })}>
        <Docs.Title>{l.trans({ en: "When To Use It", ko: "사용하는 경우" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use a scalar document method when the same display or calculation appears in multiple places. For example, `Price.getLabel()` can be reused in product cards, order summaries, and invoices.",
              ko: "같은 표시나 계산이 여러 곳에 반복된다면 scalar document method를 사용합니다. 예를 들어 `Price.getLabel()`은 product card, order summary, invoice에서 재사용할 수 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Good: formatting a price label from `amount` and `currency`.",
                ko: "좋음: `amount`와 `currency`로 price label을 formatting.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Good: summarizing an address from `city` and `street`.",
                ko: "좋음: `city`와 `street`로 address 요약.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Avoid: loading other records or calling a backend service from the scalar method.",
                ko: "피하기: scalar method에서 다른 record를 load하거나 backend service를 호출.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
