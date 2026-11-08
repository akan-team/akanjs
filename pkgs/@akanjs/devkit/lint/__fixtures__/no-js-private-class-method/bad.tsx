export class SyncPrivate { #compute() { return 1; } } // @flag
export class AsyncPrivate { async #load() { return 1; } } // @flag
export class StaticPrivate { static #make() { return 1; } } // @flag
export class CallsPrivate { run() { this.#compute(); } } // @flag
export class CallsPrivateOptionally { run() { this.#compute?.(); } } // @flag
