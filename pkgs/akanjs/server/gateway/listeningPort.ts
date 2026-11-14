//? Off AkanApp's declared surface on purpose: a gateway started on port 0 is found here by the tests that start one.
export class ListeningPort {
  static readonly #ports = new WeakMap<object, number>();

  static record(owner: object, port: number | undefined) {
    if (port === undefined) ListeningPort.#ports.delete(owner);
    else ListeningPort.#ports.set(owner, port);
  }

  static of(owner: object) {
    return ListeningPort.#ports.get(owner);
  }
}
