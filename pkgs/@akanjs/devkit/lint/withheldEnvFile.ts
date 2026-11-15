//* An env file holds deployment secrets, and a source line, a formatter diff or a rule message quotes them.
export class WithheldEnvFile {
  static readonly #envFile = /[\\/]env[\\/]env\.(?:server|client)(?:\.[A-Za-z0-9-]+)*\.ts$/;
  static readonly note = "the text is withheld because this file holds secrets";

  static isEnvFile(fileName: string | undefined) {
    return (
      fileName !== undefined && WithheldEnvFile.#envFile.test(fileName.startsWith("env/") ? `/${fileName}` : fileName)
    );
  }
}
