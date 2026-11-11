export class FileEditor {
  #filePath: string;
  #content: string;

  private constructor(filePath: string, content: string) {
    this.#filePath = filePath;
    this.#content = content;
  }

  static async create(filePath: string): Promise<FileEditor> {
    try {
      const content = await Bun.file(filePath).text();
      return new FileEditor(filePath, content);
    } catch (_error) {
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  find(pattern: string | RegExp): number {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    return this.#content.split("\n").findIndex((line) => !!line && regex.test(line));
  }

  findAll(pattern: string | RegExp): number[] {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    return this.#content.split("\n").flatMap((line, index) => (line && regex.test(line) ? [index] : []));
  }

  insertAfter(pattern: string | RegExp, data: string): this {
    return this.#insertAt(pattern, data, 1);
  }

  insertBefore(pattern: string | RegExp, data: string): this {
    return this.#insertAt(pattern, data, 0);
  }

  #insertAt(pattern: string | RegExp, data: string, offset: number): this {
    const lineIndex = this.find(pattern);
    if (lineIndex === -1) throw new Error(`Pattern not found: ${pattern}`);
    const lines = this.#content.split("\n");
    lines.splice(lineIndex + offset, 0, data);
    this.#content = lines.join("\n");
    return this;
  }

  replace(pattern: string | RegExp, replacement: string): this {
    const regex = typeof pattern === "string" ? new RegExp(pattern, "g") : pattern;
    this.#content = this.#content.replace(regex, replacement);
    return this;
  }

  append(data: string): this {
    this.#content += `\n${data}`;
    return this;
  }

  prepend(data: string): this {
    this.#content = `${data}\n${this.#content}`;
    return this;
  }

  async save(): Promise<void> {
    try {
      await Bun.write(this.#filePath, this.#content);
    } catch (_error) {
      throw new Error(`Failed to save file: ${this.#filePath}`);
    }
  }

  getContent(): string {
    return this.#content;
  }

  setContent(content: string): this {
    this.#content = content;
    return this;
  }
}
