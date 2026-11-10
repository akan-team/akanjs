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
    const title = lang === "ko" ? "CLI 레퍼런스: Workflow | Akan.js" : "CLI Reference: Workflow | Akan.js";
    const description =
      lang === "ko"
        ? "파일을 손으로 고치는 대신 모듈 변경을 계획하고 적용하고 검증합니다."
        : "Plan, apply and validate a module change instead of editing files by hand.";
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
        name: l.trans({ en: "workflow", ko: "워크플로" }),
        desc: l.trans({
          en: "A named recipe for a change that always touches the same files in the same order.",
          ko: "필드 추가나 모듈 생성처럼 늘 같은 파일을 같은 순서로 고치는 변경에 붙인 이름입니다.",
        }),
      },
      {
        name: l.trans({ en: "plan file", ko: "플랜 파일" }),
        desc: l.trans({
          en: "The JSON `plan --out` writes: the steps, the files it expects to change, and the checks to run.",
          ko: "`plan --out`이 쓰는 JSON으로, 단계와 바뀔 것으로 예상되는 파일, 돌릴 검증이 담깁니다.",
        }),
      },
      {
        name: l.trans({ en: "run artifact", ko: "실행 기록" }),
        desc: l.trans({
          en: "What an apply, a validate or a repair leaves in `.akan/workflows/runs/<runId>.json`.",
          ko: "적용, 검증, 복구가 끝날 때마다 `.akan/workflows/runs/<runId>.json`에 남기는 기록입니다.",
        }),
      },
      {
        name: "runId",
        desc: l.trans({
          en: "The run artifact's file name, such as `apply-20260921103000-a1b2c3`.",
          ko: "`apply-20260921103000-a1b2c3`처럼 생긴 실행 기록의 파일 이름입니다.",
        }),
      },
      {
        name: "akan repair",
        desc: l.trans({
          en: "A narrow fix for one known kind of failure, picked by `<kind>`.",
          ko: "`<kind>`로 골라 쓰는, 알려진 실패 하나를 위한 좁은 처방입니다.",
        }),
      },
    ];

    const failureRows: IntroItem[] = [
      {
        name: "source-change",
        desc: l.trans({
          en: "`sync`, `lint` or `typecheck` failed on the source; fix it or run a repair.",
          ko: "`sync`, `lint`, `typecheck`가 소스 문제로 실패한 경우로, 소스를 고치거나 복구를 실행합니다.",
        }),
      },
      {
        name: "workspace-config",
        desc: l.trans({
          en: "A workspace configuration, such as the Biome config, failed to load.",
          ko: "Biome 설정 같은 워크스페이스 설정을 불러오지 못한 경우입니다.",
        }),
      },
      {
        name: "environment",
        desc: l.trans({
          en: "The command could not run at all, such as `command not found` (exit code 127).",
          ko: "`command not found`(종료 코드 127)처럼 명령 자체를 실행하지 못한 경우입니다.",
        }),
      },
      {
        name: "unknown",
        desc: l.trans({
          en: "Anything else, including a failed `build`; read the command output in the report.",
          ko: "`build` 실패를 포함한 그 밖의 실패로, 리포트의 명령 출력을 읽어 봅니다.",
        }),
      },
    ];

    const bothModes = l.trans({ en: "plan and apply mode", ko: "plan, apply 모드" });
    const applyMode = l.trans({ en: "apply mode", ko: "apply 모드" });
    const cliOnly = l.trans({ en: "CLI only", ko: "CLI 전용" });
    const mcpRows: IntroItem[] = [
      { name: "akan workflow list", desc: `\`list_workflows\` · ${bothModes}` },
      { name: "akan workflow explain", desc: `\`explain_workflow\` · ${bothModes}` },
      { name: "akan workflow plan", desc: `\`plan_workflow\` · ${bothModes}` },
      { name: "akan workflow apply", desc: `\`apply_workflow\` · ${applyMode}` },
      { name: "akan workflow validate", desc: `\`run_validation\` · ${applyMode}` },
      { name: "akan repair generated", desc: `\`repair_generated\` · ${applyMode}` },
      { name: "akan repair imports", desc: `\`repair_imports\` · ${applyMode}` },
      { name: "akan repair module-shape", desc: `\`repair_module_shape\` · ${applyMode}` },
      { name: ["akan workflow report", "akan repair format", "akan repair dictionary"], desc: cliOnly },
    ];

    const needsLabel = l.trans({ en: "Needs:", ko: "필수 입력:" });
    const catalogueRows: IntroItem[] = [
      {
        name: "create-module",
        desc: `${l.trans({
          en: "A new database-backed domain module, from the constant through the store and UI.",
          ko: "constant부터 store, UI까지 갖춘, DB에 저장되는 새 도메인 모듈입니다.",
        })}\n${needsLabel} \`--app\` \`--module\``,
      },
      {
        name: "create-scalar",
        desc: `${l.trans({
          en: "A reusable value module with no database ownership, such as a value object or shared scalar.",
          ko: "값 객체나 공용 스칼라처럼 DB를 소유하지 않는 재사용 값 모듈입니다.",
        })}\n${needsLabel} \`--app\` \`--scalar\``,
      },
      {
        name: "create-ui",
        desc: `${l.trans({
          en: "One conventional UI file for an existing module.",
          ko: "기존 모듈에 관례에 맞는 UI 파일 하나를 더합니다.",
        })}\n${needsLabel} \`--app\` \`--module\` \`--surface\``,
      },
      {
        name: "add-field",
        desc: `${l.trans({
          en: "A field on the constant and the dictionary, with the Template form flagged for review.",
          ko: "constant와 dictionary에 필드를 더하고, Template 폼은 검토할 곳으로 표시합니다.",
        })}\n${needsLabel} \`--app\` \`--module\` \`--field\` \`--type\``,
      },
      {
        name: "add-enum-field",
        desc: `${l.trans({
          en: "A closed-value field: the enum class, its labels and options, and the field itself.",
          ko: "정해진 값만 받는 필드로, enum 클래스와 라벨·옵션, 필드 자체를 더합니다.",
        })}\n${needsLabel} \`--app\` \`--module\` \`--field\` \`--values\``,
      },
      {
        name: "add-mutation",
        desc: `${l.trans({
          en: "The whole write path: chain method, service, guarded mutation, one-line store action, dictionary, test stubs.",
          ko: "쓰기 경로 전체입니다. chain 메서드, service, 가드를 단 뮤테이션, 한 줄 store 액션, dictionary, 테스트 뼈대를 만듭니다.",
        })}\n${needsLabel} \`--app\` \`--module\` \`--mutation\` \`--guard\``,
      },
      {
        name: "create-interaction",
        desc: `${l.trans({
          en: "A `webkit/use<X>.tsx` hook over a pure `common/<x>.ts` class, with the class's test.",
          ko: "순수 `common/<x>.ts` 클래스 위의 `webkit/use<X>.tsx` 훅과 그 클래스의 테스트입니다.",
        })}\n${needsLabel} \`--app\` \`--interaction\``,
      },
      {
        name: "add-slice",
        desc: `${l.trans({
          en: "A service query and an `init` slice guarded by `None`; it only recommends the page load and Zone.",
          ko: "service 쿼리와 `None` 가드를 단 `init` 슬라이스를 더하고, 페이지 로드와 Zone은 권장만 합니다.",
        })}\n${needsLabel} \`--app\` \`--module\` \`--slice\``,
      },
      {
        name: "rename-key",
        desc: `${l.trans({
          en: "Renames a slice or Filter query key with every name derived from it and its dictionary entry, in the app and every lib.",
          ko: "슬라이스나 Filter 쿼리 키를, 거기서 만들어진 이름 전부와 dictionary 항목까지 앱과 모든 lib에서 함께 바꿉니다.",
        })}\n${needsLabel} \`--app\` \`--module\` \`--slice\` | \`--query\` \`--to\``,
      },
    ];

    const catalogueNotes = [
      l.trans({
        en: (
          <>
            <strong>create-ui plans five surfaces and applies three.</strong> <code>--surface</code> accepts{" "}
            <code>view</code>, <code>unit</code>, <code>template</code>, <code>zone</code> and <code>util</code>; apply
            builds only the first three.
          </>
        ),
        ko: (
          <>
            <strong>create-ui는 다섯 가지를 계획하고 세 가지만 적용합니다.</strong> <code>--surface</code>는{" "}
            <code>view</code>, <code>unit</code>, <code>template</code>, <code>zone</code>, <code>util</code>을 받지만,
            적용은 앞의 셋만 합니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Numbers are Int or Float.</strong> A plan with <code>--type Number</code> carries an error, and a
            plan with an error applies nothing.
          </>
        ),
        ko: (
          <>
            <strong>숫자는 Int나 Float입니다.</strong> <code>--type Number</code>로 만든 플랜에는 오류가 붙고, 오류가
            있는 플랜은 아무것도 적용하지 않습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>A scalar or model type is imported.</strong> <code>--type Address</code> names a scalar or model of
            the target by its class name, and apply imports it into the constant, as it imports <code>Int</code> or{" "}
            <code>ID</code> from <code>akanjs/base</code>. A plan with a type it cannot find, and the constant does not
            import, carries an error.
          </>
        ),
        ko: (
          <>
            <strong>스칼라·모델 타입은 import됩니다.</strong> <code>--type Address</code>처럼 대상의 스칼라나 모델을
            클래스 이름으로 주면, <code>Int</code>나 <code>ID</code>를 <code>akanjs/base</code>에서 가져오듯 적용이 상수
            파일에 import를 넣습니다. 찾을 수 없고 상수 파일이 import하지도 않은 타입으로 만든 플랜에는 오류가 붙습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Defaults follow the type.</strong> <code>--default</code> is converted to match <code>--type</code>,
            and an enum default must be one of <code>--values</code>.
          </>
        ),
        ko: (
          <>
            <strong>기본값은 타입을 따릅니다.</strong> <code>--default</code>는 <code>--type</code>에 맞게 변환되고,
            enum 기본값은 <code>--values</code> 중 하나여야 합니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>add-field can also reach the form and the Light model.</strong> <code>--surfaces template</code>{" "}
            writes the field into a simple Template form and <code>--include-in-light</code> adds it to the Light model.
            Through <code>plan_workflow</code> they are <code>{'surfaces: ["template"]'}</code> and{" "}
            <code>includeInLight: true</code>.
          </>
        ),
        ko: (
          <>
            <strong>add-field는 폼과 Light 모델까지 바꿀 수 있습니다.</strong> <code>--surfaces template</code>를 주면
            단순한 Template 폼에 필드를 넣고, <code>--include-in-light</code>를 주면 Light 모델에도 더합니다.{" "}
            <code>plan_workflow</code>에서는 <code>{'surfaces: ["template"]'}</code>와 <code>includeInLight: true</code>
            입니다.
          </>
        ),
      }),
    ];

    const validationGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "Create", ko: "새로 만들기" }),
        rows: [
          { name: "create-module", marks: { sync: true, lint: true, typecheck: false, build: false } },
          { name: "create-scalar", marks: { sync: true, lint: true, typecheck: false, build: false } },
          { name: "create-ui", marks: { sync: true, lint: true, typecheck: false, build: false } },
          { name: "create-interaction", marks: { sync: true, lint: true, typecheck: false, build: false } },
        ],
      },
      {
        label: l.trans({ en: "Add to a module", ko: "모듈에 더하기" }),
        rows: [
          { name: "add-field", marks: { sync: true, lint: true, typecheck: true, build: false } },
          { name: "add-enum-field", marks: { sync: true, lint: true, typecheck: true, build: false } },
          { name: "add-mutation", marks: { sync: true, lint: true, typecheck: true, build: false } },
          { name: "add-slice", marks: { sync: true, lint: true, typecheck: false, build: true } },
        ],
      },
      {
        label: l.trans({ en: "Rename", ko: "이름 바꾸기" }),
        rows: [{ name: "rename-key", marks: { sync: true, lint: true, typecheck: true, build: true } }],
      },
    ];

    const commands: CommandReferenceItem[] = [
      {
        name: "workflow",
        signature:
          "akan workflow <action> [workflow] [--format <markdown|json>] [--out <path>] [--dry-run <boolean>] [--app <name>] [--module <name>] [--field <name>] [--type <type>] [--values <a,b,c>] [--default <value>] [--scalar <name>] [--surface <name>] [--mutation <name>] [--slice <name>] [--query <name>] [--to <name>]",
        desc: l.trans({
          en: "List, explain, plan, apply, or validate a workflow, or print an earlier run's report.\n`plan` and `explain` never write source. Only `apply` does, and only from a plan file.",
          ko: "워크플로를 나열, 설명, 계획, 적용, 검증하거나 지난 실행의 리포트를 다시 봅니다.\n`plan`과 `explain`은 소스를 쓰지 않습니다. 소스를 쓰는 것은 `apply`뿐이고, 그것도 플랜 파일로만 씁니다.",
        }),
        args: [
          {
            name: "action",
            type: "String",
            required: "yes",
            enumOrFlag: "list | explain | plan | apply | validate | report",
            desc: l.trans({
              en: "What to do. Left out, it is asked for at a prompt.",
              ko: "할 일입니다. 생략하면 프롬프트에서 묻습니다.",
            }),
          },
          {
            name: "workflow",
            type: "String",
            desc: l.trans({
              en: "Needed by every action but `list`. What it names depends on the action; see Notes.",
              ko: "`list`를 뺀 모든 action에 필요합니다. action마다 받는 값은 아래 참고 표에 있습니다.",
            }),
          },
        ],
        options: [
          {
            name: "--format",
            type: "String",
            defaultValue: "markdown",
            enumOrFlag: "markdown | json · -o",
            desc: l.trans({
              en: "`markdown` is for a person; `json` is the report an MCP client receives, alone on stdout, logs on stderr.",
              ko: "`markdown`은 사람이 읽는 형식이고, `json`은 MCP 클라이언트가 받는 리포트로, stdout에는 리포트만, 로그는 stderr로 나갑니다.",
            }),
          },
          {
            name: "--out",
            type: "String",
            enumOrFlag: "-w",
            desc: l.trans({
              en: "`plan` only. Writes the plan JSON here; without it the plan is only printed and cannot be applied.",
              ko: "`plan` 전용입니다. 플랜 JSON을 이 경로에 씁니다. 없으면 화면에 출력만 되어 적용할 수 없습니다.",
            }),
          },
          {
            name: "--dry-run",
            type: "Boolean",
            defaultValue: "false",
            enumOrFlag: "-r",
            desc: l.trans({
              en: "`apply` only. Reports the predicted apply without writing source; the run is still recorded.",
              ko: "`apply` 전용입니다. 소스를 쓰지 않고 예상 결과만 보고하며, 실행 기록은 남습니다.",
            }),
          },
          {
            name: "--app",
            type: "String",
            enumOrFlag: "-a",
            desc: l.trans({
              en: "Plan input: the target app or library. Every workflow requires it.",
              ko: "플랜 입력: 대상 앱이나 라이브러리입니다. 모든 워크플로에 필요합니다.",
            }),
          },
          {
            name: "--module",
            type: "String",
            enumOrFlag: "-m",
            desc: l.trans({
              en: "Plan input: a new module for `create-module`, else an existing database module, never a service or scalar one.",
              ko: "플랜 입력: `create-module`에는 새 모듈, 나머지에는 이미 있는 데이터베이스 모듈이며 서비스·스칼라 모듈은 받지 않습니다.",
            }),
          },
          {
            name: "--field",
            type: "String",
            enumOrFlag: "-f",
            desc: l.trans({
              en: "Plan input for `add-field` and `add-enum-field`: the field name.",
              ko: "`add-field`, `add-enum-field`의 입력: 필드 이름입니다.",
            }),
          },
          {
            name: "--type",
            type: "String",
            enumOrFlag: "-t",
            desc: l.trans({
              en: "Plan input for `add-field`: a field type or scalar name. Use `Int` or `Float`, never `Number`.",
              ko: "`add-field`의 입력: 필드 타입이나 스칼라 이름입니다. `Number` 대신 `Int`나 `Float`를 씁니다.",
            }),
          },
          {
            name: "--values",
            type: "String",
            enumOrFlag: "-l",
            desc: l.trans({
              en: "Plan input for `add-enum-field`, or `add-field` with `--type enum`: comma-separated enum values.",
              ko: "`add-enum-field`, 또는 `--type enum`인 `add-field`의 입력: 쉼표로 구분한 enum 값입니다.",
            }),
          },
          {
            name: "--default",
            type: "String",
            enumOrFlag: "-d",
            desc: l.trans({
              en: "Plan input: the field default, converted by type. An enum default must be one of the values.",
              ko: "플랜 입력: 필드 기본값입니다. 타입에 맞게 변환되고, enum 기본값은 `--values` 중 하나여야 합니다.",
            }),
          },
          {
            name: "--surfaces",
            type: "String",
            enumOrFlag: "template | unit | view · -s",
            desc: l.trans({
              en: "Plan input for `add-field`: comma-separated UI surfaces. `template` is applied, the others reviewed.",
              ko: "`add-field`의 입력: 쉼표로 구분한 UI 표면입니다. `template`은 적용되고 나머지는 검토 항목이 됩니다.",
            }),
          },
          {
            name: "--include-in-light",
            type: "Boolean",
            enumOrFlag: "-p",
            desc: l.trans({
              en: "Plan input for `add-field`: also add the field to the Light model lists and cards read.",
              ko: "`add-field`의 입력: 목록과 카드가 읽는 Light 모델에도 필드를 더합니다.",
            }),
          },
          {
            name: "--scalar",
            type: "String",
            enumOrFlag: "-c",
            desc: l.trans({
              en: "Plan input for `create-scalar`: the scalar name.",
              ko: "`create-scalar`의 입력: 스칼라 이름입니다.",
            }),
          },
          {
            name: "--surface",
            type: "String",
            enumOrFlag: "view | unit | template | zone | util · -u",
            desc: l.trans({
              en: "Plan input for `create-ui`: the UI file to create. `zone` and `util` plan but do not apply.",
              ko: "`create-ui`의 입력: 만들 UI 파일입니다. `zone`과 `util`은 계획만 되고 적용되지 않습니다.",
            }),
          },
          {
            name: "--mutation",
            type: "String",
            enumOrFlag: "-n",
            desc: l.trans({
              en: "Plan input for `add-mutation`: the mutation or action name.",
              ko: "`add-mutation`의 입력: 뮤테이션(액션) 이름입니다.",
            }),
          },
          {
            name: "--guard",
            type: "String",
            enumOrFlag: "-g",
            desc: l.trans({
              en: "Required by `add-mutation`: comma-separated guard classes the target can reach. `None` is refused.",
              ko: "`add-mutation`에 필수입니다. 대상이 쓸 수 있는 가드 클래스를 쉼표로 적습니다. `None`은 거부됩니다.",
            }),
          },
          {
            name: "--with",
            type: "String",
            enumOrFlag: "-b",
            desc: l.trans({
              en: "`add-mutation`: `<serviceRef>.<method>` writes run inside the mutation's `this.transaction()`.",
              ko: "`add-mutation`: 뮤테이션의 `this.transaction()` 안에서 함께 실행할 `<serviceRef>.<method>` 쓰기입니다.",
            }),
          },
          {
            name: "--after",
            type: "String",
            enumOrFlag: "-e",
            desc: l.trans({
              en: "`add-mutation`: `<serviceRef>.<method>` side effects run in `this.afterCommit()`.",
              ko: "`add-mutation`: `this.afterCommit()`에서 실행할 `<serviceRef>.<method>` 부수효과입니다.",
            }),
          },
          {
            name: "--interaction",
            type: "String",
            enumOrFlag: "-k",
            desc: l.trans({
              en: "Plan input for `create-interaction`: a camelCase name, such as `boardKeys`.",
              ko: "`create-interaction`의 입력: `boardKeys`처럼 camelCase 이름입니다.",
            }),
          },
          {
            name: "--slice",
            type: "String",
            enumOrFlag: "-i",
            desc: l.trans({
              en: "Plan input for `add-slice`: the slice or query name. For `rename-key`, the slice key to rename.",
              ko: "`add-slice`의 입력: 슬라이스(쿼리) 이름입니다. `rename-key`에서는 바꿀 슬라이스 키입니다.",
            }),
          },
          {
            name: "--query",
            type: "String",
            enumOrFlag: "-q",
            desc: l.trans({
              en: "Plan input for `rename-key`: the Filter query key to rename, instead of `--slice`.",
              ko: "`rename-key`의 입력: `--slice` 대신 바꿀 Filter 쿼리 키입니다.",
            }),
          },
          {
            name: "--to",
            type: "String",
            enumOrFlag: "-x",
            desc: l.trans({
              en: "Plan input for `rename-key`: the new camelCase key.",
              ko: "`rename-key`의 입력: 새 camelCase 키입니다.",
            }),
          },
        ],
        notes: [
          {
            name: "explain · plan",
            desc: l.trans({
              en: "`workflow` is a name from `akan workflow list`.",
              ko: "`workflow` 인자에 `akan workflow list`에 나오는 이름을 넣습니다.",
            }),
          },
          {
            name: "apply",
            desc: l.trans({
              en: "`workflow` is the `--out` path, not a name; the run lands in `.akan/workflows/runs/<runId>.json`.",
              ko: "`workflow` 인자에 이름이 아니라 `--out`으로 쓴 경로를 넣고, 실행 기록은 `.akan/workflows/runs/<runId>.json`에 남습니다.",
            }),
          },
          {
            name: "validate",
            desc: l.trans({
              en: "`workflow` is a plan path, a run artifact path, or a runId, and validation is recorded as a run too.",
              ko: "`workflow` 인자에 플랜 경로, 실행 기록 경로, runId 중 하나를 넣으며, 검증도 실행 기록을 남깁니다.",
            }),
          },
          {
            name: "report",
            desc: l.trans({
              en: "`workflow` is a runId whose report is printed again, whether apply, dry run, validate or repair.",
              ko: "`workflow` 인자에 runId를 넣으면 적용, dry run, 검증, 복구 어느 것이든 그 리포트를 다시 보여 줍니다.",
            }),
          },
        ],
        examples: `akan workflow list
akan workflow explain add-field
akan workflow plan add-field --app koyo --module icecreamOrder --field topping --type String --out .akan/workflows/plans/topping.json
akan workflow apply .akan/workflows/plans/topping.json --dry-run true
akan workflow apply .akan/workflows/plans/topping.json
akan workflow validate .akan/workflows/runs/apply-20260921103000-a1b2c3.json
akan workflow report apply-20260921103000-a1b2c3`,
      },
      {
        name: "repair",
        signature: "akan repair <kind> [--format <markdown|json>] [--app <name>] [--module <name>] [--target <name>]",
        desc: l.trans({
          en: "Run one narrow repair and print a structured report. Each kind is a known remedy for a known problem.\n`dictionary` and `module-shape` change nothing: they read `akan doctor --strict`, keep your module's findings, and name the command that fixes them.",
          ko: "좁은 범위의 복구 하나를 실행하고 구조화된 리포트를 출력합니다. kind마다 알려진 문제에 대한 정해진 처방이 있습니다.\n`dictionary`와 `module-shape`는 아무것도 고치지 않습니다. `akan doctor --strict` 결과에서 해당 모듈 항목만 골라, 고칠 명령을 알려 줍니다.",
        }),
        args: [
          {
            name: "kind",
            type: "String",
            required: "yes",
            enumOrFlag: "generated | format | imports | dictionary | module-shape",
            desc: l.trans({
              en: "Which repair to run. What each one does is in Notes.",
              ko: "실행할 복구 종류입니다. 각각 하는 일은 아래 참고 표에 있습니다.",
            }),
          },
        ],
        options: [
          {
            name: "--format",
            type: "String",
            defaultValue: "markdown",
            enumOrFlag: "markdown | json · -o",
            desc: l.trans({
              en: "Output format. `json` is what an MCP client receives.",
              ko: "출력 형식입니다. `json`은 MCP 클라이언트가 받는 형식입니다.",
            }),
          },
          {
            name: "--app",
            type: "String",
            enumOrFlag: "-a",
            desc: l.trans({
              en: "Target app or library. Required by `generated`, `dictionary` and `module-shape`.",
              ko: "대상 앱이나 라이브러리입니다. `generated`, `dictionary`, `module-shape`에 필요합니다.",
            }),
          },
          {
            name: "--module",
            type: "String",
            enumOrFlag: "-m",
            desc: l.trans({
              en: "Target module. Required by `dictionary` and `module-shape`.",
              ko: "대상 모듈입니다. `dictionary`, `module-shape`에 필요합니다.",
            }),
          },
          {
            name: "--target",
            type: "String",
            enumOrFlag: "-t",
            desc: l.trans({
              en: "Target app, library or package. Required by `format` and `imports`.",
              ko: "대상 앱, 라이브러리, 패키지입니다. `format`, `imports`에 필요합니다.",
            }),
          },
        ],
        notes: [
          {
            name: "generated",
            desc: l.trans({ en: "Runs `akan sync <app>`.", ko: "`akan sync <app>`을 실행합니다." }),
          },
          {
            name: "format · imports",
            desc: l.trans({
              en: "Both run `akan lint <target>`; the kind only labels what the report is about.",
              ko: "둘 다 `akan lint <target>`을 실행하며, kind는 리포트가 무엇에 관한 것인지 표시할 뿐입니다.",
            }),
          },
          {
            name: "dictionary",
            desc: l.trans({
              en: "Report only: finds missing dictionary labels and points at `akan add-field`.",
              ko: "고치지 않고 보고만 하며, 빠진 딕셔너리 라벨을 찾아 `akan add-field`를 알려 줍니다.",
            }),
          },
          {
            name: "module-shape",
            desc: l.trans({
              en: "Report only: finds a malformed module or a missing abstract and points at `akan create-module`.",
              ko: "고치지 않고 보고만 하며, 모양이 어긋난 모듈이나 빠진 abstract를 찾아 `akan create-module`을 알려 줍니다.",
            }),
          },
          {
            name: l.trans({ en: "afterwards", ko: "그다음" }),
            desc: l.trans({
              en: "Every repair is recorded as a run and suggests `akan doctor --strict --format json` next.",
              ko: "모든 복구는 실행 기록을 남기고, 다음 단계로 `akan doctor --strict --format json`을 권합니다.",
            }),
          },
          {
            name: l.trans({ en: "over MCP", ko: "MCP에서" }),
            desc: l.trans({
              en: "Apply mode serves `repair_generated`, `repair_imports`, `repair_module_shape`; others are CLI-only.",
              ko: "apply 모드가 `repair_generated`, `repair_imports`, `repair_module_shape`를 제공하고, 나머지는 CLI 전용입니다.",
            }),
          },
        ],
        examples: `akan repair generated --app koyo
akan repair format --target koyo
akan repair imports --target koyo
akan repair module-shape --app koyo --module icecreamOrder
akan repair dictionary --app koyo --module icecreamOrder --format json`,
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="workflow-cli" title={l.trans({ en: "Workflow CLI", ko: "워크플로 CLI" })}>
          <Docs.Title>{l.trans({ en: "Workflow CLI", ko: "워크플로 CLI" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Adding one field to a module touches five files, and most of that work is mechanical. By hand, the decisions that matter — the name, the type, the default — get lost among dictionary labels and generated barrel files, and no two modules end up quite alike.",
                ko: "모듈에 필드 하나를 더하는 일도 파일 다섯 개를 건드리고, 그 대부분은 기계적인 작업입니다. 손으로 하면 이름, 타입, 기본값처럼 정작 중요한 결정이 딕셔너리 라벨과 자동 생성 파일 사이에 묻히고, 모듈마다 모양이 조금씩 달라집니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    A workflow gives that change a name: you plan it, read the plan, apply it, and validate the result.
                    When validation fails, <code>akan repair</code> runs the one command that clears that failure.
                  </span>
                ),
                ko: (
                  <span>
                    워크플로는 이런 변경에 이름을 붙인 것입니다. 계획하고, 계획을 읽고, 적용하고, 결과를 검증합니다.
                    검증이 실패하면 <code>akan repair</code>가 그 실패를 해소하는 명령 하나를 실행합니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.Alert>
            {l.trans({
              en: (
                <span>
                  <strong>Reach for a workflow before a direct edit.</strong> When a workflow or a repair can make the
                  change, use it instead of editing source by hand.
                </span>
              ),
              ko: (
                <span>
                  <strong>직접 고치기 전에 워크플로부터 찾으세요.</strong> 워크플로나 복구로 할 수 있는 변경이라면
                  소스를 손으로 고치지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="plan-apply-loop" title={l.trans({ en: "Plan, Apply, Validate", ko: "계획, 적용, 검증" })}>
          <Docs.Title>{l.trans({ en: "Plan, Apply, Validate", ko: "계획, 적용, 검증" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "The steps form one chain, and each hands the next a file path rather than a name. That makes the plan a document you review before anything is written, and the run artifact a record of what happened.",
                ko: "네 단계는 한 줄로 이어지고, 각 단계는 다음 단계에 이름이 아니라 파일 경로를 넘깁니다. 그래서 플랜은 아무것도 쓰기 전에 검토하는 문서가 되고, 실행 기록은 무슨 일이 있었는지 보여 주는 기록이 됩니다.",
              })}
            </div>
          </Docs.Description>
          <Docs.Flow
            title={l.trans({ en: "Workflow chain", ko: "워크플로 흐름" })}
            nodes={{
              plan: { label: l.trans({ en: "Plan", ko: "계획" }), lines: ["workflow plan --out"] },
              apply: { label: l.trans({ en: "Apply", ko: "적용" }), lines: ["workflow apply"], tone: "primary" },
              validate: { label: l.trans({ en: "Validate", ko: "검증" }), lines: ["workflow validate"] },
              repair: { label: l.trans({ en: "Repair", ko: "복구" }), lines: ["akan repair"] },
            }}
            edges={[
              ["plan", "apply", { label: l.trans({ en: "plan JSON", ko: "플랜 JSON" }) }],
              ["apply", "validate", { label: "runId" }],
              ["validate", "repair", { label: l.trans({ en: "on failure", ko: "실패 시" }), dashed: true }],
            ]}
            emphasis={["apply"]}
          />
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "1. Plan", ko: "1. 계획" })}</div>
              <code className={chip}>{"akan workflow plan <workflow> … --out <path>"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "Checks your inputs against the target's source and writes the plan JSON: the steps, the files it expects to change, and the checks to run. It reads source but never writes it, and exits 1 when the plan has an error.",
                  ko: "입력값을 대상의 소스와 대조해 확인하고 플랜 JSON을 씁니다. 단계, 바뀔 파일 예상, 이후 돌릴 검증이 담기며, 소스를 읽기만 하고 쓰지는 않습니다. 플랜에 오류가 있으면 종료 코드 1로 끝납니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "2. Apply", ko: "2. 적용" })}</div>
              <code className={chip}>{"akan workflow apply <planPath>"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: "Takes the plan file, not a workflow name, and writes the source changes. A plan with an error, such as a missing input, applies nothing, and its dry run lists no changes. A failed apply or dry run exits 1.",
                  ko: "워크플로 이름이 아니라 플랜 파일을 받아 소스를 고칩니다. 입력이 빠진 것처럼 오류가 있는 플랜은 아무것도 적용하지 않고, 그 dry run도 바뀔 파일을 내놓지 않습니다. 적용이나 dry run이 실패하면 종료 코드 1로 끝납니다.",
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "3. Validate", ko: "3. 검증" })}</div>
              <code className={chip}>{"akan workflow validate <runId | path>"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: (
                    <span>
                      Runs the checks the plan asked for — <code>sync</code>, <code>lint</code>, <code>typecheck</code>{" "}
                      or <code>build</code> — and sorts each failure by cause. It exits 1 when the status is{" "}
                      <code>failed</code>, but 0 when every failure left is a known baseline blocker (
                      <code>passed-with-baseline-blockers</code>).
                    </span>
                  ),
                  ko: (
                    <span>
                      플랜이 요구한 검증(<code>sync</code>, <code>lint</code>, <code>typecheck</code>,{" "}
                      <code>build</code>
                      )을 돌리고, 실패를 원인별로 분류합니다. 상태가 <code>failed</code>이면 종료 코드 1로 끝나지만,
                      남은 실패가 모두 알려진 기준선 문제(<code>passed-with-baseline-blockers</code>)라면 0으로
                      끝납니다.
                    </span>
                  ),
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">{l.trans({ en: "4. Repair", ko: "4. 복구" })}</div>
              <code className={chip}>{"akan repair <kind>"}</code>
              <div className="mt-2 text-foreground/70 text-sm">
                {l.trans({
                  en: (
                    <span>
                      The remedy for that cause. <code>generated</code> re-syncs, <code>format</code> and{" "}
                      <code>imports</code> re-lint, and the two report-only kinds name the command that fixes the
                      module.
                    </span>
                  ),
                  ko: (
                    <span>
                      그 원인에 맞는 처방입니다. <code>generated</code>는 다시 sync하고, <code>format</code>과{" "}
                      <code>imports</code>는 다시 lint하며, 보고만 하는 두 종류는 모듈을 고칠 명령을 알려 줍니다.
                    </span>
                  ),
                })}
              </div>
            </div>
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "How Validate Sorts a Failure", ko: "검증 실패의 분류" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Cause", ko: "원인" })} items={failureRows} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Known failures are marked.</strong> A config or environment failure seen on an earlier run
                    is flagged as a known baseline blocker, unrelated to your change.
                  </>
                ),
                ko: (
                  <>
                    <strong>이미 본 실패는 표시됩니다.</strong> 이전 실행에서도 났던 설정·환경 실패는 알려진 기준선
                    문제(baseline blocker)로 표시되어, 이번 변경과 무관하다는 것을 알려 줍니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Doctor findings ride along.</strong> The report adds <code>akan doctor --strict</code>{" "}
                    findings, split into what your change touched and what was already there. The CLI shows the second
                    group only as counts per code.
                  </>
                ),
                ko: (
                  <>
                    <strong>doctor 결과도 함께 옵니다.</strong> 리포트에는 <code>akan doctor --strict</code> 결과가
                    붙는데, 이번 변경이 건드린 것과 원래 있던 것으로 나뉩니다. CLI에서는 원래 있던 것을 코드별 개수로만
                    보여 줍니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Over MCP", ko: "MCP에서 부르기" })}</Docs.SubSubTitle>
          <div className="my-2">
            {l.trans({
              en: (
                <span>
                  <code>akan mcp</code> serves the same steps as tools. Plan mode reads and plans; apply mode can also
                  write.
                </span>
              ),
              ko: (
                <span>
                  <code>akan mcp</code>는 같은 단계를 툴로 제공합니다. plan 모드는 읽고 계획만 하고, apply 모드는
                  쓰기까지 합니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Command", ko: "명령" })}
            descLabel={l.trans({ en: "MCP tool · mode", ko: "MCP 툴 · 모드" })}
            items={mcpRows}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>plan_workflow always stores its plan.</strong> Without <code>out</code> it writes to{" "}
                    <code>.akan/workflows/plans/</code> under a name built from the workflow and its inputs, such as{" "}
                    <code>add-field-koyo-icecreamorder-topping.json</code>. It returns that <code>planPath</code> for{" "}
                    <code>apply_workflow</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>plan_workflow는 플랜을 항상 파일로 남깁니다.</strong> <code>out</code>이 없으면 워크플로
                    이름과 입력값으로 지은 이름(예: <code>add-field-koyo-icecreamorder-topping.json</code>)으로{" "}
                    <code>.akan/workflows/plans/</code>에 씁니다. 그 경로를 <code>apply_workflow</code>에 넘길{" "}
                    <code>planPath</code>로 돌려줍니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="workflow-catalogue" title={l.trans({ en: "Workflow Catalogue", ko: "워크플로 목록" })}>
          <Docs.Title>{l.trans({ en: "Workflow Catalogue", ko: "워크플로 목록" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Eight workflows ship with the CLI. <code>akan workflow list</code> prints each with when to use it,
                    and <code>{"akan workflow explain <name>"}</code> adds its inputs, steps and validation commands.
                  </span>
                ),
                ko: (
                  <span>
                    CLI에는 워크플로 여덟 개가 들어 있습니다. <code>akan workflow list</code>는 각각을 언제 쓰는지 보여
                    주고, <code>{"akan workflow explain <name>"}</code>은 입력, 단계, 검증 명령까지 보여 줍니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    With <code>--format json</code>, explain also carries the predicted changes and the completion
                    criteria.
                  </span>
                ),
                ko: (
                  <span>
                    <code>--format json</code>을 주면 예상 변경과 완료 기준까지 함께 나옵니다.
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Docs.IntroTable type={l.trans({ en: "Workflow", ko: "워크플로" })} items={catalogueRows} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            {catalogueNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "What Validate Runs", ko: "검증이 실행하는 명령" })}</Docs.SubSubTitle>
          <div className="my-2">
            {l.trans({
              en: (
                <span>
                  Each workflow fixes the commands <code>validate</code> runs against its <code>--app</code>.
                </span>
              ),
              ko: (
                <span>
                  워크플로마다 <code>validate</code>가 <code>--app</code> 대상으로 실행할 명령이 정해져 있습니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Workflow", ko: "워크플로" })}
            columns={[
              { key: "sync", label: "sync", code: true },
              { key: "lint", label: "lint", code: true },
              { key: "typecheck", label: "typecheck", code: true },
              { key: "build", label: "build", code: true },
            ]}
            groups={validationGroups}
            markLabel={l.trans({ en: "Run by validate", ko: "validate가 실행" })}
            emptyLabel={l.trans({ en: "Not run", ko: "실행 안 함" })}
          />

          <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid
            items={[
              {
                href: "/references/cli/primitive",
                title: l.trans({ en: "Primitive Commands", ko: "Primitive 명령" }),
                desc: l.trans({
                  en: "The commands a workflow applies through. You can also run them directly.",
                  ko: "워크플로가 적용할 때 쓰는 명령입니다. 직접 실행할 수도 있습니다.",
                }),
              },
              {
                href: "/references/cli/context",
                title: "akan mcp",
                desc: l.trans({
                  en: "Serves workflows and repairs to an agent as MCP tools.",
                  ko: "워크플로와 복구를 MCP 툴로 에이전트에게 제공합니다.",
                }),
              },
            ]}
          />
        </Scroll.Slide>
        {commands.flatMap((command) => [
          <Divider key={`${command.name}-divider`} />,
          <CommandReferenceSlide key={command.name} command={command} />,
        ])}
        <DocsToc />
      </Scroll>
    );
  });
