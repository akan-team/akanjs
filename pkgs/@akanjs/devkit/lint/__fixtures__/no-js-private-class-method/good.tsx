export class TypescriptPrivate { private compute() { return 1; } } // @ok
export class CallsTypescriptPrivate { run() { this.compute(); } } // @ok
export class PrivateField { #cache = new Map(); } // @ok
export class CallsOnAPrivateField { #cache = new Map<string, number>(); run() { return this.#cache.get("a"); } } // @ok
