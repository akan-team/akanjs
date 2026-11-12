# `akanjs/client/native/file-picker`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface DirectoryFile extends PickedFile {
    path: string;
}

export type FilePicker = Plugin<FilePickerApi>;

export interface FilePickerApi {
    pickFiles(options?: PickFilesOptions): Promise<{
        files: PickedFile[];
    }>;
    saveFile(options: SaveFileOptions): Promise<SaveFileResult>;
    pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult>;
}

export interface PickDirectoryOptions {
    limit?: number;
    forServer?: boolean;
}

export interface PickDirectoryResult {
    name: null | string;
    files: DirectoryFile[];
    truncated: boolean;
    grant?: string;
}

export interface PickFilesOptions {
    types?: string[];
    multiple?: boolean;
    forServer?: boolean;
}

export interface PickedFile extends FileRef {
    name: string;
    grant?: string;
}

export interface SaveFileOptions {
    name: string;
    data?: string;
    encoding?: "base64" | "utf8";
    url?: string;
    mime?: string;
    forServer?: boolean;
}

export interface SaveFileResult {
    saved: boolean;
    name?: string;
    grant?: string;
}

export interface UseFilePicker {
    supported: {
        pickFiles: boolean;
        saveFile: boolean;
        pickDirectory: boolean;
    };
    pending: boolean;
    error: AkanNativeError | null;
    pickFiles(options?: PickFilesOptions): Promise<PickedFile[] | null>;
    saveFile(options: SaveFileOptions): Promise<SaveFileResult | null>;
    pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult | null>;
}

export declare const filePicker: FilePicker;

export declare function useFilePicker(): UseFilePicker;
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
