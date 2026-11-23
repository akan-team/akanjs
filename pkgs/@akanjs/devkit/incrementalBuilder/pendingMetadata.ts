//* Signal and dictionary saves no batch has built green yet. Noted when the save is planned, so one whose batch never
//* built (a barrel sync error) still rides the next pages build: each pages build carrying any rebuilds the dictionary
//* assets and rewrites the base artifact the restarted backend boots on.
export class PendingMetadata {
  readonly #files = new Map<string, number>();

  note(files: readonly string[], generation: number): void {
    for (const file of files) this.#files.set(file, generation);
  }

  get files(): string[] {
    return [...this.#files.keys()].sort();
  }

  /** After a green batch of `generation`: every save noted up to it was noted before that batch started. */
  settle(generation: number): void {
    for (const [file, noted] of this.#files) if (noted <= generation) this.#files.delete(file);
  }
}
