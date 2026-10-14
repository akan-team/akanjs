import { pipelineReservedEnv } from "./pipelinePlan";

//* One copy of the name rules for the planner, the CLI and the executor's secret store, so all three refuse alike.
export class PipelineNames {
  static readonly #idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
  static readonly #secretNamePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
  static readonly #envNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

  static isReservedEnv(name: string) {
    return (pipelineReservedEnv as readonly string[]).includes(name) || name.startsWith("AKAN_CI_");
  }

  static idError(id: string): string | null {
    if (PipelineNames.#idPattern.test(id)) return null;
    return `"${id}" is not an id: up to 64 lowercase letters, digits and "-", starting with a letter or digit`;
  }

  //? A malformed name is not echoed: it is often a value pasted where the name goes, and the message reaches CI logs.
  static secretNameError(name: string): string | null {
    if (!PipelineNames.#secretNamePattern.test(name))
      return 'the name is not a secret name (up to 64 uppercase letters, digits and "_", starting with a letter)';
    if (PipelineNames.isReservedEnv(name)) return `"${name}" is reserved for the executor`;
    return null;
  }

  static envNameError(name: string): string | null {
    if (!PipelineNames.#envNamePattern.test(name))
      return `"${name}" is not an environment variable name: letters, digits and "_", not starting with a digit`;
    if (PipelineNames.isReservedEnv(name)) return `"${name}" is reserved for the executor`;
    return null;
  }
}
