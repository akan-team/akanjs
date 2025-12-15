import * as fs from "fs";

export const objPath = (o: unknown, p: string) =>
  p.split(".").reduce((a: { [key: string]: unknown }, v: string) => a[v], o);

export class FileSystem {
  filename = "";
  dirname = "./";
  writeStream?: fs.WriteStream;
  constructor(dirname = "./", filename = "") {
    this.dirname = dirname;
    this.filename = filename;
  }
  async init() {
    return new Promise((resolve, reject) => {
      fs.mkdirSync(this.dirname, { recursive: true });
      const writeStream = fs.createWriteStream(`${this.dirname}/${this.filename}.csv`) as fs.WriteStream | undefined;
      if (!writeStream) {
        reject(new Error("No WriteStream"));
        return;
      }
      writeStream.once(`open`, () => {
        this.writeStream = writeStream;
        resolve(writeStream);
      });
    });
  }
  write(body: string) {
    if (!this.writeStream) throw new Error("no write stream");
    return this.writeStream.write(`${body.replace(/\n/g, "")}\n`);
  }
  // async finish() {}
}

export interface ExportForm<T> {
  items: T[];
  path: string;
  fields?: string[];
  options?: { append: boolean };
  delimiter?: string;
}
export const exportToCsv = async <T>({ items, path, fields, delimiter, options }: ExportForm<T>): Promise<void> => {
  return new Promise((resolve, reject) => {
    const dirs = path.split("/");
    if (dirs.length > 1) {
      const dirname = dirs.slice(-1).join("/");
      if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
    }
    if (!fields) throw new Error("Fields Required");
    const writeStream = !options?.append && fs.createWriteStream(path);
    const header = fields.reduce((acc, cur) => acc + (delimiter ?? `,`) + cur) + `\n`;
    if (!writeStream) {
      reject(new Error("No WriteStream"));
      return;
    }
    writeStream.once(`open`, () => {
      writeStream.write(header);
      for (const item of items) {
        const data = fields
          .map((field) => objPath(item, field) ?? null)
          .map((field: string | null) => String(field).replace(/\n/g, "").replace(/,/g, ""));
        const body = data.reduce((acc, cur) => acc + (delimiter ?? `,`) + cur) + `\n`;
        if (options?.append) fs.appendFileSync(path, body);
      }
      resolve();
    });
  });
};
export const exportToJson = <T>(items: T | T[], localPath: string): void => {
  const dirname = localPath.split("/").slice(0, -1).join("/");
  if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
  fs.writeFileSync(localPath, JSON.stringify(items));
};
export const readJson = (localPath: string): unknown =>
  JSON.parse(fs.readFileSync(localPath).toString("utf-8")) as unknown;
