import { Logger } from "akanjs/common";
import type { ProtoLightFile } from "akanjs/constant";

const UPLOAD_POLL_INTERVAL_MS = 3000;
const UPLOAD_POLL_ATTEMPTS = 40;

export type Uploading = { [field: string]: string[] };

export const releasedUpload = (uploading: Uploading, field: string, ticket?: string): Uploading => {
  const pending = uploading[field];
  if (!pending || (ticket && !pending.includes(ticket))) return uploading;
  const { [field]: tickets = [], ...rest } = uploading;
  const left = ticket ? tickets.filter((pending) => pending !== ticket) : [];
  return left.length ? { ...rest, [field]: left } : rest;
};

interface UploadPoll {
  files: { id: string }[];
  readName: string;
  read: (id: string) => Promise<ProtoLightFile>;
  holds: (id: string) => boolean;
  land: (file: ProtoLightFile) => void;
}

export const pollUploadedFiles = ({ files, readName, read, holds, land }: UploadPoll) => {
  for (const file of files) {
    let attemptsLeft = UPLOAD_POLL_ATTEMPTS;
    const intervalKey = setInterval(() => {
      void (async () => {
        if (!holds(file.id)) {
          clearInterval(intervalKey);
          return;
        }
        attemptsLeft -= 1;
        try {
          const currentFile = await read(file.id);
          if (!holds(currentFile.id)) {
            clearInterval(intervalKey);
            return;
          }
          land(currentFile);
          if (currentFile.status !== "uploading" || attemptsLeft <= 0) clearInterval(intervalKey);
        } catch (error) {
          clearInterval(intervalKey);
          Logger.warn(
            `Upload poll for ${readName} ${file.id} stopped: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      })();
    }, UPLOAD_POLL_INTERVAL_MS);
  }
};
