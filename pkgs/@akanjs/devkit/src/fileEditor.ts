import fs from "fs";

export class FileEditor {
  private filePath: string;
  private content: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.content = this.#readFile();
  }

  #readFile(): string {
    try {
      return fs.readFileSync(this.filePath, "utf-8");
    } catch (error) {
      throw new Error(`Failed to read file: ${this.filePath}`);
    }
  }

  find(pattern: string | RegExp): number {
    const lines = this.content.split("\n");
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        return i;
      }
    }

    return -1;
  }

  findAll(pattern: string | RegExp): number[] {
    const lines = this.content.split("\n");
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    const matches: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push(i);
      }
    }

    return matches;
  }

  insertAfter(pattern: string | RegExp, data: string): this {
    const lineIndex = this.find(pattern);

    if (lineIndex === -1) {
      throw new Error(`Pattern not found: ${pattern}`);
    }

    const lines = this.content.split("\n");
    lines.splice(lineIndex + 1, 0, data);
    this.content = lines.join("\n");

    return this;
  }

  insertBefore(pattern: string | RegExp, data: string): this {
    const lineIndex = this.find(pattern);

    if (lineIndex === -1) {
      throw new Error(`Pattern not found: ${pattern}`);
    }

    const lines = this.content.split("\n");
    lines.splice(lineIndex, 0, data);
    this.content = lines.join("\n");

    return this;
  }

  replace(pattern: string | RegExp, replacement: string): this {
    const regex = typeof pattern === "string" ? new RegExp(pattern, "g") : pattern;
    this.content = this.content.replace(regex, replacement);
    return this;
  }

  append(data: string): this {
    this.content += "\n" + data;
    return this;
  }

  prepend(data: string): this {
    this.content = data + "\n" + this.content;
    return this;
  }

  save(): void {
    try {
      fs.writeFileSync(this.filePath, this.content, "utf-8");
    } catch (error) {
      throw new Error(`Failed to save file: ${this.filePath}`);
    }
  }

  getContent(): string {
    return this.content;
  }

  setContent(content: string): this {
    this.content = content;
    return this;
  }
}
