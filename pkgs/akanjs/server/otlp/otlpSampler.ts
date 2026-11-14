type Env = Record<string, string | undefined>;

const supported = new Set(["always_on", "always_off", "traceidratio"]);
const randomnessSpace = 2 ** 56;

export class OtlpSampler {
  readonly name: string;
  readonly #parentBased: boolean;
  readonly #threshold: bigint | null;

  constructor(name: string, ratio = 1) {
    this.name = name;
    this.#parentBased = name.startsWith("parentbased_");
    const root = this.#parentBased ? name.slice("parentbased_".length) : name;
    //? OTel's TraceIdRatioBased: the trace id's last 56 bits are its randomness, sampled when at or above (1 - ratio)·2^56.
    this.#threshold =
      root === "always_on"
        ? 0n
        : root === "always_off"
          ? null
          : BigInt(Math.round((1 - Math.min(1, Math.max(0, ratio))) * randomnessSpace));
  }

  get neverSamples(): boolean {
    return !this.#parentBased && this.#threshold === null;
  }

  sample(traceId: string, parentSampled: boolean | null): boolean {
    if (this.#parentBased && parentSampled !== null) return parentSampled;
    if (this.#threshold === null) return false;
    return this.#threshold === 0n || BigInt(`0x${traceId.slice(18)}`) >= this.#threshold;
  }

  static fromEnv(env: Env, warn: (message: string) => void): OtlpSampler | null {
    const name = (env.OTEL_TRACES_SAMPLER?.trim() || "parentbased_always_on").toLowerCase();
    const root = name.startsWith("parentbased_") ? name.slice("parentbased_".length) : name;
    if (!supported.has(root)) {
      warn(`OTEL_TRACES_SAMPLER=${name} is not supported; no spans are exported`);
      return null;
    }
    if (root !== "traceidratio") return new OtlpSampler(name);
    const arg = env.OTEL_TRACES_SAMPLER_ARG?.trim();
    const ratio = arg ? Number(arg) : 1;
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      warn("OTEL_TRACES_SAMPLER_ARG is not a number from 0 to 1; using 1.0");
      return new OtlpSampler(name, 1);
    }
    return new OtlpSampler(name, ratio);
  }
}
