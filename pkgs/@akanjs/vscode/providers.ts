import path from "node:path";
import type { AkanFamily, AkanSpan, AkanTarget } from "@akanjs/language";
import * as vscode from "vscode";
import type { WorkspaceIndex } from "./workspaceIndex";

export const goToSourceCommand = "akan.goToSource";
export const renameSourceKeyCommand = "akan.renameSourceKey";

const rangeOf = (span: AkanSpan) => new vscode.Range(span.line, span.character, span.endLine, span.endCharacter);

const locationOf = (span: AkanSpan) => new vscode.Location(vscode.Uri.file(span.fileName), rangeOf(span));

const goToLabel = (family: AkanFamily) => {
  switch (family) {
    case "slice":
      return vscode.l10n.t("Go to slice");
    case "query":
      return vscode.l10n.t("Go to query");
    case "model":
      return vscode.l10n.t("Go to model");
    case "formSetter":
      return vscode.l10n.t("Go to field");
    case "storeState":
      return vscode.l10n.t("Go to state");
    case "endpoint":
      return vscode.l10n.t("Go to endpoint");
    default:
      return vscode.l10n.t("Go to class");
  }
};

const escapeMarkdown = (text: string) => text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");

const summaryOf = (target: Pick<AkanTarget, "label" | "detail">) => [target.label, ...target.detail].join(" · ");

export const registerProviders = (workspace: WorkspaceIndex): vscode.Disposable[] => {
  const selector: vscode.DocumentSelector = [
    { scheme: "file", language: "typescript" },
    { scheme: "file", language: "typescriptreact" },
  ];
  const lookup = (document: vscode.TextDocument, position: vscode.Position) => {
    const folder = workspace.folderOf(document.uri);
    if (!folder) return null;
    return { folder, fileName: document.uri.fsPath, text: document.getText(), offset: document.offsetAt(position) };
  };

  const definitions: vscode.DefinitionProvider = {
    provideDefinition(document, position) {
      const at = lookup(document, position);
      if (!at) return [];
      const origin = document.getWordRangeAtPosition(position);
      return at.folder.index.definitionAt(at.fileName, at.text, at.offset).map(
        (target): vscode.LocationLink => ({
          originSelectionRange: origin,
          targetUri: vscode.Uri.file(target.span.fileName),
          targetRange: rangeOf(target.span),
          targetSelectionRange: rangeOf(target.span),
        }),
      );
    },
  };

  const hovers: vscode.HoverProvider = {
    provideHover(document, position) {
      const at = lookup(document, position);
      if (!at) return null;
      const hover = at.folder.index.hoverAt(at.fileName, at.text, at.offset);
      if (!hover) return null;
      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = { enabledCommands: [goToSourceCommand] };
      for (const target of hover.targets) {
        const args = encodeURIComponent(
          JSON.stringify([target.span.fileName, target.span.line, target.span.character]),
        );
        const where = path.relative(at.folder.folder.uri.fsPath, target.span.fileName);
        markdown.appendMarkdown(
          `**akan** · ${escapeMarkdown(summaryOf(target))} — [${goToLabel(target.family)}](command:${goToSourceCommand}?${args} "${where}:${target.span.line + 1}")\n\n`,
        );
      }
      return new vscode.Hover(markdown, document.getWordRangeAtPosition(position));
    },
  };

  const references: vscode.ReferenceProvider = {
    provideReferences(document, position) {
      const at = lookup(document, position);
      if (!at) return [];
      return at.folder.index.referencesAt(at.fileName, at.offset, workspace.readText).map(locationOf);
    },
  };

  const renameEditsOf = (document: vscode.TextDocument, position: vscode.Position, newName: string) => {
    const folder = workspace.folderOf(document.uri);
    const edits = folder?.index.renameAt(document.uri.fsPath, document.offsetAt(position), newName, workspace.readText);
    if (!edits) return null;
    const edit = new vscode.WorkspaceEdit();
    for (const { span, newText } of edits) edit.replace(vscode.Uri.file(span.fileName), rangeOf(span), newText);
    return edit;
  };

  const renames: vscode.RenameProvider = {
    prepareRename(document, position) {
      const target = workspace
        .folderOf(document.uri)
        ?.index.renameTargetAt(document.uri.fsPath, document.offsetAt(position));
      return target ? { range: rangeOf(target.span), placeholder: target.sourceKey } : undefined;
    },
    provideRenameEdits(document, position, newName) {
      return renameEditsOf(document, position, newName);
    },
  };

  //? F2 reaches TypeScript's rename provider before this extension's, so the keybinding takes over on the keys
  //? whose derived names TypeScript cannot rename.
  const updateRenameContext = (editor: vscode.TextEditor | undefined) => {
    const document = editor?.document;
    const renameable =
      !!document &&
      !!workspace
        .folderOf(document.uri)
        ?.index.renameTargetAt(document.uri.fsPath, document.offsetAt(editor.selection.active));
    void vscode.commands.executeCommand("setContext", "akan.onRenameableKey", renameable);
  };

  const lensChanged = new vscode.EventEmitter<void>();
  const lenses: vscode.CodeLensProvider<vscode.CodeLens & { akan?: { fileName: string; offset: number } }> = {
    onDidChangeCodeLenses: lensChanged.event,
    provideCodeLenses(document) {
      if (!vscode.workspace.getConfiguration("akan").get<boolean>("codeLens.enabled", true)) return [];
      const folder = workspace.folderOf(document.uri);
      if (!folder) return [];
      return folder.index.sourceKeysOf(document.uri.fsPath).map((key) =>
        Object.assign(new vscode.CodeLens(rangeOf(key.span)), {
          akan: { fileName: document.uri.fsPath, offset: key.span.start },
        }),
      );
    },
    resolveCodeLens(lens) {
      const folder = workspace.folderOf(vscode.Uri.file(lens.akan?.fileName ?? ""));
      if (!folder || !lens.akan) return lens;
      const { fileName, offset } = lens.akan;
      const uses = folder.index.referencesAt(fileName, offset, workspace.readText).map(locationOf);
      const key = folder.index.sourceKeyAt(fileName, offset);
      const title = [vscode.l10n.t("{0} uses", uses.length), ...(key?.detail ?? [])].join(" · ");
      lens.command = {
        title,
        command: "editor.action.showReferences",
        arguments: [vscode.Uri.file(fileName), lens.range.start, uses],
      };
      return lens;
    },
  };

  return [
    lensChanged,
    workspace.onDidChange(() => lensChanged.fire()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("akan.codeLens")) lensChanged.fire();
    }),
    vscode.languages.registerDefinitionProvider(selector, definitions),
    vscode.languages.registerHoverProvider(selector, hovers),
    vscode.languages.registerReferenceProvider(selector, references),
    vscode.languages.registerCodeLensProvider(selector, lenses),
    vscode.languages.registerRenameProvider(selector, renames),
    vscode.window.onDidChangeTextEditorSelection(({ textEditor }) => updateRenameContext(textEditor)),
    vscode.window.onDidChangeActiveTextEditor(updateRenameContext),
    vscode.commands.registerCommand(renameSourceKeyCommand, async (givenName?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const { document, selection } = editor;
      const target = workspace
        .folderOf(document.uri)
        ?.index.renameTargetAt(document.uri.fsPath, document.offsetAt(selection.active));
      if (!target) {
        void vscode.window.showInformationMessage(
          vscode.l10n.t("Place the cursor on a slice key or a Filter query key."),
        );
        return;
      }
      const newName =
        givenName ??
        (await vscode.window.showInputBox({
          value: target.sourceKey,
          prompt: vscode.l10n.t("Rename {0} and every name derived from it", target.sourceKey),
          validateInput: (value) => (/^[A-Za-z_$][\w$]*$/.test(value) ? null : vscode.l10n.t("Not an identifier")),
        }));
      if (!newName || newName === target.sourceKey) return;
      const edit = renameEditsOf(document, selection.active, newName);
      if (edit) await vscode.workspace.applyEdit(edit);
    }),
    vscode.commands.registerCommand(goToSourceCommand, async (fileName: string, line: number, character: number) => {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fileName));
      const position = new vscode.Position(line, character);
      await vscode.window.showTextDocument(document, { selection: new vscode.Range(position, position) });
    }),
  ];
};
