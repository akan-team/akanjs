import { type Sys, script } from "@akanjs/devkit/commandDecorators";
import {
  assertPlainName,
  createPassedPrimitiveReport,
  generatedFilesForSync,
  type PrimitiveWriteReport,
  scalarChangedFiles,
} from "@akanjs/devkit/workflow";
import { ScalarRunner } from "./scalar.runner";

export class ScalarScript extends script("scalar", [ScalarRunner]) {
  async createScalar(sys: Sys, scalarName: string): Promise<PrimitiveWriteReport> {
    assertPlainName("scalar", scalarName);
    const files = await this.scalarRunner.applyScalarTemplate(sys, scalarName);
    return createPassedPrimitiveReport({
      command: "create-scalar",
      changedFiles: scalarChangedFiles(sys, scalarName, files),
      generatedFiles: generatedFilesForSync(sys),
      target: sys.name,
    });
  }
  async removeScalar(sys: Sys, scalarName: string) {
    assertPlainName("scalar", scalarName);
    await sys.removeDir(`lib/__scalar/${scalarName}`);
  }
}
