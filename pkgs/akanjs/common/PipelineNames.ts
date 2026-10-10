import {
  pipelineEnvNamePattern,
  pipelineIdPattern,
  pipelineReservedEnv,
  pipelineSecretNamePattern,
} from "./pipelinePlan";

//* One copy of the name rules for the planner, the CLI and the executor's secret store, so all three refuse alike.
export class PipelineNames {
  static isReservedEnv(name: string) {
    return (pipelineReservedEnv as readonly string[]).includes(name) || name.startsWith("AKAN_CI_");
  }

  static idError(id: string): string | null {
    if (pipelineIdPattern.test(id)) return null;
    return `"${id}" is not an id: up to 64 lowercase letters, digits and "-", starting with a letter or digit`;
  }

  static secretNameError(name: string): string | null {
    if (!pipelineSecretNamePattern.test(name))
      return `"${name}" is not a secret name: up to 64 uppercase letters, digits and "_", starting with a letter`;
    if (PipelineNames.isReservedEnv(name)) return `"${name}" is reserved for the executor`;
    return null;
  }

  static envNameError(name: string): string | null {
    if (!pipelineEnvNamePattern.test(name))
      return `"${name}" is not an environment variable name: letters, digits and "_", not starting with a digit`;
    if (PipelineNames.isReservedEnv(name)) return `"${name}" is reserved for the executor`;
    return null;
  }
}
