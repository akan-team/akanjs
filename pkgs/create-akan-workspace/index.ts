#!/usr/bin/env node
/* eslint-disable @akanjs/lint/noImportExternalLibrary */
import { spawn, type SpawnOptions } from "child_process";
import { Command, program } from "commander";

program.name("create-akan-workspace");

const spawnProcess = (command: string, args: string[], options: SpawnOptions = {}) => {
  const proc = spawn(command, args, { cwd: process.cwd(), stdio: "inherit", ...options });
  return new Promise((resolve, reject) => {
    proc.on("exit", (code, signal) => {
      if (!!code || signal) reject({ code, signal });
      else resolve({ code, signal });
    });
  });
};

interface Options {
  org: string;
  app: string;
  dir: string;
}
program
  .argument("[org]", "organization name")
  .option("-a, --app <string>", "application name")
  .option("-d, --dir <string>", "directory")
  .action(async (org: string | undefined, options: Partial<Options>, command: Command) => {
    await spawnProcess("npm", ["install", "-g", "@akanjs/cli", "--latest"]);
    await spawnProcess("akan", [
      "create-workspace",
      ...(org ? [org] : []),
      ...(options.app ? [`--app=${options.app}`] : []),
      ...(options.dir ? [`--dir=${options.dir}`] : []),
    ]);
  });

const run = async () => {
  await program.parseAsync(process.argv);
};

void run();
