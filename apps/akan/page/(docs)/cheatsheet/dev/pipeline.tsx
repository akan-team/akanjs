import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const termRows = [
    {
      name: "stage",
      desc: l.trans({
        en: "One named step of a build, such as a test run, with one or more shell commands.",
        ko: "테스트 실행처럼 이름이 붙은 빌드의 한 단계로, 셸 명령을 하나 이상 담습니다.",
      }),
    },
    {
      name: ["build", "docker", "deploy"],
      desc: l.trans({
        en: "The built-in actions Akan Cloud runs for an app; you place them with `{ use }`.",
        ko: "Akan Cloud가 앱마다 실행하는 내장 액션으로, `{ use }`로 위치를 정합니다.",
      }),
    },
    {
      name: "plan",
      desc: l.trans({
        en: "What one build runs, made from your config; `akan pipeline` shows it locally.",
        ko: "설정으로 만든, 빌드 한 번이 실행할 내용입니다. `akan pipeline`으로 로컬에서 봅니다.",
      }),
    },
  ];

  const files = [
    {
      title: l.trans({ en: "App", ko: "앱" }),
      path: "apps/<app>/akan.config.ts",
      desc: l.trans({
        en: "That app's stages in order, its three actions included.",
        ko: "그 앱의 stage를 순서대로 적으며, 세 액션도 함께 적습니다.",
      }),
    },
    {
      title: l.trans({ en: "Workspace", ko: "워크스페이스" }),
      path: "akan.config.ts",
      desc: l.trans({
        en: "Stages before and after every app, and the steps that close a build.",
        ko: "모든 앱의 앞뒤에 실행할 stage와 빌드를 마무리할 step입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Build Pipeline", ko: "빌드 파이프라인" })}>
        <Docs.Title>{l.trans({ en: "Build Pipeline", ko: "빌드 파이프라인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Akan Cloud builds and deploys each app as <code>build</code>, <code>docker</code>, then{" "}
                  <code>deploy</code>. Add your own stages around them in <code>akan.config.ts</code>, and check the
                  result with <code>akan pipeline dry-run</code> before you push.
                </span>
              ),
              ko: (
                <span>
                  Akan Cloud는 앱마다 <code>build</code>, <code>docker</code>, <code>deploy</code> 순서로 빌드하고
                  배포합니다. 그 앞뒤에 넣을 stage는 <code>akan.config.ts</code>에 적고, push하기 전에{" "}
                  <code>akan pipeline dry-run</code>으로 결과를 확인합니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Two files", ko: "두 개의 파일" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {files.map((file) => (
              <div key={file.path} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{file.title}</div>
                <div className="text-foreground/70 text-sm">{file.desc}</div>
                <code className={chip}>{file.path}</code>
              </div>
            ))}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Steps", ko: "순서" })}</Docs.SubSubTitle>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              <Link href="#app-stage" className="text-primary">
                {l.trans({ en: "Add a stage to an app.", ko: "앱에 stage를 추가합니다." })}
              </Link>
            </li>
            <li>
              <Link href="#workspace-stage" className="text-primary">
                {l.trans({ en: "Run steps around every app.", ko: "모든 앱의 앞뒤에 step을 실행합니다." })}
              </Link>
            </li>
            <li>
              <Link href="#secret" className="text-primary">
                {l.trans({ en: "Give a step a secret.", ko: "step에 시크릿을 줍니다." })}
              </Link>
            </li>
            <li>
              <Link href="#check" className="text-primary">
                {l.trans({ en: "Check the plan before you push.", ko: "push하기 전에 plan을 확인합니다." })}
              </Link>
            </li>
          </ol>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="app-stage" title={l.trans({ en: "Add A Stage To An App", ko: "앱에 stage 추가하기" })}>
        <Docs.Title>{l.trans({ en: "Add A Stage To An App", ko: "앱에 stage 추가하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Declare <code>pipeline</code> in the app's config. The list replaces the default, so write the three
                  actions with your stage where it belongs:
                </span>
              ),
              ko: (
                <span>
                  앱 설정에 <code>pipeline</code>을 선언합니다. 이 목록이 기본값을 대신하므로, 세 액션을 적고 그 사이
                  알맞은 자리에 stage를 넣습니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/web/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  pipeline: {
    stages: [
      { use: "build" },
      { name: "Test", sh: "bun run akan test web" },
      { use: "docker" },
      { use: "deploy" },
    ],
  },
};

export default config;`}
        />
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>The position decides the moment.</strong> Test sits after <code>build</code>, so it runs once
                  every app has built and before any image is made.
                </span>
              ),
              ko: (
                <span>
                  <strong>자리가 실행 시점을 정합니다.</strong> Test는 <code>build</code> 뒤에 있으므로, 모든 앱의
                  빌드가 끝난 뒤 이미지를 만들기 전에 실행됩니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Run it only sometimes.</strong> <code>{'when: { branch: "main" }'}</code> or{" "}
                  <code>{'when: { changed: ["apps/web/**"] }'}</code> runs a stage only on that branch or after those
                  paths change.
                </span>
              ),
              ko: (
                <span>
                  <strong>필요할 때만 실행합니다.</strong> <code>{'when: { branch: "main" }'}</code>이나{" "}
                  <code>{'when: { changed: ["apps/web/**"] }'}</code>를 쓰면 그 브랜치에서만, 또는 그 경로가 바뀐 뒤에만
                  stage를 실행합니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Let a check fail softly.</strong> <code>allowFailure: true</code> keeps a failing stage from
                  failing the build.
                </span>
              ),
              ko: (
                <span>
                  <strong>실패해도 되는 검사가 있습니다.</strong> <code>allowFailure: true</code>를 쓰면 그 stage가
                  실패해도 빌드는 실패하지 않습니다.
                </span>
              ),
            })}
          </li>
        </ul>
        <div>
          {l.trans({
            en: (
              <span>
                Every stage and step key is in{" "}
                <Link href="/docs/core/config#pipeline" className="text-primary">
                  App Config › Pipeline
                </Link>
                .
              </span>
            ),
            ko: (
              <span>
                stage와 step의 키는{" "}
                <Link href="/docs/core/config#pipeline" className="text-primary">
                  앱 설정 › 파이프라인
                </Link>
                에 모두 있습니다.
              </span>
            ),
          })}
        </div>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="workspace-stage"
        title={l.trans({ en: "Run Steps Around Every App", ko: "모든 앱의 앞뒤에 step 실행하기" })}
      >
        <Docs.Title>{l.trans({ en: "Run Steps Around Every App", ko: "모든 앱의 앞뒤에 step 실행하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Work that belongs to no single app, such as a workspace lint, an end-to-end suite or a chat
                  notification, goes in the workspace root's <code>akan.config.ts</code>:
                </span>
              ),
              ko: (
                <span>
                  워크스페이스 전체 lint, end-to-end 테스트, 채팅 알림처럼 어느 한 앱의 것이 아닌 일은 워크스페이스
                  루트의 <code>akan.config.ts</code>에 둡니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="akan.config.ts"
          code={`import type { WorkspaceConfig } from "akanjs";

const config: WorkspaceConfig = {
  pipeline: {
    before: [{ name: "Lint", sh: "bun run lint" }],
    after: [
      {
        name: "E2E",
        matrix: "apps",
        sh: "bun run e2e $AKAN_CI_APP",
        allowFailure: true,
      },
    ],
    post: {
      failure: [
        {
          name: "Notify",
          sh: "./scripts/notify.sh",
          secrets: ["DISCORD_WEBHOOK"],
        },
      ],
    },
  },
};

export default config;`}
        />
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>before</code> runs first, <code>after</code> runs last.
                  </strong>{" "}
                  A <code>before</code> stage runs ahead of every app stage, and an <code>after</code> stage behind
                  every app's last one.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>before</code>는 맨 처음, <code>after</code>는 맨 끝에 실행됩니다.
                  </strong>{" "}
                  <code>before</code> stage는 모든 앱 stage보다 먼저, <code>after</code> stage는 모든 앱의 마지막 stage
                  뒤에 실행됩니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>{'matrix: "apps"'}</code> copies a stage per app.
                  </strong>{" "}
                  Each copy sees its app in <code>$AKAN_CI_APP</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>{'matrix: "apps"'}</code>는 앱마다 stage를 하나씩 복사합니다.
                  </strong>{" "}
                  복사본마다 <code>$AKAN_CI_APP</code>에 자기 앱 이름이 들어갑니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>post</code> follows the result.
                  </strong>{" "}
                  The steps under <code>success</code>, <code>failure</code> or <code>canceled</code> run for how the
                  build ended, then those under <code>always</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>post</code>는 결과를 따릅니다.
                  </strong>{" "}
                  빌드가 끝난 결과에 따라 <code>success</code>, <code>failure</code>, <code>canceled</code> 중 하나의
                  step을 실행하고, 이어서 <code>always</code>의 step을 실행합니다.
                </span>
              ),
            })}
          </li>
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="secret" title={l.trans({ en: "Give A Step A Secret", ko: "step에 시크릿 주기" })}>
        <Docs.Title>{l.trans({ en: "Give A Step A Secret", ko: "step에 시크릿 주기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A step reads a credential, such as a webhook URL, as an environment variable. Upload it once from the workspace root:",
              ko: "step은 webhook URL 같은 자격 증명을 환경변수로 읽습니다. 워크스페이스 루트에서 한 번 올려 둡니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="bash"
          title="Terminal"
          code={`akan upload-secret DISCORD_WEBHOOK
akan list-secrets`}
        />
        <div>
          {l.trans({
            en: (
              <span>
                Then name it in the step's <code>secrets</code>, as the <code>Notify</code> step above does, and read{" "}
                <code>$DISCORD_WEBHOOK</code> in the script.
              </span>
            ),
            ko: (
              <span>
                그다음 위의 <code>Notify</code> step처럼 step의 <code>secrets</code>에 이름을 적고, 스크립트에서{" "}
                <code>$DISCORD_WEBHOOK</code>를 읽습니다.
              </span>
            ),
          })}
        </div>
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>The value is write-only.</strong> It comes from a hidden prompt, piped stdin or{" "}
                  <code>--file</code>, and no command shows it again.
                </span>
              ),
              ko: (
                <span>
                  <strong>값은 쓰기 전용입니다.</strong> 숨김 입력, 파이프로 넘긴 stdin, <code>--file</code> 중 하나로
                  받고, 어떤 명령으로도 다시 볼 수 없습니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>A branch can have its own value.</strong> <code>--branch main</code> sets one that only{" "}
                  <code>main</code> builds use, over the every-branch value.
                </span>
              ),
              ko: (
                <span>
                  <strong>브랜치마다 다른 값을 둘 수 있습니다.</strong> <code>--branch main</code>으로 올린 값은{" "}
                  <code>main</code> 빌드에서만, 모든 브랜치용 값보다 우선해 쓰입니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Only the steps that ask get it.</strong> A step without the name in <code>secrets</code> never
                  sees the value.
                </span>
              ),
              ko: (
                <span>
                  <strong>요청한 step만 받습니다.</strong> <code>secrets</code>에 그 이름이 없는 step은 값을 볼 수
                  없습니다.
                </span>
              ),
            })}
          </li>
        </ul>
        <Docs.Alert type="warning">
          {l.trans({
            en: (
              <>
                <strong>Anyone who can push to the repository can read a secret.</strong> A step they add can print it,
                the same model as GitHub Actions secrets, so treat push access as access to every secret.
              </>
            ),
            ko: (
              <>
                <strong>저장소에 push할 수 있는 사람은 시크릿을 읽을 수 있습니다.</strong> 그 사람이 추가한 step이 값을
                출력할 수 있기 때문입니다. GitHub Actions 시크릿과 같은 모델이므로, push 권한을 모든 시크릿에 대한
                권한으로 여기세요.
              </>
            ),
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="check" title={l.trans({ en: "Check Before You Push", ko: "push 전에 확인하기" })}>
        <Docs.Title>{l.trans({ en: "Check Before You Push", ko: "push 전에 확인하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akan pipeline</code> makes the same plan Akan Cloud would, from the same files, and runs
                  nothing:
                </span>
              ),
              ko: (
                <span>
                  <code>akan pipeline</code>은 같은 파일로 Akan Cloud와 같은 plan을 만들 뿐, 아무것도 실행하지 않습니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="bash"
          title="Terminal"
          code={`akan pipeline dry-run --branch main
# plan v1 · branch main · env main · trigger manual · apps api, web
# from akan.config.ts, apps/api/akan.config.ts (default), apps/web/akan.config.ts
#
# prepare  (executor)                 checkout · env · install · plan
# prepare  lint          Lint         bun run lint
# build    build         Build        ‖ api · web
# verify   after-build   After build  web:Test  bun run akan test web
# package  docker        Docker       ‖ api · web
# deploy   deploy        Deploy       → api, web (one at a time)
# finish   e2e           E2E          ‖ api (may fail) · web (may fail)
# finish   post.failure               Notify
# finish   (executor)                 cleanup
#
# secrets required: DISCORD_WEBHOOK`}
        />
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>validate</code> lists what is wrong.
                  </strong>{" "}
                  Each error or warning names its file and a code such as{" "}
                  <code>pipeline.action.dockerWithoutBuild</code>, and errors end the command with code 1.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>validate</code>는 잘못된 곳을 알려 줍니다.
                  </strong>{" "}
                  오류와 경고마다 파일과 <code>pipeline.action.dockerWithoutBuild</code> 같은 코드가 붙고, 오류가 있으면
                  종료 코드 1로 끝납니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Flags stand in for the build.</strong> <code>--branch</code>, <code>--apps</code> and{" "}
                  <code>--trigger</code> show what a given build would run; see the{" "}
                  <Link href="/references/cli/pipeline" className="text-primary">
                    Pipeline CLI
                  </Link>
                  .
                </span>
              ),
              ko: (
                <span>
                  <strong>플래그로 빌드를 가정합니다.</strong> <code>--branch</code>, <code>--apps</code>,{" "}
                  <code>--trigger</code>로 특정 빌드가 무엇을 실행할지 봅니다. 자세한 내용은{" "}
                  <Link href="/references/cli/pipeline" className="text-primary">
                    파이프라인 명령
                  </Link>
                  에 있습니다.
                </span>
              ),
            })}
          </li>
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="pitfalls" title={l.trans({ en: "Pitfalls", ko: "주의할 점" })}>
        <Docs.Title>{l.trans({ en: "Pitfalls", ko: "주의할 점" })}</Docs.Title>
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>The list is the whole pipeline.</strong> An app whose <code>pipeline</code> leaves out{" "}
                  <code>{'{ use: "deploy" }'}</code> builds but never deploys.
                </span>
              ),
              ko: (
                <span>
                  <strong>목록이 파이프라인 전부입니다.</strong> <code>pipeline</code>에{" "}
                  <code>{'{ use: "deploy" }'}</code>를 빠뜨린 앱은 빌드만 하고 배포하지 않습니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>App stages stand on their own.</strong> Never rely on what a root <code>before</code> stage
                  left on disk: an app built from a repository mirrored out of this workspace (a subspace) carries only
                  its own config, so the root stages do not run there.
                </span>
              ),
              ko: (
                <span>
                  <strong>앱 stage는 스스로 완결돼야 합니다.</strong> 루트 <code>before</code> stage가 디스크에 남긴
                  것에 기대지 마세요. 이 워크스페이스에서 미러링한 저장소(subspace)에서 빌드하는 앱은 자기 설정만
                  가져가므로, 그곳에서는 루트 stage가 실행되지 않습니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>A subspace lacks root-only paths.</strong> A stage that calls a script kept only at the
                  workspace root, such as <code>scripts/</code> or <code>infra/</code>, fails there; keep what an app
                  stage needs inside the app or its libraries.
                </span>
              ),
              ko: (
                <span>
                  <strong>subspace에는 루트에만 있는 경로가 없습니다.</strong> <code>scripts/</code>나{" "}
                  <code>infra/</code>처럼 워크스페이스 루트에만 둔 스크립트를 부르는 stage는 그곳에서 실패합니다. 앱
                  stage가 쓰는 파일은 앱이나 그 라이브러리 안에 둡니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Secrets belong to one project.</strong> A subspace builds in a project of its own, so upload
                  the secrets its steps read to that project as well.
                </span>
              ),
              ko: (
                <span>
                  <strong>시크릿은 프로젝트 하나에 속합니다.</strong> subspace는 자기 프로젝트에서 빌드하므로, 그곳의
                  step이 읽는 시크릿은 그 프로젝트에도 올려야 합니다.
                </span>
              ),
            })}
          </li>
        </ul>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
