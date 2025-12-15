import { lowerlize } from "@akanjs/common";
import { Argument, Commands, Option, Sys, Target } from "@akanjs/devkit";

import { ScalarScript } from "./scalar.script";

@Commands()
export class ScalarCommand {
  scalarScript = new ScalarScript();

  @Target.Public()
  async createScalar(
    @Argument("scalarName", { desc: "name of scalar" }) scalarName: string,
    @Option("ai", { type: "boolean", default: false, desc: "use ai to create scalar" }) ai: boolean,
    @Sys() sys: Sys
  ) {
    if (ai) await this.scalarScript.createScalarWithAi(sys, lowerlize(scalarName.replace(/ /g, "")));
    await this.scalarScript.createScalar(sys, lowerlize(scalarName.replace(/ /g, "")));
  }
  @Target.Public()
  async removeScalar(@Argument("scalarName", { desc: "name of scalar" }) scalarName: string, @Sys() sys: Sys) {
    await this.scalarScript.removeScalar(sys, scalarName);
  }
}
