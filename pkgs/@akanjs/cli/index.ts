#!/usr/bin/env bun

import { runCommands } from "@akanjs/devkit";
import { AgentCommand } from "./agent/agent.command";
import { ApplicationCommand } from "./application/application.command";
import { CloudCommand } from "./cloud/cloud.command";
import { ContextCommand } from "./context/context.command";
import { GuidelineCommand } from "./guideline/guideline.command";
import { LibraryCommand } from "./library/library.command";
import { LocalRegistryCommand } from "./localRegistry/localRegistry.command";
import { ModuleCommand } from "./module/module.command";
import { PackageCommand } from "./package/package.command";
import { PageCommand } from "./page/page.command";
import { PrimitiveCommand } from "./primitive/primitive.command";
import { QualityCommand } from "./quality/quality.command";
import { RepairCommand } from "./repair/repair.command";
import { ScalarCommand } from "./scalar/scalar.command";
import { WorkflowCommand } from "./workflow/workflow.command";
import { WorkspaceCommand } from "./workspace/workspace.command";

void runCommands(
  WorkspaceCommand,
  AgentCommand,
  ApplicationCommand,
  LibraryCommand,
  LocalRegistryCommand,
  PackageCommand,
  ModuleCommand,
  PageCommand,
  ContextCommand,
  CloudCommand,
  GuidelineCommand,
  ScalarCommand,
  PrimitiveCommand,
  QualityCommand,
  RepairCommand,
  WorkflowCommand,
);
