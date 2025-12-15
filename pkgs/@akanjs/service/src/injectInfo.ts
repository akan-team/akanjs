import { BackendEnv, Type } from "@akanjs/base";

import { Gen, Sig, Srv, Use } from ".";

interface InjectBuilderOptions<ReturnType> {
  generateFactory?: (options: any) => ReturnType;
}
type InjectType = "service" | "use" | "env" | "generate" | "signal";

export class InjectInfo<ReturnType> {
  type: InjectType;
  generateFactory: (options: any) => ReturnType;
  constructor(type: InjectType, options: InjectBuilderOptions<ReturnType> = {}) {
    this.type = type;
    this.generateFactory = options.generateFactory ?? (() => undefined as ReturnType);
  }
  applyInjectInfo(srvRef: Type, key: string) {
    switch (this.type) {
      case "service":
        Srv()(srvRef.prototype as object, key);
        break;
      case "use":
        Use()(srvRef.prototype as object, key);
        break;
      case "env":
        Gen(this.generateFactory)(srvRef.prototype as object, key);
        break;
      case "generate":
        Gen(this.generateFactory)(srvRef.prototype as object, key);
        break;
      case "signal":
        Sig()(srvRef.prototype as object, key);
        break;
      default:
        throw new Error(`Invalid inject type: ${this.type}`);
    }
  }
}

export const makeInjectBuilder = () => ({
  service: <ReturnType>() => new InjectInfo<ReturnType>("service"),
  use: <ReturnType>() => new InjectInfo<ReturnType>("use"),
  env: <ReturnType>(
    key: string,
    generateFactory: (envValue: string, options: BackendEnv) => ReturnType = (envValue: string) =>
      envValue as ReturnType
  ) =>
    new InjectInfo<ReturnType>("env", {
      generateFactory: (options: BackendEnv) => {
        const envValue = process.env[key];
        if (!envValue) throw new Error(`Environment variable ${key} not found`);
        return generateFactory(envValue, options);
      },
    }),
  envOptional: <ReturnType>(
    key: string,
    generateFactory: (envValue: string | undefined, options: BackendEnv) => ReturnType = (
      envValue: string | undefined
    ) => envValue as ReturnType
  ) =>
    new InjectInfo<ReturnType | undefined>("env", {
      generateFactory: (options: BackendEnv) => {
        const envValue = process.env[key];
        return generateFactory(envValue, options);
      },
    }),
  generate: <ReturnType>(generateFactory: (options: BackendEnv) => ReturnType) =>
    new InjectInfo<ReturnType>("generate", { generateFactory }),
  signal: <Signal>() => new InjectInfo<Signal>("signal"),
});

export type InjectBuilder = (builder: ReturnType<typeof makeInjectBuilder>) => { [key: string]: InjectInfo<any> };

export type ExtractInjectInfoObject<InjectInfoMap extends { [key: string]: InjectInfo<any> }> = {
  [K in keyof InjectInfoMap]: InjectInfoMap[K] extends InjectInfo<infer ReturnType> ? ReturnType : never;
};
