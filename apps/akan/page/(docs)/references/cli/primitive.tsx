import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  cardGridRecipe,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type MatrixGroup,
  panelRecipe,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "CLI 레퍼런스: Primitive | Akan.js" : "CLI Reference: Primitive | Akan.js";
    const description =
      lang === "ko"
        ? "이미 있는 모듈에 필드 하나나 UI 파일 하나를 더합니다."
        : "Add one field or one UI file to a module that already exists.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const termRows: IntroItem[] = [
      {
        name: "primitive",
        desc: l.trans({
          en: "A command that writes one change you already decided on straight to source, with no plan step.",
          ko: "이미 정한 수정 하나를 플랜 없이 바로 소스에 쓰는 명령입니다.",
        }),
      },
      {
        name: "surface",
        desc: l.trans({
          en: "The role of one module UI file — `view`, `unit` or `template` — picked with `--surface`.",
          ko: "모듈 UI 파일 하나의 역할로, `--surface`에서 `view`, `unit`, `template` 중 하나를 고릅니다.",
        }),
      },
      {
        name: l.trans({ en: "report", ko: "리포트" }),
        desc: l.trans({
          en: "What each command prints when it ends: the changed files, diagnostics, and what to run next.",
          ko: "명령이 끝나면 출력하는 결과로, 바뀐 파일과 진단, 다음에 실행할 명령이 담깁니다.",
        }),
      },
      {
        name: l.trans({ en: "workflow", ko: "워크플로" }),
        desc: l.trans({
          en: "The same change plus a plan to review first and checks to run after, compared at the end.",
          ko: "같은 수정에 먼저 읽는 플랜과 뒤따르는 검증을 더한 절차로, 페이지 끝에서 비교합니다.",
        }),
      },
    ];

    const fileGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "Add a UI file", ko: "UI 파일 만들기" }),
        rows: [
          {
            name: "create-ui",
            desc: l.trans({
              en: "Writes one View, Unit or Template file and nothing else.",
              ko: "View, Unit, Template 파일 하나만 쓰고 다른 파일은 건드리지 않습니다.",
            }),
            marks: { constant: false, dictionary: false, ui: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Add a field", ko: "필드 더하기" }),
        rows: [
          {
            name: "add-field",
            desc: l.trans({
              en: "Adds the field to the Input class and its label to the dictionary.",
              ko: "Input 클래스에 필드를, 딕셔너리에 그 라벨을 더합니다.",
            }),
            marks: { constant: true, dictionary: true, ui: false },
          },
          {
            name: "add-enum-field",
            desc: l.trans({
              en: "Declares an enum class first, then adds a field typed as that class.",
              ko: "enum 클래스를 먼저 선언하고, 그 클래스를 타입으로 하는 필드를 더합니다.",
            }),
            marks: { constant: true, dictionary: true, ui: false },
          },
        ],
      },
    ];

    const commonRules = [
      l.trans({
        en: (
          <>
            <strong>Missing options are not asked for.</strong> Leave out <code>--app</code> or <code>--module</code>{" "}
            and the command prints an error in its report instead of a prompt.
          </>
        ),
        ko: (
          <>
            <strong>빠진 옵션을 되묻지 않습니다.</strong> <code>--app</code>이나 <code>--module</code>을 빼면 프롬프트
            대신 리포트에 오류가 나옵니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>An error writes nothing.</strong> An unknown app, a missing input or a bad value leaves every file
            as it was, and the report names the cause.
          </>
        ),
        ko: (
          <>
            <strong>오류가 있으면 아무것도 쓰지 않습니다.</strong> 앱을 찾지 못하거나 입력이 빠졌거나 값이 틀리면 파일은
            그대로이고, 리포트가 원인을 알려 줍니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>You run sync and lint.</strong> The command only writes source. Its report lists{" "}
            <code>{"akan sync <app>"}</code> and <code>{"akan lint <app>"}</code> as the next steps.
          </>
        ),
        ko: (
          <>
            <strong>sync와 lint는 직접 실행합니다.</strong> 명령은 소스만 씁니다. 다음에 할 일로{" "}
            <code>{"akan sync <app>"}</code>와 <code>{"akan lint <app>"}</code>가 리포트에 적혀 있습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>
              <code>--format json</code> is for scripts and agents.
            </strong>{" "}
            It prints the same report as one JSON object.
          </>
        ),
        ko: (
          <>
            <strong>
              <code>--format json</code>은 스크립트와 에이전트용입니다.
            </strong>{" "}
            같은 리포트를 JSON 객체 하나로 출력합니다.
          </>
        ),
      }),
    ];

    const appOption = {
      name: "--app",
      type: "String",
      required: "yes",
      enumOrFlag: "-a",
      desc: l.trans({
        en: "Target app or library name.",
        ko: "대상 앱이나 라이브러리 이름입니다.",
      }),
    };
    const formatOption = {
      name: "--format",
      type: "String",
      defaultValue: "markdown",
      enumOrFlag: "markdown | json · -o",
      desc: l.trans({
        en: "`markdown` is for a person to read; `json` is the same report as one object.",
        ko: "`markdown`은 사람이 읽는 형식이고, `json`은 같은 리포트를 객체 하나로 출력합니다.",
      }),
    };
    const afterNote = {
      name: l.trans({ en: "afterwards", ko: "그다음" }),
      desc: l.trans({
        en: "Run `akan sync <app>` and then `akan lint <app>`.",
        ko: "`akan sync <app>`, `akan lint <app>`를 차례로 실행합니다.",
      }),
    };

    const commands: CommandReferenceItem[] = [
      {
        name: "create-ui",
        signature:
          "akan create-ui --app <name> --module <name> [--surface <view|unit|template>] [--format <markdown|json>]",
        desc: l.trans({
          en: "Write one UI file into `lib/<module>/` of an existing module: a View, a Unit or a Template.\nIt writes from the same template `akan create-module` uses, and touches no other file.\nIt is the flag form of `akan create-view`, `create-unit` and `create-template`.",
          ko: "기존 모듈의 `lib/<module>/`에 UI 파일 하나를 씁니다. View, Unit, Template 중 하나입니다.\n`akan create-module`이 모듈을 만들 때 쓰는 것과 같은 템플릿을 쓰고, 다른 파일은 건드리지 않습니다.\n`akan create-view`, `create-unit`, `create-template`을 옵션으로 고르는 형태입니다.",
        }),
        options: [
          appOption,
          {
            name: "--module",
            type: "String",
            required: "yes",
            enumOrFlag: "-m",
            desc: l.trans({
              en: "Target module name, such as `icecreamOrder`.",
              ko: "`icecreamOrder` 같은 대상 모듈 이름입니다.",
            }),
          },
          {
            name: "--surface",
            type: "String",
            defaultValue: "template",
            enumOrFlag: "view | unit | template · -u",
            desc: l.trans({
              en: "Which file to write; Zone and Util are not built by this command.",
              ko: "만들 파일이며, Zone과 Util은 이 명령으로 만들지 않습니다.",
            }),
          },
          formatOption,
        ],
        notes: [
          {
            name: "view",
            desc: l.trans({
              en: "`<Module>.View.tsx` exporting `General`, the detail screen, as a server component.",
              ko: "`General`을 내보내는 `<Module>.View.tsx`로, 상세 화면을 그리는 서버 컴포넌트입니다.",
            }),
          },
          {
            name: "unit",
            desc: l.trans({
              en: "`<Module>.Unit.tsx` exporting `Card`, one list or card item, as a server component.",
              ko: "`Card`를 내보내는 `<Module>.Unit.tsx`로, 목록이나 카드 한 칸을 그리는 서버 컴포넌트입니다.",
            }),
          },
          {
            name: "template",
            desc: l.trans({
              en: '`<Module>.Template.tsx` exporting the `General` form, with "use client" on line 1.',
              ko: '폼 `General`을 내보내는 `<Module>.Template.tsx`로, 첫 줄이 "use client"입니다.',
            }),
          },
          {
            name: l.trans({ en: "name field", ko: "name 필드" }),
            desc: l.trans({
              en: "The scaffold renders only the module's `name` field; swap in the fields you need.",
              ko: "스캐폴드는 모듈의 `name` 필드만 그리므로, 필요한 필드로 바꿔 씁니다.",
            }),
          },
          {
            name: l.trans({ en: "existing file", ko: "기존 파일" }),
            desc: l.trans({
              en: "A file already at that path is overwritten with the scaffold, so commit first.",
              ko: "같은 경로에 파일이 있으면 스캐폴드로 덮어쓰므로, 실행 전에 커밋해 둡니다.",
            }),
          },
          afterNote,
        ],
        examples: `akan create-ui --app koyo --module icecreamOrder
akan create-ui --app koyo --module icecreamOrder --surface view
akan create-ui --app koyo --module icecreamOrder --surface unit --format json`,
      },
      {
        name: "add-field",
        signature:
          "akan add-field --app <name> --module <name> --field <name> --type <type> [--default <value>] [--format <markdown|json>]",
        desc: l.trans({
          en: "Add one field to a module's constant and dictionary.\nThe field goes into `<Module>Input` in `<module>.constant.ts`, and its label and description into `.model<Module>` in `<module>.dictionary.ts`.\nIt also imports the type: an `akanjs/base` type from there, a scalar or model of the target from its constant file.",
          ko: "모듈의 constant와 dictionary에 필드 하나를 더합니다.\n필드는 `<module>.constant.ts`의 `<Module>Input`에, 라벨과 설명은 `<module>.dictionary.ts`의 `.model<Module>`에 들어갑니다.\n타입 import도 더합니다. `akanjs/base` 타입은 거기서, 대상의 스칼라나 모델은 그 constant 파일에서 가져옵니다.",
        }),
        options: [
          appOption,
          {
            name: "--module",
            type: "String",
            required: "yes",
            enumOrFlag: "-m",
            desc: l.trans({
              en: "Target module, whose constant and dictionary files must both exist already.",
              ko: "대상 모듈로, constant와 dictionary 파일이 둘 다 이미 있어야 합니다.",
            }),
          },
          {
            name: "--field",
            type: "String",
            required: "yes",
            enumOrFlag: "-f",
            desc: l.trans({
              en: "Field name; a name already in the Input class is refused.",
              ko: "필드 이름이며, Input 클래스에 이미 있는 이름이면 거절합니다.",
            }),
          },
          {
            name: "--type",
            type: "String",
            required: "yes",
            enumOrFlag: "-t",
            desc: l.trans({
              en: "Field type, scalar or model class name; lowercase aliases such as `int` are normalized as in Notes.",
              ko: "필드 타입이나 스칼라·모델 클래스 이름으로, `int` 같은 소문자 별칭은 아래 참고 표대로 바로잡습니다.",
            }),
          },
          {
            name: "--default",
            type: "String",
            enumOrFlag: "-d",
            desc: l.trans({
              en: "Optional default, converted to the type; a value the type rejects writes nothing.",
              ko: "선택 사항인 기본값으로 타입에 맞게 변환되며, 타입에 맞지 않는 값이면 아무것도 쓰지 않습니다.",
            }),
          },
          formatOption,
        ],
        notes: [
          {
            name: l.trans({ en: "number aliases", ko: "숫자 별칭" }),
            desc: l.trans({
              en: "`int` and `integer` become `Int`; `float`, `double` and `decimal` become `Float`.",
              ko: "`int`, `integer`는 `Int`로, `float`, `double`, `decimal`은 `Float`로 바뀝니다.",
            }),
          },
          {
            name: l.trans({ en: "other aliases", ko: "그 밖의 별칭" }),
            desc: l.trans({
              en: "`string`, `boolean` and `date` are capitalized. Any other name is written as given.",
              ko: "`string`, `boolean`, `date`는 첫 글자를 대문자로 바꾸고, 나머지 이름은 그대로 씁니다.",
            }),
          },
          {
            name: "Int · Float",
            desc: l.trans({
              en: "`number` and `numeric` are refused: use `Int` for whole numbers and `Float` for decimals.",
              ko: "`number`와 `numeric`은 거절하므로, 정수는 `Int`, 소수는 `Float`를 씁니다.",
            }),
          },
          {
            name: l.trans({ en: "type imports", ko: "타입 import" }),
            desc: l.trans({
              en: "`ID` and other base types come from `akanjs/base`, a scalar or model from its constant; others are refused.",
              ko: "`ID` 같은 기본 타입은 `akanjs/base`에서, 스칼라나 모델은 그 constant에서 가져오고, 그 밖의 타입은 거부합니다.",
            }),
          },
          {
            name: l.trans({ en: "file fields", ko: "파일 필드" }),
            desc: l.trans({
              en: "`Upload` is refused, since it belongs only in a file-upload body; relate the field to `File`.",
              ko: "`Upload`는 파일 업로드 요청 본문에만 쓰는 타입이라 거절하므로, `File` 모델과의 관계로 선언합니다.",
            }),
          },
          {
            name: "--default",
            desc: l.trans({
              en: "`Int`/`Float` take a number, `Boolean` `true`/`false`, `Date` `now` or a date; others a string.",
              ko: "`Int`/`Float`는 숫자, `Boolean`은 `true`/`false`, `Date`는 `now`나 날짜를 받고, 나머지는 문자열입니다.",
            }),
          },
          {
            name: "--default now",
            desc: l.trans({
              en: "Writes `() => dayjs()`, so each record gets its own time; a date is written as a thunk too.",
              ko: "`() => dayjs()`를 쓰므로 레코드마다 자기 시각을 받습니다. 날짜를 주어도 함수 형태로 씁니다.",
            }),
          },
          {
            name: l.trans({ en: "labels", ko: "라벨" }),
            desc: l.trans({
              en: "The Korean label is filled in only for common words like `status`; otherwise it repeats the English.",
              ko: "한국어 라벨은 `status` 같은 흔한 단어만 채워지고, 나머지는 영어를 그대로 쓰니 직접 고칩니다.",
            }),
          },
          {
            name: l.trans({ en: "components", ko: "컴포넌트" }),
            desc: l.trans({
              en: "No component is edited, so add the field to the Template form yourself.",
              ko: "컴포넌트는 고치지 않으므로, Template 폼에는 필드를 직접 더합니다.",
            }),
          },
          afterNote,
        ],
        examples: `akan add-field --app koyo --module icecreamOrder --field topping --type String
akan add-field --app koyo --module icecreamOrder --field scoops --type Int --default 2
akan add-field --app koyo --module icecreamOrder --field servedAt --type Date --format json`,
      },
      {
        name: "add-enum-field",
        signature:
          "akan add-enum-field --app <name> --module <name> --field <name> --values <a,b,c> [--default <value>] [--format <markdown|json>]",
        desc: l.trans({
          en: "Add a field that takes one value from a fixed set.\nFirst it declares the enum: an `enumOf` class named `<Module><Field>` in the constant, with the `enumOf` import added, and its options in the dictionary's `.enum` stage.\nThen it adds the field, typed as that class, exactly as `add-field` does.",
          ko: "정해진 값 중 하나만 받는 필드를 더합니다.\n먼저 enum을 선언합니다. constant에 `<Module><Field>` 이름의 `enumOf` 클래스를 만들고 `enumOf` import를 더한 뒤, dictionary의 `.enum` 단계에 선택지를 등록합니다.\n그다음 그 클래스를 타입으로 하는 필드를 `add-field`와 똑같이 더합니다.",
        }),
        options: [
          appOption,
          {
            name: "--module",
            type: "String",
            required: "yes",
            enumOrFlag: "-m",
            desc: l.trans({
              en: "Target module, whose constant and dictionary files must both exist already.",
              ko: "대상 모듈로, constant와 dictionary 파일이 둘 다 이미 있어야 합니다.",
            }),
          },
          {
            name: "--field",
            type: "String",
            required: "yes",
            enumOrFlag: "-f",
            desc: l.trans({
              en: "Field name, which also names the enum: `status` on module `order` declares `OrderStatus`.",
              ko: "필드 이름이자 enum 이름으로, `order` 모듈의 `status` 필드는 `OrderStatus`를 선언합니다.",
            }),
          },
          {
            name: "--values",
            type: "String",
            required: "yes",
            enumOrFlag: "-l",
            desc: l.trans({
              en: "Comma-separated enum values, such as `pending,serving,served`.",
              ko: "`pending,serving,served`처럼 쉼표로 구분한 enum 값입니다.",
            }),
          },
          {
            name: "--default",
            type: "String",
            enumOrFlag: "-d",
            desc: l.trans({
              en: "Optional default, which must be one of `--values`.",
              ko: "선택 사항인 기본값으로, `--values` 중 하나여야 합니다.",
            }),
          },
          formatOption,
        ],
        notes: [
          {
            name: l.trans({ en: "no --type", ko: "--type 없음" }),
            desc: l.trans({
              en: "The type is always the new enum class, which is why the command takes `--values` instead.",
              ko: "타입은 항상 새로 만드는 enum 클래스라서, 이 명령은 `--type` 대신 `--values`를 받습니다.",
            }),
          },
          {
            name: "add-field --type enum",
            desc: l.trans({
              en: "Fails and writes nothing, so a new enum always goes through `add-enum-field`.",
              ko: "오류로 끝나고 아무것도 쓰지 않으므로, 새 enum은 항상 `add-enum-field`로 만듭니다.",
            }),
          },
          {
            name: l.trans({ en: "existing enum", ko: "이미 있는 enum" }),
            desc: l.trans({
              en: "When the enum class already exists, run `add-field --type <Class>` instead.",
              ko: "enum 클래스가 이미 있으면 대신 `add-field --type <Class>`를 실행합니다.",
            }),
          },
          {
            name: l.trans({ en: "option labels", ko: "선택지 라벨" }),
            desc: l.trans({
              en: "Each value gets a Title Case English label in both languages, so translate the Korean ones.",
              ko: "값마다 영어 Title Case 라벨이 두 언어 모두에 들어가므로, 한국어 라벨은 직접 번역합니다.",
            }),
          },
          afterNote,
        ],
        examples: `akan add-enum-field --app koyo --module icecreamOrder --field status --values pending,serving,served
akan add-enum-field --app koyo --module icecreamOrder --field size --values small,large --default small`,
      },
    ];

    const bothMarks = { primitive: true, workflow: true };
    const workflowMarks = { primitive: false, workflow: true };
    const compareGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "Both", ko: "둘 다" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "the source edit", ko: "소스 수정" })}</span>,
            desc: l.trans({
              en: "The same field or UI file, written by the same code; a workflow calls these commands.",
              ko: "워크플로도 안에서 이 명령을 부르므로, 같은 코드가 같은 필드나 UI 파일을 씁니다.",
            }),
            marks: bothMarks,
          },
        ],
      },
      {
        label: l.trans({ en: "Workflow only", ko: "워크플로에만 있는 것" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "a plan to review", ko: "검토할 플랜" })}</span>,
            desc: l.trans({
              en: (
                <span>
                  You read what will change, then <code>akan workflow apply</code> writes it.
                </span>
              ),
              ko: (
                <span>
                  무엇이 바뀔지 먼저 읽고, 그다음 <code>akan workflow apply</code>로 씁니다.
                </span>
              ),
            }),
            marks: workflowMarks,
          },
          {
            name: 'surfaces: ["template"]',
            desc: l.trans({
              en: (
                <span>
                  Writes the field into a simple Template form, passed only through MCP <code>plan_workflow</code>.
                </span>
              ),
              ko: (
                <span>
                  단순한 Template 폼에 필드를 넣으며, MCP <code>plan_workflow</code>로만 넘깁니다.
                </span>
              ),
            }),
            marks: workflowMarks,
          },
          {
            name: "includeInLight: true",
            desc: l.trans({
              en: "Adds the field to the Light model too, and is also passed only through MCP.",
              ko: "Light 모델에도 필드를 더하며, 이것도 MCP로만 넘깁니다.",
            }),
            marks: workflowMarks,
          },
          {
            name: "akan workflow validate",
            desc: l.trans({
              en: "Runs sync and lint, plus typecheck after a field change, and sorts failures by cause.",
              ko: "sync와 lint를, 필드를 바꿨다면 typecheck까지 한 번에 실행하고 실패를 원인별로 나눕니다.",
            }),
            marks: workflowMarks,
          },
        ],
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="primitive-cli" title={l.trans({ en: "Primitive CLI", ko: "Primitive 명령" })}>
          <Docs.Title>{l.trans({ en: "Primitive CLI", ko: "Primitive 명령" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Three commands that add one field or one UI file to a module that already exists. They write the mechanical part people get wrong by hand: a dictionary label left out, an import never added, a component in the wrong file.",
                ko: "이미 있는 모듈에 필드 하나나 UI 파일 하나를 더하는 명령 세 가지입니다. 딕셔너리 라벨 누락, 빠뜨린 import, 엉뚱한 파일에 놓인 컴포넌트처럼 손으로 하다 틀리기 쉬운 기계적인 부분을 대신 씁니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    They are the steps the <code>create-ui</code>, <code>add-field</code> and{" "}
                    <code>add-enum-field</code> workflows apply. Run them directly when you already know what you want.
                  </span>
                ),
                ko: (
                  <span>
                    <code>create-ui</code>, <code>add-field</code>, <code>add-enum-field</code> 워크플로가 적용하는 바로
                    그 단계입니다. 무엇을 바꿀지 이미 알고 있다면 직접 실행합니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>

          <Docs.SubSubTitle>{l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

          <Docs.SubSubTitle>{l.trans({ en: "What Each Command Writes", ko: "명령별로 쓰는 파일" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Command", ko: "명령" })}
            columns={[
              { key: "constant", label: "constant", code: true, caption: ".constant.ts" },
              { key: "dictionary", label: "dictionary", code: true, caption: ".dictionary.ts" },
              { key: "ui", label: "UI", code: true, caption: ".tsx" },
            ]}
            groups={fileGroups}
            markLabel={l.trans({ en: "Written", ko: "씀" })}
            emptyLabel={l.trans({ en: "Not touched", ko: "건드리지 않음" })}
          />

          <Docs.SubSubTitle>{l.trans({ en: "Rules All Three Share", ko: "세 명령의 공통 규칙" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            {commonRules.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </Scroll.Slide>
        {commands.flatMap((command) => [
          <Divider key={`${command.name}-divider`} />,
          <CommandReferenceSlide key={command.name} command={command} />,
        ])}
        <Divider />

        <Scroll.Slide
          id="primitive-or-workflow"
          title={l.trans({ en: "Primitive or Workflow", ko: "Primitive와 워크플로 중 무엇을 쓸까" })}
        >
          <Docs.Title>{l.trans({ en: "Primitive or Workflow", ko: "Primitive와 워크플로 중 무엇을 쓸까" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A primitive is one edit you already decided on. A workflow is the same edit, plus a plan you read first, the UI it can also touch, and a validation step after.",
                ko: "primitive는 이미 정한 수정 하나입니다. 워크플로는 같은 수정에 먼저 읽는 플랜, 함께 고칠 수 있는 UI, 뒤이은 검증 단계를 더한 것입니다.",
              })}
            </div>
          </Docs.Description>
          <Docs.Matrix
            type={l.trans({ en: "What you get", ko: "얻는 것" })}
            columns={[
              { key: "primitive", label: "primitive", code: true, caption: "akan add-field" },
              { key: "workflow", label: "workflow", code: true, caption: "akan workflow plan" },
            ]}
            groups={compareGroups}
            markLabel={l.trans({ en: "Included", ko: "포함" })}
            emptyLabel={l.trans({ en: "Not included", ko: "없음" })}
          />

          <Docs.SubSubTitle>{l.trans({ en: "When to Use Which", ko: "언제 무엇을 쓰나" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "Primitive", ko: "Primitive" })}</div>
              <code className={chip}>{"akan add-field --field topping …"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "For a field you add while already working in the module. Two files, one command, no plan; you run sync and lint.",
                  ko: "모듈 안에서 작업하다가 필드를 더할 때 씁니다. 파일 둘, 명령 하나, 플랜 없음이고 sync와 lint는 직접 실행합니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "Workflow", ko: "워크플로" })}</div>
              <code className={chip}>{"akan workflow plan add-field … --out <path>"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "For a change you want to review before it is written. It is the shape agents are told to use.",
                  ko: "쓰기 전에 변경을 검토하고 싶을 때 씁니다. 에이전트에게는 이 방식을 쓰라고 안내합니다.",
                })}
              </div>
            </div>
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid
            items={[
              {
                href: "/references/cli/workflow",
                title: l.trans({ en: "Workflow", ko: "워크플로" }),
                desc: l.trans({
                  en: "The plan, apply, validate and repair chain, and every workflow.",
                  ko: "계획, 적용, 검증, 복구로 이어지는 흐름과 워크플로 목록입니다.",
                }),
              },
              {
                href: "/references/cli/module",
                title: l.trans({ en: "Module", ko: "모듈" }),
                desc: l.trans({
                  en: (
                    <span>
                      Create the module itself with <code>akan create-module</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>akan create-module</code>로 모듈 자체를 만듭니다.
                    </span>
                  ),
                }),
              },
            ]}
          />
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
