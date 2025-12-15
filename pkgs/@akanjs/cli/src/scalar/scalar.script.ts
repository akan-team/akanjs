import { type Sys } from "@akanjs/devkit";

import { ScalarRunner } from "./scalar.runner";

export class ScalarScript {
  #runner = new ScalarRunner();

  async createScalar(sys: Sys, scalarName: string) {
    await this.#runner.applyScalarTemplate(sys, scalarName);
  }
  async createScalarWithAi(sys: Sys, scalarName: string) {
    const { session, scalarNames } = await this.#runner.createScalarConstant(sys, scalarName);
    await this.#runner.updateScalarDictionaries(sys, scalarNames, { session });
  }
  async removeScalar(sys: Sys, scalarName: string) {
    await sys.removeDir(`lib/__scalar/${scalarName}`);
  }
}
