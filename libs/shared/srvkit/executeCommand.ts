import { spawn } from "node:child_process";
import type { Logger } from "akanjs/common";

export const executeCommand = (command: string, logger?: Logger): Promise<{ stdout: string; stderr: string }> => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const proc = spawn("sh", ["-c", command], { stdio: "pipe" });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      logger?.debug(data.toString());
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      logger?.debug(data.toString());
      stderr += data.toString();
    });

    proc.on("close", (code) => {
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
