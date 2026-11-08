import type { WorkspaceTrustItem } from "@akanjs/devkit/codeAgent/agent/WorkspaceTrust";

export interface CodeTrustPromptStreams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

const shown = 8;

export class CodeTrustPrompt {
  static describe(items: WorkspaceTrustItem[]) {
    const lines = ["This repo asks akan code to run its own code:"];
    for (const item of items) {
      lines.push(
        item.kind === "mcp"
          ? "  MCP servers in .akan/code/mcp.json, which it would start or connect to:"
          : "  Extensions in .akan/code/extensions/, which it would load and run:",
      );
      lines.push(...item.lines.slice(0, shown).map((line) => `    ${line}`));
      if (item.lines.length > shown) lines.push(`    … and ${item.lines.length - shown} more`);
    }
    return lines.join("\n");
  }

  static skipped(items: WorkspaceTrustItem[]) {
    const what = items.map((item) => (item.kind === "mcp" ? "MCP servers" : "extensions")).join(" and ");
    return `This repo's ${what} were not started: they are not approved. Start akan code in a terminal to approve them, or pass --trust-workspace.`;
  }

  static async ask(items: WorkspaceTrustItem[], { input, output }: CodeTrustPromptStreams) {
    output.write(`${CodeTrustPrompt.describe(items)}\n\nStart them, and remember this until they change? [y/N] `);
    const answer = await CodeTrustPrompt.#line(input);
    return /^\s*y(es)?\s*$/i.test(answer ?? "");
  }

  // Raw `data` events, not readline: the full-screen session takes stdin right after, and readline keeps its listener.
  static #line(input: NodeJS.ReadableStream) {
    return new Promise<string | undefined>((resolve) => {
      let buffer = "";
      const finish = (value: string | undefined) => {
        input.off("data", onData);
        input.off("end", onEnd);
        input.pause();
        resolve(value);
      };
      const onData = (chunk: Buffer | string) => {
        buffer += chunk.toString();
        const newline = buffer.search(/[\r\n]/);
        if (newline >= 0) finish(buffer.slice(0, newline));
      };
      const onEnd = () => finish(undefined);
      input.on("data", onData);
      input.on("end", onEnd);
      input.resume();
    });
  }
}
