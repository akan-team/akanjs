import type { ReadStream } from "fs";
import type { Readable } from "stream";

export type { DynamicModule as Module } from "@nestjs/common";
export interface FileStream {
  filename: string;
  mimetype: string;
  encoding: string;
  createReadStream(): ReadStream | Readable;
}
export interface LocalFile {
  filename: string;
  mimetype: string;
  encoding: string;
  localPath: string;
}
