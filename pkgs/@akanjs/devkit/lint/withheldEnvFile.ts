//* An env file holds deployment secrets, and a source line, a formatter diff or a rule message quotes them.
export class WithheldEnvFile {
  static readonly #name = "env[\\\\/]env\\.(?:server|client)(?:\\.[A-Za-z0-9-]+)*\\.ts";
  static readonly #envFile = new RegExp(`[\\\\/]${WithheldEnvFile.#name}$`);
  static readonly #named = new RegExp(WithheldEnvFile.#name);
  static readonly note = "the text is withheld because this file holds secrets";

  static isEnvFile(fileName: string | undefined) {
    return (
      fileName !== undefined && WithheldEnvFile.#envFile.test(fileName.startsWith("env/") ? `/${fileName}` : fileName)
    );
  }

  static namesEnvFile(text: string) {
    return WithheldEnvFile.#named.test(text);
  }
}
