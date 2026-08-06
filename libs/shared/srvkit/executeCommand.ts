import { spawn } from "node:child_process";
import type { Logger } from "akanjs/common";

interface ExecuteCommandStreamOptions {
  logger?: Logger;
  onStdout?: (chunk: string) => void | Promise<void>;
  onStderr?: (chunk: string) => void | Promise<void>;
}

export const executeCommand = (command: string, logger?: Logger): Promise<{ stdout: string; stderr: string }> => {
  return executeCommandStream(command, { logger });
};

export const executeCommandStream = (
  command: string,
  { logger, onStdout, onStderr }: ExecuteCommandStreamOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = spawn("sh", ["-c", command], { stdio: "pipe" });

    let stdout = "";
    let stderr = "";
    const callbacks: Promise<unknown>[] = [];

    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      logger?.debug(chunk);
      stdout += chunk;
      if (onStdout) callbacks.push(Promise.resolve(onStdout(chunk)));
    });
    proc.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      logger?.debug(chunk);
      stderr += chunk;
      if (onStderr) callbacks.push(Promise.resolve(onStderr(chunk)));
    });

    proc.on("close", async (code) => {
      await Promise.allSettled(callbacks);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        if (stderr) logger?.error(stderr);
        const error = new Error(`Command failed with code ${code}: ${command}`);
        Object.assign(error, { stdout, stderr });
        reject(error);
      }
    });

    proc.on("error", reject);
    return { stdout, stderr };
  });
};
