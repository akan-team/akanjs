/** Which of a slice's list requests is current: claiming a new one aborts the older, whose answer would be dropped. */
export class SliceRequest {
  #latest = 0;
  #controller: AbortController | null = null;

  claim() {
    this.#controller?.abort();
    this.#controller = new AbortController();
    this.#latest += 1;
    return { ticket: this.#latest, signal: this.#controller.signal };
  }

  isCurrent(ticket: number): boolean {
    return ticket === this.#latest;
  }
}
