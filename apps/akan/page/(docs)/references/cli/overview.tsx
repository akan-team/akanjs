import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();

  const cliGroups = [
    {
      title: "Workspace",
      href: "/references/cli/workspace",
      commands: ["create-workspace <workspaceName> --app <app>", "lint <target>", "lint-all", "sync-all"],
      desc: l.trans({
        en: "Create a workspace and keep repository-wide generated surfaces synchronized.",
        ko: "workspace를 생성하고 repository 전체 generated surface를 동기화합니다.",
      }),
    },
    {
      title: "Application",
      href: "/references/cli/application",
      commands: [
        "create-application <appName>",
        "remove-application <app>",
        "sync <system>",
        "script <app> [filename]",
        "console <app>",
        "build <app>",
        "typecheck <app>",
        "test <target>",
        "build-ios <app>",
        "build-android <app>",
        "start <app>",
        "start-ios <app>",
        "start-android <app>",
        "release-ios <app>",
        "release-android <app>",
        "release-source <app>",
        "codepush <app>",
        "dbup",
        "dbdown",
        "configure-app <app>",
      ],
      desc: l.trans({
        en: "Manage app lifecycle work from local development to mobile release and database helpers.",
        ko: "local development부터 mobile release, database helper까지 app lifecycle 작업을 관리합니다.",
      }),
    },
    {
      title: "Library",
      href: "/references/cli/library",
      commands: ["create-library <libName>", "remove-library <lib>", "sync-library <lib>", "install-library [libName]"],
      desc: l.trans({
        en: "Create, install, remove, and sync shared libraries used by apps.",
        ko: "app이 사용하는 shared library를 생성, 설치, 삭제, 동기화합니다.",
      }),
    },
    {
      title: "Package",
      href: "/references/cli/package",
      commands: [
        "version",
        "create-package --name <name>",
        "remove-package <pkg>",
        "sync-package <pkg>",
        "build-package <pkg>",
      ],
      desc: l.trans({
        en: "Manage framework/tooling packages under pkgs/akanjs.",
        ko: "pkgs/akanjs 아래 framework/tooling package를 관리합니다.",
      }),
    },
    {
      title: "Module",
      href: "/references/cli/module",
      commands: [
        "create-module <moduleName>",
        "remove-module <module>",
        "create-view <module>",
        "create-unit <module>",
        "create-template <module>",
      ],
      desc: l.trans({
        en: "Generate domain modules and optional module UI companion files.",
        ko: "domain module과 선택적인 module UI companion file을 생성합니다.",
      }),
    },
    {
      title: "Scalar",
      href: "/references/cli/scalar",
      commands: ["create-scalar <scalarName>", "remove-scalar <scalarName>"],
      desc: l.trans({
        en: "Create reusable value types that are not database-backed document models.",
        ko: "database-backed document model이 아닌 reusable value type을 생성합니다.",
      }),
    },
    {
      title: "Page",
      href: "/references/cli/page",
      commands: ["create-crud-page <app> <module>"],
      desc: l.trans({
        en: "Generate CRUD page routes for an existing module inside an app.",
        ko: "app 안의 기존 module을 위한 CRUD page route를 생성합니다.",
      }),
    },
    {
      title: "Cloud",
      href: "/references/cli/cloud",
      commands: ["login", "logout", "set-llm", "reset-llm", "ask", "update"],
      desc: l.trans({
        en: "Configure optional cloud authentication, LLM settings, project questions, and updates.",
        ko: "선택적인 cloud authentication, LLM setting, project question, update를 설정합니다.",
      }),
    },
    {
      title: "Agent Tooling",
      href: "/references/cli/context",
      commands: [
        "context --format json",
        "doctor --format json",
        "guideline list",
        "guideline show framework",
        "agent install cursor",
        "mcp",
      ],
      desc: l.trans({
        en: "Expose workspace context, module abstracts, diagnostics, guideline instructions, agent rules, and read-only MCP tools.",
        ko: "workspace context, module abstract, diagnostic, guideline instruction, agent rule, read-only MCP tool을 제공합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="cli-commands" title={l.trans({ en: "CLI Commands", ko: "CLI 명령" })}>
        <Docs.Title>{l.trans({ en: "CLI Commands", ko: "CLI 명령" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Akan CLI manages the whole workspace lifecycle: workspace creation, app development, generated code, libraries, packages, modules, scalars, pages, mobile builds, local databases, and optional cloud helpers.",
              ko: "Akan CLI는 workspace 생성, app development, generated code, library, package, module, scalar, page, mobile build, local database, optional cloud helper까지 workspace lifecycle 전체를 관리합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This overview is a command index. Open the matching detail page for command-specific argument tables, option tables, notes, and terminal examples.",
              ko: "이 overview는 command index입니다. command별 argument 표, option 표, notes, terminal example은 해당 detail page에서 확인하세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="command-index" title={l.trans({ en: "Command Index", ko: "Command index" })}>
        <Docs.Title>{l.trans({ en: "Command Index", ko: "Command index" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Each CLI group mirrors a command declaration under `pkgs/@akanjs/cli`. Internal or development-only commands are intentionally skipped from public docs.",
              ko: "각 CLI group은 `pkgs/@akanjs/cli` 아래 command 선언과 대응합니다. internal 또는 development-only command는 public docs에서 의도적으로 제외합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="grid gap-3 xl:grid-cols-2">
          {cliGroups.map(({ title, href, commands, desc }) => (
            <Link
              key={title}
              href={href}
              className="rounded-xl border border-base-300 bg-base-100 p-4 hover:border-primary"
            >
              <div className="font-bold text-base-content">{title}</div>
              <div className="mt-2 space-y-1">
                {commands.map((command) => (
                  <div key={command} className="font-mono text-base-content/70">
                    akan {command}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-base-content/70">{desc}</div>
            </Link>
          ))}
        </div>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
