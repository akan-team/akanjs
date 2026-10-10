import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const termRows: IntroItem[] = [
    {
      name: "plan",
      desc: l.trans({
        en: "The phases, stages and steps one build runs, as JSON that Akan Cloud executes.",
        ko: "빌드 한 번이 실행할 phase, stage, step을 담은 JSON으로, Akan Cloud가 이것을 실행합니다.",
      }),
    },
    {
      name: "phase",
      desc: l.trans({
        en: "Stages that run together; the next phase starts when every stage of this one ends.",
        ko: "함께 실행되는 stage 묶음입니다. 다음 phase는 이 phase의 stage가 모두 끝나야 시작합니다.",
      }),
    },
    {
      name: "envelope",
      desc: l.trans({
        en: "`{ ok, plan, diagnostics }`, the result `plan` prints or writes to `--out`.",
        ko: "`{ ok, plan, diagnostics }` 형태의 결과로, `plan`이 출력하거나 `--out`에 씁니다.",
      }),
    },
    {
      name: "diagnostic",
      desc: l.trans({
        en: "An error or warning about a definition, with a code such as `pipeline.action.dockerWithoutBuild`.",
        ko: "정의에 대한 오류나 경고로, `pipeline.action.dockerWithoutBuild` 같은 코드가 붙습니다.",
      }),
    },
  ];

  const actionRows = [
    {
      action: "dry-run",
      prints: l.trans({ en: "The plan as a table, phase by phase.", ko: "plan을 phase 순서대로 표로 보여 줍니다." }),
      use: l.trans({ en: "Seeing what a build would run.", ko: "빌드가 무엇을 실행할지 볼 때 씁니다." }),
    },
    {
      action: "validate",
      prints: l.trans({ en: "A one-line verdict and the diagnostics.", ko: "한 줄 판정과 진단을 보여 줍니다." }),
      use: l.trans({ en: "Checking a definition before you push.", ko: "push 전에 정의를 확인할 때 씁니다." }),
    },
    {
      action: "plan",
      prints: l.trans({ en: "The envelope as JSON.", ko: "envelope를 JSON으로 출력합니다." }),
      use: l.trans({ en: "Handing the plan to a program.", ko: "plan을 다른 프로그램에 넘길 때 씁니다." }),
    },
  ];

  const exitRows = [
    {
      code: "0",
      means: l.trans({ en: "A plan was made.", ko: "plan을 만들었습니다." }),
      envelope: l.trans({ en: "Written, `ok: true`.", ko: "씁니다. `ok: true`입니다." }),
    },
    {
      code: "1",
      means: l.trans({ en: "The definition has errors.", ko: "정의에 오류가 있습니다." }),
      envelope: l.trans({
        en: "Written, `ok: false`, with the diagnostics.",
        ko: "씁니다. `ok: false`와 진단이 담깁니다.",
      }),
    },
    {
      code: "2",
      means: l.trans({
        en: "Anything else: not a workspace root, a refused flag, a failed write.",
        ko: "그 밖의 실패입니다. 워크스페이스 루트가 아니거나, 플래그가 잘못됐거나, 쓰기에 실패했습니다.",
      }),
      envelope: l.trans({ en: "Not written.", ko: "쓰지 않습니다." }),
    },
  ];

  const command: CommandReferenceItem = {
    name: "pipeline",
    signature:
      "akan pipeline [plan|validate|dry-run] [--branch <branch>] [--env <env>] [--apps <a,b>] [--trigger <trigger>] [-n <num>] [--commit <sha>] [--out <file>] [--format <text|json>]",
    desc: l.trans({
      en: "Plan the build pipeline declared in the workspace and app `akan.config.ts` files, without running it.\nEach flag is a fact about the build: a flag you give is copied into the plan as is, and a missing one comes from git and the workspace.",
      ko: "워크스페이스와 앱의 `akan.config.ts`에 선언한 빌드 파이프라인을 실행하지 않고 plan만 만듭니다.\n플래그는 빌드에 대한 사실입니다. 준 플래그는 그대로 plan에 들어가고, 빠진 플래그는 git과 워크스페이스에서 채웁니다.",
    }),
    args: [
      {
        name: "action",
        type: "String",
        defaultValue: "dry-run",
        enumOrFlag: "plan | validate | dry-run",
        desc: l.trans({
          en: "`dry-run` shows the plan, `validate` checks it, `plan` prints the envelope.",
          ko: "`dry-run`은 plan을 보여 주고, `validate`는 확인하고, `plan`은 envelope를 출력합니다.",
        }),
      },
    ],
    options: [
      {
        name: "--branch",
        type: "String",
        defaultValue: l.trans({ en: "current git branch", ko: "현재 git 브랜치" }),
        desc: l.trans({
          en: "Branch the build is for; every `when.branch` is decided against it.",
          ko: "빌드할 브랜치로, 모든 `when.branch`를 이 값으로 판정합니다.",
        }),
      },
      {
        name: "--env",
        type: "String",
        defaultValue: l.trans({ en: "the branch", ko: "브랜치 이름" }),
        desc: l.trans({
          en: "`AKAN_PUBLIC_ENV` the build is for.",
          ko: "빌드가 쓸 `AKAN_PUBLIC_ENV`입니다.",
        }),
      },
      {
        name: "--apps",
        type: "String",
        defaultValue: l.trans({ en: "every app", ko: "모든 앱" }),
        desc: l.trans({
          en: "Apps the build covers, comma-separated; an unknown or repeated app is an error.",
          ko: "빌드할 앱을 쉼표로 나열합니다. 없는 앱이나 중복된 앱은 오류입니다.",
        }),
      },
      {
        name: "--trigger",
        type: "String",
        defaultValue: "manual",
        enumOrFlag: "push | redeploy | initial | rebuild | manual",
        desc: l.trans({
          en: "What started the build; every `when.trigger` is decided against it.",
          ko: "빌드를 시작한 계기로, 모든 `when.trigger`를 이 값으로 판정합니다.",
        }),
      },
      {
        name: "--build-num",
        type: "Number",
        defaultValue: "0",
        enumOrFlag: "-n",
        desc: l.trans({
          en: "The build's number, a whole number of 0 or more.",
          ko: "빌드 번호로, 0 이상의 정수입니다.",
        }),
      },
      {
        name: "--commit",
        type: "String",
        defaultValue: "HEAD",
        desc: l.trans({ en: "Commit the build is for.", ko: "빌드할 커밋입니다." }),
      },
      {
        name: "--out",
        type: "String",
        desc: l.trans({
          en: "Also write the envelope to this file, whole or not at all.",
          ko: "envelope를 이 파일에도 씁니다. 전부 쓰거나 아예 쓰지 않습니다.",
        }),
      },
      {
        name: "--format",
        type: "String",
        defaultValue: "text",
        enumOrFlag: "text | json",
        desc: l.trans({
          en: "`json` prints the envelope instead of text, for any action.",
          ko: "`json`이면 어느 action이든 텍스트 대신 envelope를 출력합니다.",
        }),
      },
    ],
    notes: [
      {
        name: l.trans({ en: "nothing runs", ko: "실행하지 않음" }),
        desc: l.trans({
          en: "No stage runs and nothing is uploaded; Akan Cloud runs the same planner when it builds.",
          ko: "stage를 실행하지도, 무엇을 올리지도 않습니다. Akan Cloud가 빌드할 때 같은 planner를 실행합니다.",
        }),
      },
      {
        name: l.trans({ en: "function form", ko: "함수형" }),
        desc: l.trans({
          en: "`validate` runs a function-form `pipeline` for one sample context and warns that others may differ.",
          ko: "`validate`는 함수형 `pipeline`을 예시 context 하나로 실행하고, 다른 경우는 다를 수 있다고 경고합니다.",
        }),
      },
      {
        name: l.trans({ en: "exit code", ko: "종료 코드" }),
        desc: l.trans({
          en: "0 a plan, 1 errors with the envelope written, 2 anything else with no envelope.",
          ko: "0은 plan, 1은 envelope를 쓴 오류, 2는 envelope 없는 그 밖의 실패입니다.",
        }),
      },
    ],
    examples: `akan pipeline dry-run --branch main
akan pipeline validate --apps web,api
akan pipeline plan --branch main --trigger push --out plan.json`,
  };

  return (
    <Scroll>
      <Scroll.Slide id="pipeline-cli" title={l.trans({ en: "Pipeline CLI", ko: "파이프라인 명령" })}>
        <Docs.Title>{l.trans({ en: "Pipeline CLI", ko: "파이프라인 명령" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akan pipeline</code> turns the pipeline declared in your <code>akan.config.ts</code> files into
                  the plan Akan Cloud would run, and runs none of it. Check a change with it before you push.
                </span>
              ),
              ko: (
                <span>
                  <code>akan pipeline</code>은 <code>akan.config.ts</code>에 선언한 파이프라인을 Akan Cloud가 실행할
                  plan으로 바꿀 뿐, 아무것도 실행하지 않습니다. push 전에 바꾼 내용을 이 명령으로 확인합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>

        <Docs.SubSubTitle>{l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
        <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

        <Docs.SubSubTitle>{l.trans({ en: "Three Actions", ko: "세 가지 action" })}</Docs.SubSubTitle>
        <Docs.Table
          columns={[
            { key: "action", label: "action", code: true },
            { key: "prints", label: l.trans({ en: "Prints", ko: "출력" }) },
            { key: "use", label: l.trans({ en: "Use it for", ko: "쓰는 때" }) },
          ]}
          rows={actionRows}
        />

        <Docs.SubSubTitle>{l.trans({ en: "Exit Codes", ko: "종료 코드" })}</Docs.SubSubTitle>
        <Docs.Table
          columns={[
            { key: "code", label: l.trans({ en: "Code", ko: "코드" }), code: true },
            { key: "means", label: l.trans({ en: "Means", ko: "뜻" }) },
            { key: "envelope", label: "envelope" },
          ]}
          rows={exitRows}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: (
              <>
                <strong>Exit code 1 always comes with an envelope.</strong> A program reading <code>--out</code> can
                trust the file whenever the code is 0 or 1, and treat 2 as no plan at all.
              </>
            ),
            ko: (
              <>
                <strong>종료 코드 1에는 항상 envelope가 따라옵니다.</strong> <code>--out</code>을 읽는 프로그램은 코드가
                0이나 1이면 파일을 믿고, 2면 plan이 없다고 보면 됩니다.
              </>
            ),
          })}
        </Docs.Alert>

        <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
        <Docs.LinkGrid
          items={[
            {
              href: "/cheatsheet/dev/pipeline",
              title: l.trans({ en: "Build Pipeline", ko: "빌드 파이프라인" }),
              desc: l.trans({
                en: "Add a test stage, a notification or a secret, step by step.",
                ko: "테스트 stage, 알림, 시크릿을 단계별로 추가합니다.",
              }),
            },
            {
              href: "/docs/core/config#pipeline",
              title: "pipeline",
              desc: l.trans({
                en: "Every key an app's `pipeline` takes.",
                ko: "앱의 `pipeline`이 받는 키를 모두 설명합니다.",
              }),
            },
            {
              href: "/docs/core/config#workspace-config",
              title: l.trans({ en: "Workspace Config", ko: "워크스페이스 설정" }),
              desc: l.trans({
                en: "Stages that run before, after and around every app.",
                ko: "모든 앱의 앞과 뒤, 끝에 실행할 stage를 둡니다.",
              }),
            },
          ]}
        />
      </Scroll.Slide>
      <Divider />
      <CommandReferenceSlide command={command} />
      <DocsToc />
    </Scroll>
  );
});
