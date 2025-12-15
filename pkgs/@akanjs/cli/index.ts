#!/usr/bin/env node
/* eslint-disable */
import dotenv from "dotenv";
import { runCommands } from "@akanjs/devkit";
import { ApplicationCommand } from "./src/application/application.command";
import { CloudCommand } from "./src/cloud/cloud.command";
import { LibraryCommand } from "./src/library/library.command";
import { ModuleCommand } from "./src/module/module.command";
import { PackageCommand } from "./src/package/package.command";
import { PageCommand } from "./src/page/page.command";
import { WorkspaceCommand } from "./src/workspace/workspace.command";
import { GuidelineCommand } from "./src/guideline/guideline.command";
import { ScalarCommand } from "./src/scalar/scalar.command";

dotenv.config({ path: `${process.cwd()}/.env` });

void runCommands(
  WorkspaceCommand,
  ApplicationCommand,
  LibraryCommand,
  PackageCommand,
  ModuleCommand,
  PageCommand,
  CloudCommand,
  GuidelineCommand,
  ScalarCommand
);
