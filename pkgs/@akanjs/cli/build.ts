import { CliDistBuilder } from "./cliDistBuilder";

try {
  const outcome = await new CliDistBuilder({ cliDir: import.meta.dir }).build();
  // Silent by default, the way this script has always been on success. Opt in when diagnosing a
  // stale `dist/` — "up-to-date" after editing CLI or devkit source is the shape of a stamp bug.
  if (process.env.AKAN_CLI_BUILD_VERBOSE === "1") console.info(`[cli-build] ${outcome}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
