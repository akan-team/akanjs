# `akanjs/client/native/filesystem`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type BaseDirectory = "cache" | "data" | "documents" | "temp";

export interface DirEntry extends FileInfo {
    name: string;
}

export type Encoding = "base64" | "utf8";

export type EntryType = "directory" | "file" | "other" | "symlink";

export interface FileInfo {
    type: EntryType;
    size: number;
    mtime: number;
}

export type Filesystem = Plugin<FilesystemApi>;

export interface FilesystemApi {
    readFile(options: PathOptions & {
        encoding: Encoding;
    }): Promise<{
        data: string;
    }>;
    readFile(options: PathOptions & {
        encoding?: undefined;
    }): Promise<FileRef>;
    readFile(options: ReadFileOptions): Promise<FileRef | {
        data: string;
    }>;
    writeFile(options: WriteFileOptions): Promise<void>;
    readDir(options: PathOptions): Promise<{
        entries: DirEntry[];
    }>;
    stat(options: PathOptions): Promise<FileInfo>;
    exists(options: PathOptions): Promise<{
        value: boolean;
    }>;
    mkdir(options: PathOptions & {
        recursive?: boolean;
    }): Promise<void>;
    remove(options: PathOptions & {
        recursive?: boolean;
    }): Promise<void>;
    rename(options: MoveOptions): Promise<void>;
    copy(options: MoveOptions): Promise<void>;
    paths(): Promise<Record<BaseDirectory, string>>;
}

export interface MoveOptions {
    from: string;
    to: string;
    base: BaseDirectory;
    toBase?: BaseDirectory;
}

export interface PathOptions {
    path: string;
    base: BaseDirectory;
}

export interface ReadFileOptions extends PathOptions {
    encoding?: Encoding;
}

export type WriteFileOptions = PathOptions & {
    append?: boolean;
    recursive?: boolean;
} & ({
    data: string;
    encoding?: Encoding;
    url?: never;
} | {
    url: string;
    data?: never;
    encoding?: never;
});

export declare const filesystem: Filesystem;

export declare function protectLeadingBom(options: WriteFileOptions): WriteFileOptions;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface FileRef {
    url: string;
    mime: string;
    size: number;
}
```
