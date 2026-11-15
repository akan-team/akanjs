import { AkanError } from "akanjs/base";
import type { AdmissionRefusal } from "./admissionQueue";

export type RscRenderRefusalCode = "renderQueueFull" | "renderQueueTimeout";

export class RscRenderRefusal extends AkanError<RscRenderRefusalCode> {
  static readonly #codes: Record<AdmissionRefusal, RscRenderRefusalCode> = {
    "queue-full": "renderQueueFull",
    "wait-timeout": "renderQueueTimeout",
  };

  constructor(code: RscRenderRefusalCode, message: string) {
    super(code, message, { statusCode: 503 });
  }

  static of(reason: AdmissionRefusal, message: string): RscRenderRefusal {
    return new RscRenderRefusal(RscRenderRefusal.#codes[reason], message);
  }

  static isCode(code: unknown): code is RscRenderRefusalCode {
    return Object.values(RscRenderRefusal.#codes).some((known) => known === code);
  }
}
