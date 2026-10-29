import type { AkanIpcMessage } from "akanjs/service";
import { SelfExec } from "./selfExec";

type SecretRequest = Extract<AkanIpcMessage, { type: "secret.request" }>;
type SecretAnswer = Extract<AkanIpcMessage, { type: "secret.answer" }>;

//* A secret the user gives a desktop app's server (an API key of their own) is kept in the OS credential store, which
//* only the shell that started the server reaches: the server asks it over the IPC channel it was started with. The
//* page's secure-storage plugin keeps another store, so no page script reads these (@akanjs/native secretStore.ts).
export class NativeSecret {
  //? A locked Linux keyring asks the user for its password before the shell can answer.
  static timeoutMs = 60_000;
  static readonly #waiting = new Map<string, (answer: SecretAnswer) => void>();
  static #listener: ((message: unknown) => void) | null = null;

  /** The server a desktop app carries; anywhere else a secret belongs in the env or `secrets`. */
  static get available(): boolean {
    return SelfExec.carried;
  }

  /** null when nothing is kept under `key`. */
  static async get(key: string): Promise<string | null> {
    return (await NativeSecret.#ask({ op: "get", key })).value ?? null;
  }

  static async set(key: string, value: string): Promise<void> {
    await NativeSecret.#ask({ op: "set", key, value });
  }

  static async remove(key: string): Promise<void> {
    await NativeSecret.#ask({ op: "remove", key });
  }

  static #ask(request: Omit<SecretRequest, "type" | "id">): Promise<SecretAnswer> {
    //? A replica behind a gateway has an IPC channel too, to the gateway: only a carried server's leads to its shell.
    const send = NativeSecret.available ? process.send?.bind(process) : undefined;
    if (!send)
      return Promise.reject(
        new Error(
          "Secrets are kept only by the desktop app that carries this server; elsewhere use the env or secrets.",
        ),
      );
    NativeSecret.#listen();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        NativeSecret.#waiting.delete(id);
        reject(new Error(`The desktop app did not answer for the secret "${request.key}".`));
      }, NativeSecret.timeoutMs);
      NativeSecret.#waiting.set(id, (answer) => {
        clearTimeout(timer);
        NativeSecret.#waiting.delete(id);
        if (answer.error === undefined) resolve(answer);
        else reject(new Error(`The desktop app refused the secret "${request.key}": ${answer.error}`));
      });
      send({ type: "secret.request", id, ...request } satisfies AkanIpcMessage);
    });
  }

  static #listen() {
    if (NativeSecret.#listener) return;
    NativeSecret.#listener = (message) => {
      const answer = message as AkanIpcMessage | null;
      if (answer?.type === "secret.answer") NativeSecret.#waiting.get(answer.id)?.(answer);
    };
    process.on("message", NativeSecret.#listener);
  }
}
