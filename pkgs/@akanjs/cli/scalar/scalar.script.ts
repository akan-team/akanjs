import {
  createPassedPrimitiveReport,
  generatedFilesForSync,
  type PrimitiveWriteReport,
  type Sys,
  scalarChangedFiles,
  script,
} from "@akanjs/devkit";

import { ScalarRunner } from "./scalar.runner";

export class ScalarScript extends script("scalar", [ScalarRunner]) {
  async createScalar(sys: Sys, scalarName: string): Promise<PrimitiveWriteReport> {
    const files = await this.scalarRunner.applyScalarTemplate(sys, scalarName);
    return createPassedPrimitiveReport({
      command: "create-scalar",
      changedFiles: scalarChangedFiles(sys, scalarName, files),
      generatedFiles: generatedFilesForSync(sys),
      target: sys.name,
    });
  }
  async createScalarWithAi(sys: Sys, scalarName: string): Promise<PrimitiveWriteReport> {
    const { session, scalarNames } = await this.scalarRunner.createScalarConstant(sys, scalarName);
    await this.scalarRunner.updateScalarDictionaries(sys, scalarNames, { session });
    const fileMaps = await Promise.all(
      scalarNames.map(async (name) => ({ name, files: await this.scalarRunner.applyScalarTemplate(sys, name) })),
    );
    return createPassedPrimitiveReport({
      command: "create-scalar",
      changedFiles: fileMaps.flatMap(({ name, files }) => scalarChangedFiles(sys, name, files)),
      generatedFiles: generatedFilesForSync(sys),
      target: sys.name,
    });
  }
  async removeScalar(sys: Sys, scalarName: string) {
    await sys.removeDir(`lib/__scalar/${scalarName}`);
  }
}
