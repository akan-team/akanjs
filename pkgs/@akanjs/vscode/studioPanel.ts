import * as vscode from "vscode";
import { StudioView } from "./studioView";

const readyTimeoutMs = 20_000;

export class StudioPanel {
  static readonly #panels = new Map<string, StudioPanel>();
  readonly #panel: vscode.WebviewPanel;
  readonly #root: string;
  #sourceColumn = vscode.ViewColumn.One;
  #loads = 0;
  #isDisposed = false;
  #ready: ((isReady: boolean) => void) | null = null;

  private constructor(root: string, key: string, title: string) {
    this.#root = root;
    this.#panel = vscode.window.createWebviewPanel(
      "akan.studio",
      title,
      { viewColumn: vscode.ViewColumn.Beside },
      { enableScripts: true, localResourceRoots: [] },
    );
    this.#panel.webview.onDidReceiveMessage((message: unknown) => this.#receive(message));
    this.#panel.onDidDispose(() => {
      this.#isDisposed = true;
      StudioPanel.#panels.delete(key);
      this.#settle(false);
    });
  }

  static async show(root: string, app: string, url: string) {
    const key = `${root}\n${app}`;
    const panel = StudioPanel.#panels.get(key) ?? new StudioPanel(root, key, vscode.l10n.t("Akan Studio · {0}", app));
    StudioPanel.#panels.set(key, panel);
    panel.#sourceColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    return await panel.#load(url);
  }

  //? asExternalUri forwards the port in a remote window. Only the origin goes through it, because Uri.toString()
  //? percent-encodes the query's `=` and `&`.
  async #load(url: string) {
    const target = new URL(url);
    const origin = (await vscode.env.asExternalUri(vscode.Uri.parse(target.origin))).toString(true);
    const load = ++this.#loads;
    this.#settle(false);
    const isReady = new Promise<boolean>((resolve) => {
      this.#ready = resolve;
    });
    const timer = setTimeout(() => this.#settle(false), readyTimeoutMs);
    this.#panel.webview.html = StudioView.htmlOf(new URL(`${target.pathname}${target.search}`, origin).toString());
    this.#panel.reveal(vscode.ViewColumn.Beside);
    const loaded = await isReady;
    clearTimeout(timer);
    if (!loaded && !this.#isDisposed && load === this.#loads) void this.#offerBrowser(url);
    return loaded;
  }

  #settle(isReady: boolean) {
    const ready = this.#ready;
    this.#ready = null;
    ready?.(isReady);
  }

  async #offerBrowser(url: string) {
    const open = vscode.l10n.t("Open in Browser");
    const picked = await vscode.window.showWarningMessage(
      vscode.l10n.t("Akan Studio did not load in the editor."),
      open,
    );
    if (picked === open) await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  async #receive(message: unknown) {
    if (StudioView.isReady(message)) {
      this.#settle(true);
      return;
    }
    const source = StudioView.sourceOf(message, this.#root);
    if (!source) return;
    const position = new vscode.Position(source.line - 1, source.column - 1);
    await vscode.window.showTextDocument(vscode.Uri.file(source.fileName), {
      viewColumn: this.#sourceColumn,
      selection: new vscode.Range(position, position),
    });
  }
}
