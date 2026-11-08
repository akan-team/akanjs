import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "akanjs/base";
import dayjs from "dayjs";

interface RotatingLogWriterState {
  date: string;
  sequence: number;
  sizeBytes: number;
}

interface RotatingLogWriterFile {
  fileName: string;
  date: string;
  sequence: number;
}

export interface RotatingLogWriterOptions {
  logDir: string;
  appName: string;
  environment: string;
  operationMode: string;
  maxSizeBytes?: number;
  maxFiles?: number;
  fileMode?: number;
  now?: () => Date;
  warn?: (message: string) => void;
}

export class RotatingLogWriter {
  static readonly defaultMaxSizeBytes = 50 * 1024 * 1024;
  static readonly defaultMaxFiles = 100;
  static readonly defaultFileMode = 0o600;

  readonly #logDir: string;
  readonly #basePrefix: string;
  readonly #maxSizeBytes: number;
  readonly #maxFiles: number;
  readonly #fileMode: number;
  readonly #now: () => Date;
  readonly #warn: (message: string) => void;
  readonly #states = new Map<string, RotatingLogWriterState>();
  readonly #queues = new Map<string, Promise<void>>();
  readonly #encoder = new TextEncoder();
  #ready: Promise<void> | null = null;

  constructor(options: RotatingLogWriterOptions) {
    this.#logDir = options.logDir;
    this.#basePrefix = [
      RotatingLogWriter.sanitizeFilePart(options.appName),
      RotatingLogWriter.sanitizeFilePart(options.environment),
      RotatingLogWriter.sanitizeFilePart(options.operationMode),
    ].join("-");
    this.#maxSizeBytes = options.maxSizeBytes ?? RotatingLogWriter.defaultMaxSizeBytes;
    this.#maxFiles = options.maxFiles ?? RotatingLogWriter.defaultMaxFiles;
    this.#fileMode = options.fileMode ?? RotatingLogWriter.defaultFileMode;
    this.#now = options.now ?? (() => new Date());
    this.#warn = options.warn ?? RotatingLogWriter.#defaultWarn;
  }

  static fromRuntimeDir(runtimeDir: string): RotatingLogWriter | null {
    if (process.env.AKAN_LOG_TO_FILE === "0") return null;
    try {
      const env = getEnv();
      return new RotatingLogWriter({
        logDir: path.resolve(process.env.AKAN_LOG_DIR ?? path.join(runtimeDir, "logs")),
        appName: env.appName,
        environment: env.environment,
        operationMode: env.operationMode,
        maxSizeBytes: RotatingLogWriter.#parseMaxSizeBytes(process.env.AKAN_LOG_MAX_SIZE_MB),
        maxFiles: RotatingLogWriter.#parseMaxFiles(process.env.AKAN_LOG_MAX_FILES),
        fileMode: RotatingLogWriter.#parseFileMode(process.env.AKAN_LOG_FILE_MODE),
      });
    } catch (error) {
      RotatingLogWriter.#defaultWarn(
        `File logging disabled because runtime env could not be resolved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  static sanitizeFilePart(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  write(processKey: string, chunk: string) {
    if (!chunk) return;
    const safeProcessKey = RotatingLogWriter.sanitizeFilePart(processKey);
    const date = dayjs(this.#now()).format("YYYY-MM-DD");
    const queue = (this.#queues.get(safeProcessKey) ?? Promise.resolve())
      .then(() => this.#writeQueued(safeProcessKey, date, chunk))
      .catch((error) => {
        this.#warn(`Failed to write Akan log file: ${error instanceof Error ? error.message : String(error)}`);
      });
    this.#queues.set(safeProcessKey, queue);
  }

  async close() {
    await Promise.all([...this.#queues.values()].map((queue) => queue.catch(() => undefined)));
  }

  async #writeQueued(processKey: string, date: string, chunk: string) {
    await this.#ensureReady();
    const byteLength = this.#encoder.encode(chunk).byteLength;
    let state = this.#states.get(processKey);
    let createdState = false;

    if (!state || state.date !== date || (state.sizeBytes > 0 && state.sizeBytes + byteLength > this.#maxSizeBytes)) {
      state = await this.#createState(processKey, date);
      this.#states.set(processKey, state);
      createdState = true;
    }

    const filePath = this.#getFilePath(processKey, state.date, state.sequence);
    await appendFile(filePath, chunk, { mode: this.#fileMode });
    state.sizeBytes += byteLength;
    if (createdState) await this.#cleanupRetention(processKey);
  }

  async #ensureReady() {
    this.#ready ??= mkdir(this.#logDir, { recursive: true }).then(() => undefined);
    await this.#ready;
  }

  async #createState(processKey: string, date: string): Promise<RotatingLogWriterState> {
    const sequence = await this.#getNextSequence(processKey, date);
    const filePath = this.#getFilePath(processKey, date, sequence);
    const sizeBytes = await stat(filePath).then(
      (file) => file.size,
      () => 0,
    );
    return { date, sequence, sizeBytes };
  }

  async #getNextSequence(processKey: string, date: string) {
    const files = await this.#listProcessFiles(processKey);
    const latestSequence = files
      .filter((file) => file.date === date)
      .reduce((latest, file) => Math.max(latest, file.sequence), 0);
    return latestSequence + 1;
  }

  async #cleanupRetention(processKey: string) {
    const files = await this.#listProcessFiles(processKey);
    const staleFiles = files
      .sort((a, b) => b.date.localeCompare(a.date) || b.sequence - a.sequence)
      .slice(this.#maxFiles);
    await Promise.all(staleFiles.map((file) => rm(path.join(this.#logDir, file.fileName), { force: true })));
  }

  async #listProcessFiles(processKey: string): Promise<RotatingLogWriterFile[]> {
    let fileNames: string[];
    try {
      fileNames = await readdir(this.#logDir);
    } catch {
      return [];
    }
    return fileNames.flatMap((fileName) => {
      if (!fileName.startsWith(`${this.#basePrefix}-`)) return [];
      const rest = fileName.slice(this.#basePrefix.length + 1);
      const match = /^(\d{4}-\d{2}-\d{2})-(.+)-(\d{4})\.log$/.exec(rest);
      if (!match) return [];
      const [, date, fileProcessKey, sequenceRaw] = match;
      if (fileProcessKey !== processKey || !sequenceRaw) return [];
      return [{ fileName, date, sequence: Number(sequenceRaw) }];
    });
  }

  #getFilePath(processKey: string, date: string, sequence: number) {
    return path.join(
      this.#logDir,
      `${this.#basePrefix}-${date}-${processKey}-${String(sequence).padStart(4, "0")}.log`,
    );
  }

  static #parseMaxSizeBytes(value: string | undefined) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return RotatingLogWriter.defaultMaxSizeBytes;
    return Math.floor(parsed * 1024 * 1024);
  }

  static #parseMaxFiles(value: string | undefined) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return RotatingLogWriter.defaultMaxFiles;
    return parsed;
  }

  static #parseFileMode(value: string | undefined) {
    const parsed = Number.parseInt(value ?? "", 8);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 0o777 ? parsed : RotatingLogWriter.defaultFileMode;
  }

  static #defaultWarn(message: string) {
    process.stderr.write(`[AkanLog] ${message}\n`);
  }
}
