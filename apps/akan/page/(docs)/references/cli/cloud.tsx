import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "login",
      signature: "akan login",
      desc: "Login to Akan Cloud services for the current workspace.\nUse it before cloud-assisted flows that require credentials, account state, or remote project access.",
      examples: "akan login",
    },
    {
      name: "logout",
      signature: "akan logout",
      desc: "Logout from Akan Cloud services for the current workspace.\nUse it to clear the active cloud session when switching accounts or removing cloud access from the local environment.",
      examples: "akan logout",
    },
    {
      name: "set-llm",
      signature: "akan set-llm",
      desc: "Configure an LLM API key used by cloud-assisted or AI-assisted commands.\nThe command stores the workspace-level LLM setting so project questions and generation helpers use the intended provider.",
      examples: "akan set-llm",
    },
    {
      name: "reset-llm",
      signature: "akan reset-llm",
      desc: "Reset the workspace LLM configuration back to the default behavior.\nUse it when a custom provider or key should no longer be used by AI-assisted command flows.",
      examples: "akan reset-llm",
    },
    {
      name: "ask",
      signature: "akan ask [--question <question>]",
      desc: "Ask the configured AI assistant a question about the current project.\nPass `--question` for a non-interactive request, or omit it to enter the command's prompt-based question flow.",
      options: [
        {
          name: "--question",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "ask prompt",
          desc: "Question to ask. Prompts interactively when omitted.",
        },
      ],
      examples: `akan ask --question "How should I add a new module?"
akan ask`,
    },
    {
      name: "update",
      signature: "akan update [--tag <tag>]",
      desc: "Update Akan.js framework packages using the selected release tag.\nUse `latest` for normal updates and prerelease tags such as `beta`, `rc`, or `canary` only when intentionally testing that channel.",
      options: [
        {
          name: "--tag",
          type: "String",
          defaultValue: "latest",
          enumOrFlag: "latest | dev | canary | beta | rc | alpha",
          desc: "Akan.js update tag.",
        },
      ],
      examples: `akan update
akan update --tag latest
akan update --tag beta`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="cloud-cli" title={l.trans({ en: "Cloud CLI", ko: "Cloud CLI" })}>
        <Docs.Title>{l.trans({ en: "Cloud CLI", ko: "Cloud CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Cloud commands configure optional Akan Cloud helpers: authentication, LLM settings, project questions, and framework updates.",
              ko: "Cloud command는 선택적인 Akan Cloud helper를 설정합니다. authentication, LLM setting, project question, framework update를 다룹니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Internal deployment commands marked `devOnly: true` are intentionally not documented here.",
              ko: "`devOnly: true`로 표시된 internal deployment command는 의도적으로 이 문서에서 제외합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {commands.map((command) => (
        <CommandReferenceSlide key={command.name} command={command} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
