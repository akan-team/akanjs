import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "version",
      signature: "akan version",
      desc: "Show version information for packages managed by the workspace.\nUse it before package release, upgrade, or framework maintenance work to confirm the current package state.",
      examples: "akan version",
    },
    {
      name: "create-package",
      signature: "akan create-package --name <name>",
      desc: "Create a new framework or tooling package under `pkgs/akanjs`.\nThe package name is provided as an option and normalized to lowercase kebab-case before the package template is generated.",
      options: [
        {
          name: "--name",
          type: "String",
          defaultValue: "-",
          enumOrFlag: "-",
          desc: "Package name. Normalized to lowercase kebab-case.",
        },
      ],
      examples: "akan create-package --name renderer",
    },
    {
      name: "remove-package",
      signature: "akan remove-package <pkg>",
      desc: "Remove an existing package from the workspace package set.\nUse it when a framework package should no longer participate in package sync, builds, or version reporting.",
      examples: "akan remove-package renderer",
    },
    {
      name: "sync-package",
      signature: "akan sync-package <pkg>",
      desc: "Synchronize dependencies and configuration for a selected package.\nRun it after package manifest changes, build configuration updates, or workspace-level package wiring changes.",
      examples: "akan sync-package renderer",
    },
    {
      name: "build-package",
      signature: "akan build-package <pkg>",
      desc: "Build the selected package for distribution or local framework consumption.\nUse it after package source changes have been synced and before relying on the package output from apps or other packages.",
      examples: "akan build-package renderer",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="package-cli" title={l.trans({ en: "Package CLI", ko: "Package CLI" })}>
        <Docs.Title>{l.trans({ en: "Package CLI", ko: "Package CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Package commands manage packages under `pkgs/akanjs`. Use them for framework or tooling package lifecycle work: checking versions, creating packages, syncing package configuration, and building distributable output.",
              ko: "Package command는 `pkgs/akanjs` 아래 package를 관리합니다. version 확인, package 생성, package configuration sync, 배포 가능한 output build 같은 framework/tooling package lifecycle 작업에 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "These commands are lower-level than app or library commands. Prefer app/library commands for normal product code.",
              ko: "이 명령은 app/library command보다 낮은 수준의 작업입니다. 일반 product code에는 app/library command를 우선 사용합니다.",
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
