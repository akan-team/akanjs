import { PrimitiveRegistry } from "akanjs/base";
import { Logger } from "akanjs/common";
import { agentRead, ConstantRegistry, type ConstantType, type MaskModel } from "akanjs/constant";
import type { McpDocument } from "../../signal/mcp/McpDocument";
import { Msg, type PromptMessage } from "../../signal/mcp/Msg";
import type { PagePromptEntry, PagePromptRecord, PagePromptRun } from "../../signal/mcp/pagePrompt";

interface PagePromptComposerProps {
  document: McpDocument;
  /** Characters of attached data one prompt may carry; the largest list is cut first and the cut is said. */
  budget: number;
  /** The tool names this caller may see, so the tools line offers nothing the listing would not. */
  visibleTools: (names: string[]) => Promise<string[]>;
}

interface Attachment {
  key: string;
  uri: string;
  value: unknown;
  model?: MaskModel;
}

/**
 * Turns what a page fetched into the messages `prompts/get` answers.
 *
 * The instruction is the page's own description and nothing more: the screen's data rides as embedded resources
 * masked by the model each endpoint declares, and the tools named at the end are the published ones of the same
 * modules — a model that reads a ticket board is told the ticket tools, not all three hundred.
 */
export class PagePromptComposer {
  static readonly logger = new Logger("PagePromptComposer");
  static readonly defaultBudget = 60_000;

  readonly #props: PagePromptComposerProps;

  constructor(props: PagePromptComposerProps) {
    this.#props = props;
  }

  /**
   * A required argument nobody filled in gets one message pointing at the tool that finds the id, not a guess.
   * A prompt cannot re-run itself, so pre-filled context would never be used; the model finds the id with the
   * search tool and proceeds with the tools from there.
   */
  missing(entry: PagePromptEntry, names: string[]): PromptMessage[] {
    return names.map((name) => {
      const finder = this.#finderFor(name);
      const hint = finder
        ? `Find it with \`${finder}\`, then run this prompt again with ${name}=<id>.`
        : `Run this prompt again with ${name}=<id>.`;
      return Msg.user(`No ${name} was named for "${entry.name}". ${hint}`);
    });
  }

  async compose(entry: PagePromptEntry, run: Extract<PagePromptRun, { ok: true }>): Promise<PromptMessage[]> {
    const messages: PromptMessage[] = [Msg.user(entry.description, { priority: 1 })];
    const attachments: Attachment[] = [];
    const records = PagePromptComposer.#dedupe(run.records);
    for (const record of records) {
      if (record.value === undefined) {
        messages.push(Msg.user(`\`${record.key}\` did not load for this account.`));
        continue;
      }
      const attachment = this.#attachmentOf(record);
      if (attachment) attachments.push(attachment);
      else messages.push(Msg.user(`\`${record.key}\` could not be attached; call the tool directly.`));
    }
    messages.push(...this.#fit(attachments));
    const tools = await this.#toolsFor(
      records.map((record) => record.key),
      new Set(attachments.map((attachment) => attachment.key)),
    );
    if (tools.length) messages.push(Msg.user(`Tools for this screen: ${tools.join(", ")}.`, { priority: 0.8 }));
    return messages;
  }

  /**
   * One document in two shapes — a layout's `project` and a page's `lightProject` — travels once, as the larger.
   * `light<Model>` is refused from the tool shelf for reading the same document as `<Model>`, and attaching both
   * spent the budget on the same rows twice.
   */
  static #dedupe(records: PagePromptRecord[]): PagePromptRecord[] {
    const kept: PagePromptRecord[] = [];
    const byDocument = new Map<string, number>();
    for (const record of records) {
      const single = record.returns.modelType && !record.returns.arrDepth;
      const id =
        single && record.value && typeof record.value === "object" ? (record.value as { id?: unknown }).id : undefined;
      if (typeof id !== "string") {
        kept.push(record);
        continue;
      }
      const key = `${record.returns.refName}:${id}`;
      const at = byDocument.get(key);
      if (at === undefined) {
        byDocument.set(key, kept.length);
        kept.push(record);
        continue;
      }
      const previous = kept[at];
      if (previous && JSON.stringify(record.value).length > JSON.stringify(previous.value).length) kept[at] = record;
    }
    return kept;
  }

  #attachmentOf(record: PagePromptRecord): Attachment | null {
    const { key, args, returns } = record;
    const uri = this.#props.document.resourceUri(key, args) ?? PagePromptComposer.#callUri(key, args);
    if (!returns.modelType) {
      const primitive = PrimitiveRegistry.hasName(returns.refName) ? PrimitiveRegistry.get(returns.refName) : null;
      return { key, uri, value: agentRead(primitive, record.value, returns.arrDepth ?? 0) };
    }
    try {
      return {
        key,
        uri,
        value: record.value,
        model: ConstantRegistry.getModelRef(returns.refName, returns.modelType as ConstantType),
      };
    } catch (error) {
      // Fail closed, as the tool path does: a value nothing can mask is a value that does not travel.
      PagePromptComposer.logger.error(
        `page prompt could not mask a "${returns.refName}" (${returns.modelType}) record: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Keeps the attachments inside the budget by shortening lists, largest first, and says what was cut. A page
   * with `{ limit: 0 }` is right for a screen and a disaster for a model's window, so the cap is the framework's.
   * Only a list is cut: a single document rides whole, so the budget is what the lists are trimmed to fit under
   * and a screen of large documents can still exceed it.
   */
  #fit(attachments: Attachment[]): PromptMessage[] {
    const items = attachments.map((attachment) => ({
      attachment,
      total: Array.isArray(attachment.value) ? attachment.value.length : 0,
      message: PagePromptComposer.#resource(attachment),
    }));
    const size = () => items.reduce((sum, item) => sum + PagePromptComposer.#length(item.message), 0);
    while (size() > this.#props.budget) {
      const largest = items
        .filter((item) => Array.isArray(item.attachment.value) && item.attachment.value.length > 1)
        .sort((a, b) => PagePromptComposer.#length(b.message) - PagePromptComposer.#length(a.message))[0];
      if (!largest) break;
      const rows = largest.attachment.value as unknown[];
      largest.attachment = { ...largest.attachment, value: rows.slice(0, Math.max(1, Math.floor(rows.length / 2))) };
      largest.message = PagePromptComposer.#resource(largest.attachment);
    }
    const notes = items
      .filter((item) => Array.isArray(item.attachment.value) && item.attachment.value.length < item.total)
      .map((item) =>
        Msg.user(
          `Attached the first ${(item.attachment.value as unknown[]).length} of ${item.total} rows of \`${item.attachment.key}\`; call it for the rest.`,
        ),
      );
    return [...items.map((item) => item.message), ...notes];
  }

  /** The published tools of the modules the screen fetched from, minus the reads whose answers are attached above. */
  async #toolsFor(keys: string[], attached: Set<string>): Promise<string[]> {
    const document = this.#props.document;
    const refNames = new Set(
      keys.map((key) => document.findTool(key)?.refName).filter((name): name is string => !!name),
    );
    if (!refNames.size) return [];
    const names = document.tools
      .map((tool) => tool.name)
      .filter((name) => !attached.has(name) && refNames.has(document.findTool(name)?.refName ?? ""));
    return await this.#props.visibleTools(names);
  }

  /** `projectId` → the published list tool of `project`, a search slice first — what a person would use to find one. */
  #finderFor(argName: string): string | undefined {
    const refName = argName.replace(/Id$/, "");
    if (!refName || refName === argName) return undefined;
    const document = this.#props.document;
    const listTools = document.tools
      .map((tool) => tool.name)
      .filter((name) => document.findTool(name)?.refName === refName && name.startsWith(`${refName}List`));
    return (
      listTools.find((name) => /Search/.test(name)) ??
      listTools.find((name) => name === `${refName}List`) ??
      listTools[0]
    );
  }

  static #resource(attachment: Attachment): PromptMessage {
    return Msg.resource(attachment.uri, attachment.value, attachment.model ? { model: attachment.model } : {});
  }

  static #length(message: PromptMessage): number {
    const content = message.content;
    return content.type === "resource" ? content.resource.text.length : 0;
  }

  /** A tool with no `akan://` template still gets an address a reader can trace back to the call that made it. */
  static #callUri(key: string, args: Record<string, unknown>): string {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(args)) {
      if (value === undefined || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value])
        search.append(name, typeof item === "object" ? JSON.stringify(item) : String(item));
    }
    const query = search.toString();
    return `akan://${key}${query ? `?${query}` : ""}`;
  }
}
