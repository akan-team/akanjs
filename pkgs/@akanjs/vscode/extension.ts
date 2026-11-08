import * as vscode from "vscode";
import { registerProviders } from "./providers";
import { WorkspaceIndex } from "./workspaceIndex";

export const activate = async (context: vscode.ExtensionContext) => {
  const log = vscode.window.createOutputChannel("Akan.js");
  const workspace = new WorkspaceIndex(log);
  context.subscriptions.push(
    log,
    workspace,
    ...registerProviders(workspace),
    vscode.commands.registerCommand("akan.reindex", () => workspace.rebuild()),
  );
  await workspace.rebuild();
  return { workspace };
};

export const deactivate = () => undefined;
