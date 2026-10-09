import { usePage } from "@apps/akan/client";
import { Code, ConstantDocsDemo, ConstantDocsPrintDemo, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const stepList = "my-4 list-decimal space-y-2 pl-5";

  const termRows = [
    {
      name: "refName",
      desc: l.trans({
        en: "A model's name in code, such as `user` or `bizContract`. You pick models by it.",
        ko: "코드에서 쓰는 모델 이름입니다. `user`, `bizContract` 같은 것이고, 보여 줄 모델을 이 이름으로 고릅니다.",
      }),
    },
    {
      name: "variant",
      desc: l.trans({
        en: "One of the five classes a model declares: Input, Object, Light, Full and Insight.",
        ko: "모델 하나가 선언하는 다섯 클래스 Input, Object, Light, Full, Insight 중 하나입니다.",
      }),
    },
    {
      name: "scalar",
      desc: l.trans({
        en: "A value object stored inside another model, declared under `lib/__scalar/`.",
        ko: "다른 모델 안에 들어가는 값 객체입니다. `lib/__scalar/` 아래에 선언합니다.",
      }),
    },
    {
      name: "enum",
      desc: l.trans({
        en: "A fixed list of allowed values, declared with `enumOf(...)`.",
        ko: "허용되는 값을 정해 둔 목록입니다. `enumOf(...)`로 선언합니다.",
      }),
    },
  ];

  const partRows = [
    {
      name: "Constant.Doc.Zone",
      desc: l.trans({
        en: "An explorer for the screen, with search, a table or diagram view and a tab per variant.",
        ko: "화면에서 둘러보는 탐색기입니다. 검색, 표와 다이어그램 전환, variant별 탭이 있습니다.",
      }),
    },
    {
      name: "Constant.Doc.Print",
      desc: l.trans({
        en: "Everything expanded on one long page, ready to print or save as a PDF.",
        ko: "모든 내용을 한 페이지에 펼쳐 둔 버전입니다. 그대로 인쇄하거나 PDF로 저장합니다.",
      }),
    },
    {
      name: ["Constant.Doc.Model", "Constant.Doc.Scalar"],
      desc: l.trans({
        en: "One model or scalar as a collapsible panel, picked by `refName`.",
        ko: "모델이나 scalar 하나를 접이식 패널 하나로 그립니다. `refName`으로 고릅니다.",
      }),
    },
    {
      name: "Constant.Doc.Enum",
      desc: l.trans({
        en: "Every registered enum in one table, with its values and the fields that use it.",
        ko: "등록된 모든 enum을 표 하나에 담습니다. 값과, 그 enum을 쓰는 필드가 함께 나옵니다.",
      }),
    },
  ];

  const propRows = [
    {
      key: "models",
      type: "string[]",
      default: l.trans({ en: "all", ko: "전체" }),
      desc: l.trans({
        en: "Database models to show, by `refName`, in the order you list them.",
        ko: "보여 줄 데이터베이스 모델의 `refName` 목록입니다. 적은 순서대로 나옵니다.",
      }),
    },
    {
      key: "scalars",
      type: "string[]",
      default: l.trans({ en: "all", ko: "전체" }),
      desc: l.trans({
        en: "Scalar models to show, by `refName`.",
        ko: "보여 줄 scalar 모델의 `refName` 목록입니다.",
      }),
    },
    {
      key: "enums",
      type: "string[]",
      default: l.trans({ en: "all", ko: "전체" }),
      desc: l.trans({
        en: "Enums to show: the class name, first letter lowercased (`BizContractStatus` → `bizContractStatus`).",
        ko: "보여 줄 enum 목록입니다. 클래스 이름의 첫 글자만 소문자로 씁니다(`BizContractStatus` → `bizContractStatus`).",
      }),
    },
    {
      key: "include",
      type: "string[]",
      default: l.trans({ en: "all", ko: "전체" }),
      desc: l.trans({
        en: "Models and scalars to start from, by `refName`; the scalars and enums they reach come along.",
        ko: "시작점이 될 모델과 scalar의 `refName` 목록입니다. 여기서 닿는 scalar와 enum이 함께 나옵니다.",
      }),
    },
    {
      key: "exclude",
      type: "string[]",
      default: "[]",
      desc: l.trans({
        en: "Names to leave out of every list. What only they reach is left out too.",
        ko: "모든 목록에서 뺄 이름입니다. 이것을 거쳐야만 닿는 scalar와 enum도 함께 빠집니다.",
      }),
    },
    {
      key: "libs",
      type: "string[]",
      default: l.trans({ en: "all", ko: "전체" }),
      desc: l.trans({
        en: "Libraries to show, by the app or lib that owns each entry. An app's extension belongs to the app.",
        ko: "보여 줄 라이브러리입니다. 항목마다 그것을 가진 앱이나 lib로 판단하며, 앱이 확장한 모델은 앱 것입니다.",
      }),
    },
    {
      key: "groupBy",
      type: '"lib"',
      tags: ["Doc.Zone"],
      desc: l.trans({
        en: "One section and one diagram per library, the app first; links to another library show as external.",
        ko: "라이브러리마다 섹션과 다이어그램을 따로 그리며 앱이 먼저 옵니다. 다른 라이브러리로 가는 관계는 외부 노드입니다.",
      }),
    },
    {
      key: "openAll",
      type: "boolean",
      default: "false",
      tags: ["Doc.Zone"],
      desc: l.trans({
        en: "Opens every model and scalar panel. `Doc.Print` is always fully open and ignores it.",
        ko: "모든 모델과 scalar 패널을 펼칩니다. `Doc.Print`는 항상 다 펼쳐져 있어 이 값을 쓰지 않습니다.",
      }),
    },
  ];

  const controlColumns = [
    { key: "control", label: l.trans({ en: "Part", ko: "부분" }) },
    { key: "desc", label: l.trans({ en: "What it does", ko: "하는 일" }) },
  ];
  const controlRows = [
    {
      control: l.trans({ en: "Summary cards", ko: "요약 카드" }),
      desc: l.trans({
        en: "Counts of database models, scalar models, enums and relations.",
        ko: "데이터베이스 모델, scalar 모델, enum, 관계의 개수를 보여 줍니다.",
      }),
    },
    {
      control: l.trans({ en: "Search", ko: "검색" }),
      desc: l.trans({
        en: "Filters models and scalars by `refName`, and enums by name.",
        ko: "모델과 scalar는 `refName`으로, enum은 이름으로 거릅니다.",
      }),
    },
    {
      control: "Table · Diagram",
      desc: l.trans({
        en: "Switches between field tables and a graph of how models point at each other.",
        ko: "필드 표와, 모델끼리 서로 가리키는 관계를 그린 그래프를 오갑니다.",
      }),
    },
    {
      control: "Input · Object · Full · Light · Insight",
      desc: l.trans({
        en: "Shows one variant of a model at a time. `Full` opens first.",
        ko: "모델의 variant를 하나씩 보여 줍니다. 처음에는 `Full`이 열립니다.",
      }),
    },
    {
      control: "Detail",
      desc: l.trans({
        en: "Opens one field's full settings as JSON, including `ref`, `example` and `meta`.",
        ko: "필드 하나의 설정 전체를 JSON으로 엽니다. `ref`, `example`, `meta`도 여기서 봅니다.",
      }),
    },
  ];

  const fieldRows = [
    {
      name: "Type",
      desc: l.trans({
        en: "The field type. `!` marks a required field, and a model or scalar type is highlighted.",
        ko: "필드 타입입니다. `!`는 필수 필드이고, 모델이나 scalar 타입은 색으로 강조됩니다.",
      }),
    },
    {
      name: "Kind",
      desc: l.trans({
        en: "`property`, `hidden`, `secret` or `resolve`, with `select:false` and `immutable` badges.",
        ko: "`property`, `hidden`, `secret`, `resolve` 중 하나이며, `select:false`와 `immutable` 배지가 붙습니다.",
      }),
    },
    {
      name: "Default",
      desc: l.trans({
        en: "The declared default. A function default reads `[function]`.",
        ko: "선언한 기본값입니다. 함수로 준 기본값은 `[function]`으로 나옵니다.",
      }),
    },
    {
      name: "Constraints",
      desc: l.trans({
        en: "`min`, `max`, `minlength`, `maxlength`, the `text:` search role, `custom validate`, `accumulate`.",
        ko: "`min`, `max`, `minlength`, `maxlength`, 검색용 `text:` 역할, `custom validate`, `accumulate`입니다.",
      }),
    },
    {
      name: "Values",
      desc: l.trans({
        en: "The allowed values when the field is an enum.",
        ko: "enum 필드일 때 허용되는 값입니다.",
      }),
    },
  ];

  const viewColumns = [
    { key: "zone", label: "Doc.Zone", code: true },
    { key: "print", label: "Doc.Print", code: true },
  ];
  const onZone = { zone: true };
  const onPrint = { print: true };
  const viewGroups = [
    {
      label: l.trans({ en: "Browsing on screen", ko: "화면에서 둘러보기" }),
      rows: [
        { name: <span className="font-sans">{l.trans({ en: "Search", ko: "검색" })}</span>, marks: onZone },
        {
          name: <span className="font-sans">{l.trans({ en: "Relation diagram", ko: "관계 다이어그램" })}</span>,
          marks: onZone,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Variant tabs", ko: "variant 탭" })}</span>,
          desc: l.trans({ en: "One variant at a time.", ko: "variant를 하나씩 봅니다." }),
          marks: onZone,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Collapsible panels", ko: "접이식 패널" })}</span>,
          desc: l.trans({ en: "`openAll` opens them all.", ko: "`openAll`로 한꺼번에 펼칩니다." }),
          marks: onZone,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Field detail modal", ko: "필드 상세 모달" })}</span>,
          marks: onZone,
        },
      ],
    },
    {
      label: l.trans({ en: "Printing", ko: "인쇄하기" }),
      rows: [
        {
          name: (
            <span className="font-sans">
              {l.trans({ en: "All five variants at once", ko: "variant 다섯 개를 한꺼번에" })}
            </span>
          ),
          desc: l.trans({ en: "Printed one after another per model.", ko: "모델마다 차례로 모두 찍힙니다." }),
          marks: onPrint,
        },
        {
          name: (
            <span className="font-sans">{l.trans({ en: "Field details in the table", ko: "표 안의 필드 상세" })}</span>
          ),
          desc: l.trans({
            en: "`ref`, `refPath`, `example` and `meta` inline, in place of the modal.",
            ko: "모달 대신 `ref`, `refPath`, `example`, `meta`를 표 안에 적습니다.",
          }),
          marks: onPrint,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Enum value labels", ko: "enum 값 설명" })}</span>,
          desc: l.trans({
            en: "Written in a column. `Doc.Zone` shows them only on hover.",
            ko: "열 하나에 적어 둡니다. `Doc.Zone`에서는 마우스를 올려야 보입니다.",
          }),
          marks: onPrint,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Page breaks", ko: "페이지 나눔" })}</span>,
          desc: l.trans({
            en: "Each database model gets its own page, and scalars and enums start on a new one.",
            ko: "데이터베이스 모델은 한 페이지씩 차지하고, scalar와 enum도 새 페이지에서 시작합니다.",
          }),
          marks: onPrint,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Print colors", ko: "인쇄용 색" })}</span>,
          desc: l.trans({
            en: "Switches to black text on white when printed, even from dark mode.",
            ko: "인쇄할 때는 다크 모드에서도 흰 바탕에 검은 글씨로 바뀝니다.",
          }),
          marks: onPrint,
        },
      ],
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Constant Schema Docs", ko: "Constant 스키마 문서" })}>
        <Docs.Title>{l.trans({ en: "Constant Schema Docs", ko: "Constant 스키마 문서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  You do not have to write a data model spec by hand. <code>Constant.Doc</code> reads every model
                  registered in <code>ConstantRegistry</code> and draws field tables and a relation diagram from it.
                </span>
              ),
              ko: (
                <span>
                  데이터 모델 명세서를 손으로 쓸 필요가 없습니다. <code>Constant.Doc</code>은{" "}
                  <code>ConstantRegistry</code>에 등록된 모델을 읽어 필드 표와 관계 다이어그램을 바로 그립니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "The parts", ko: "구성 요소" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Component", ko: "컴포넌트" })} items={partRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Put it on a page", ko: "페이지에 띄우기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A route renders it directly and stays a server page:",
              ko: "route에서 바로 그리며, route는 서버 페이지로 둡니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/(admin)/schema/_index.tsx"
          code={`import { page } from "akanjs/client";
import { Constant } from "akanjs/ui";

export default page().render(() => <Constant.Doc.Zone models={["user", "bizContract"]} openAll />);`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Both components take the same lists:",
              ko: "두 컴포넌트가 같은 목록을 받습니다:",
            })}
          </div>
          <Docs.OptionTable items={propRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>An empty list means none.</strong> <code>{"models={[]}"}</code> shows no model; only a prop
                    left out means every registered one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>빈 목록은 "없음"입니다.</strong> <code>{"models={[]}"}</code>는 모델을 하나도 보여 주지
                    않고, prop을 빼야 등록된 전체가 나옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Narrowing one list narrows the rest.</strong> With <code>models</code>, <code>include</code>{" "}
                    or <code>exclude</code> set, a left-out <code>scalars</code> becomes the scalars the shown models
                    embed and a left-out <code>enums</code> the enums their fields use.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>한 목록을 좁히면 나머지도 따라 좁혀집니다.</strong> <code>models</code>,{" "}
                    <code>include</code>, <code>exclude</code> 중 하나라도 주면, 뺀 <code>scalars</code>는 보이는 모델이
                    품은 scalar로, 뺀 <code>enums</code>는 그 필드가 쓰는 enum으로 정해집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A misspelled name is skipped quietly.</strong> If a model is missing, check its{" "}
                    <code>refName</code> against the summary counts.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이름을 잘못 쓰면 조용히 빠집니다.</strong> 모델이 안 보이면 요약 카드의 개수와{" "}
                    <code>refName</code> 철자를 확인하세요.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Order follows your list.</strong> A list you leave out is sorted by name.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>순서는 적은 대로입니다.</strong> 목록을 생략하면 이름순으로 정렬됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The URL.</strong> <code>(admin)</code> is a route group and adds nothing to the path, so the
                    page above serves <code>/schema</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>URL.</strong> <code>(admin)</code>은 route 그룹이라 경로에 들어가지 않습니다. 위 페이지는{" "}
                    <code>/schema</code>에서 열립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The print version.</strong> Write <code>schema/print.tsx</code> the same way with{" "}
                    <code>{"<Constant.Doc.Print />"}</code>, and it serves <code>/schema/print</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>출력용 버전.</strong> <code>schema/print.tsx</code>를 같은 모양으로 만들고{" "}
                    <code>{"<Constant.Doc.Print />"}</code>를 그리면 <code>/schema/print</code>에서 열립니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="schema-doc" title={l.trans({ en: "Generated Schema", ko: "생성된 스키마" })}>
        <Docs.Title>{l.trans({ en: "Generated Schema", ko: "생성된 스키마" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Constant.Doc.Zone</code> is for browsing. Each model is a panel with a field table, and the
                  toolbar switches the whole view to a relation diagram.
                </span>
              ),
              ko: (
                <span>
                  <code>Constant.Doc.Zone</code>은 둘러보기용입니다. 모델마다 필드 표가 든 패널이 하나씩 있고, 도구
                  모음에서 표 대신 관계 다이어그램으로 볼 수 있습니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "What is on screen", ko: "화면 구성" })}</Docs.SubSubTitle>
          <Docs.Table columns={controlColumns} rows={controlRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Reading a field row", ko: "필드 표 읽는 법" })}</Docs.SubSubTitle>
          <Docs.IntroTable
            type={l.trans({ en: "Column", ko: "열" })}
            descLabel={l.trans({ en: "What it shows", ko: "보여 주는 것" })}
            items={fieldRows}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Labels come from the dictionary.</strong> The model description is the one in{" "}
                    <code>.of()</code>, and each field shows its label and <code>.desc()</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>레이블은 dictionary에서 옵니다.</strong> 모델 설명은 <code>.of()</code>에 적은 것이고,
                    필드마다 레이블과 <code>.desc()</code>가 나옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Reading the diagram.</strong> Each arrow is labelled with the fields that make it. A model
                    outside your list shows as an <code>External</code> node.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>다이어그램 읽기.</strong> 화살표마다 그 관계를 만든 필드 이름이 붙습니다. 목록에 없는 모델은{" "}
                    <code>External</code> 노드로 나옵니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Click a node.</strong> The side panel lists its fields and their types, from the{" "}
                    <code>Full</code> variant for a database model.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>노드를 누르면</strong> 옆 패널에 그 모델의 필드와 타입이 나옵니다. 데이터베이스 모델은{" "}
                    <code>Full</code> variant 기준입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "Live on this site", ko: "이 사이트에서 실제로 그린 모습" })}
          </Docs.SubSubTitle>
        </Docs.Description>
        <ConstantDocsDemo />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="print-schema-doc" title={l.trans({ en: "Printable Definition", ko: "출력용 정의서" })}>
        <Docs.Title>{l.trans({ en: "Printable Definition", ko: "출력용 정의서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Constant.Doc.Print</code> renders every selected variant and field expanded. There are no tabs,
                  collapse panels, modals or diagram, so the page prints as it looks.
                </span>
              ),
              ko: (
                <span>
                  <code>Constant.Doc.Print</code>는 고른 모델의 variant와 필드를 모두 펼쳐 그립니다. 탭, 접이식 패널,
                  모달, 다이어그램이 없어서 보이는 그대로 인쇄됩니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Feature", ko: "기능" })}
            columns={viewColumns}
            groups={viewGroups}
            markLabel={l.trans({ en: "has it", ko: "있음" })}
            emptyLabel={l.trans({ en: "does not", ko: "없음" })}
          />
          <div>{l.trans({ en: "To keep a copy as a PDF:", ko: "PDF로 남기려면:" })}</div>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    Open the print route, such as <code>/schema/print</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>/schema/print</code> 같은 출력용 route를 엽니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Press <code>⌘P</code> or <code>Ctrl+P</code> and choose Save as PDF in the browser's print dialog.
                  </span>
                ),
                ko: (
                  <span>
                    <code>⌘P</code>나 <code>Ctrl+P</code>를 누르고, 브라우저 인쇄 창에서 PDF로 저장을 고릅니다.
                  </span>
                ),
              })}
            </li>
          </ol>
          <Docs.SubSubTitle>
            {l.trans({ en: "Live on this site", ko: "이 사이트에서 실제로 그린 모습" })}
          </Docs.SubSubTitle>
        </Docs.Description>
        <ConstantDocsPrintDemo />
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
