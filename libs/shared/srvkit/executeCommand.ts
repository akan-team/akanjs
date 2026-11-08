import { spawn } from "node:child_process";
import type { Logger } from "akanjs/common";

interface OutputCapture {
  append(text: string): unknown;
  readonly text: string;
}

interface ExecuteCommandStreamOptions {
  logger?: Logger;
  onStdout?: (chunk: string) => void | Promise<void>;
  onStderr?: (chunk: string) => void | Promise<void>;
  capture?: { stdout: OutputCapture; stderr: OutputCapture };
  timeoutMs?: number;
}

export const executeCommand = (command: string, logger?: Logger): Promise<{ stdout: string; stderr: string }> => {
  return executeCommandStream(command, { logger });
};

export const executeCommandStream = (
  command: string,
  { logger, onStdout, onStderr, capture, timeoutMs }: ExecuteCommandStreamOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    //? A group of its own, so a timeout kills what the shell started too: killing the shell alone leaves them running.
    const proc = spawn("sh", ["-c", command], { stdio: "pipe", detached: !!timeoutMs });
    let isTimedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          isTimedOut = true;
          try {
            if (proc.pid) process.kill(-proc.pid, "SIGKILL");
          } catch (error) {
            //? ESRCH is a group that already exited while a process it moved out still holds the pipes; a throw from this timer is uncaught, and the server exits on one.
            if ((error as { code?: string }).code !== "ESRCH")
              logger?.warn(`Failed to kill the process group of a timed-out command: ${String(error)}`);
          }
          reject(Object.assign(new Error(`Command timed out after ${timeoutMs}ms: ${command}`), { stdout, stderr }));
        }, timeoutMs)
      : null;

    let stdout = "";
    let stderr = "";
    const callbacks: Promise<unknown>[] = [];

    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      logger?.debug(chunk);
      if (capture) capture.stdout.append(chunk);
      else stdout += chunk;
      if (onStdout) callbacks.push(Promise.resolve(onStdout(chunk)));
    });
    proc.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      logger?.debug(chunk);
      if (capture) capture.stderr.append(chunk);
      else stderr += chunk;
      if (onStderr) callbacks.push(Promise.resolve(onStderr(chunk)));
    });

    proc.on("close", async (code) => {
      if (timer) clearTimeout(timer);
      if (isTimedOut) return;
      await Promise.allSettled(callbacks);
      if (capture) {
        stdout = capture.stdout.text;
        stderr = capture.stderr.text;
      }
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
