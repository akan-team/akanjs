import { usePage } from "@apps/akan/client";
import { Code, ConstantDocsDemo, ConstantDocsPrintDemo, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Constant Schema Docs", ko: "Constant 스키마 문서" })}>
        <Docs.Title>{l.trans({ en: "Constant Schema Docs", ko: "Constant 스키마 문서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan can render schema definition tables and model relationship diagrams directly from ConstantRegistry.",
              ko: "Akan은 ConstantRegistry에서 스키마 정의 테이블과 모델 관계 다이어그램을 바로 렌더링할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Developer schema page", ko: "개발자 스키마 page" })}
          code={`import "@apps/myapp/lib/cnst";
import { Constant } from "akanjs/ui";

export default function SchemaDocsPage() {
  return <Constant.Doc.Zone models={["user", "bizContract"]} openAll />;
}`}
        />
        <Code.Snippet
          title={l.trans({ en: "Printable schema definition", ko: "출력용 스키마 정의서" })}
          code={`import "@apps/myapp/lib/cnst";
import { Constant } from "akanjs/ui";

export default function PrintableSchemaDocsPage() {
  return <Constant.Doc.Print models={["user", "bizContract"]} />;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="schema-doc" title={l.trans({ en: "Generated Schema", ko: "생성된 스키마" })}>
        <ConstantDocsDemo />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="print-schema-doc" title={l.trans({ en: "Printable Definition", ko: "출력용 정의서" })}>
        <Docs.Title>{l.trans({ en: "Printable Definition", ko: "출력용 정의서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Constant.Doc.Print` renders every selected variant and field inline, without tabs, collapse panels, modals, or diagram interactions.",
              ko: "`Constant.Doc.Print`는 탭, collapse, modal, diagram 인터랙션 없이 선택된 모든 variant와 field를 펼쳐 렌더링합니다.",
            })}
          </div>
        </Docs.Description>
        <ConstantDocsPrintDemo />
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
