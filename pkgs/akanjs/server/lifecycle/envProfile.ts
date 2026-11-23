import { AkanError } from "../../base/akanError";

export class EnvProfile {
  static readonly key = "AKAN_ENV_PROFILE";
  //? Security: the build writes the carried profiles in place of this read, so no deployment variable adds one.
  static readonly carriedKey = "AKAN_BUILD_ENV_PROFILES";
  static readonly namePattern = /^[a-z][a-zA-Z0-9-]*$/;

  static format(profiles: readonly string[]) {
    return profiles.join(",");
  }

  static active(
    env: NodeJS.ProcessEnv = process.env,
    carried: string | undefined = process.env.AKAN_BUILD_ENV_PROFILES,
  ): string | null {
    const profile = env[EnvProfile.key];
    if (!profile) return null;
    const names = (carried ?? "").split(",").filter(Boolean);
    if (names.includes(profile)) return profile;
    const carries = names.length ? `it carries ${names.join(", ")}` : "it carries none";
    throw new AkanError(
      "envProfileUnbuilt",
      `${EnvProfile.key}=${profile} names a server env profile this server was not built with (${carries}), so it does not start: it would run on the environment's own env file. \`docker.variants.<name>.profile\` in akan.config.ts makes \`akan build\` carry one.`,
    );
  }
}
