interface HeadSpliceOptions {
  afterOpen: string;
  beforeClose: string;
  rewriteOpening?: (html: string) => string;
  withoutHead?: (html: string) => string;
}

export class HeadSplice {
  static readonly #open = /<head(\s[^>]*)?>/i;
  static readonly #close = "</head>";

  static into(
    stream: ReadableStream<Uint8Array>,
    { afterOpen, beforeClose, rewriteOpening = (html) => html, withoutHead = rewriteOpening }: HeadSpliceOptions,
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffered = "";
    let awaiting: "open" | "close" | undefined = "open";

    return stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (!awaiting) {
            controller.enqueue(chunk);
            return;
          }
          buffered += decoder.decode(chunk, { stream: true });
          let out = "";
          if (awaiting === "open") {
            const match = HeadSplice.#open.exec(buffered);
            if (!match) return;
            const end = match.index + match[0].length;
            out = rewriteOpening(buffered.slice(0, end)) + afterOpen;
            buffered = buffered.slice(end);
            awaiting = "close";
          }
          const close = beforeClose ? buffered.indexOf(HeadSplice.#close) : 0;
          if (close < 0) {
            const held = Math.min(buffered.length, HeadSplice.#close.length - 1);
            out += buffered.slice(0, buffered.length - held);
            buffered = buffered.slice(buffered.length - held);
            if (out) controller.enqueue(encoder.encode(out));
            return;
          }
          controller.enqueue(encoder.encode(out + buffered.slice(0, close) + beforeClose + buffered.slice(close)));
          buffered = "";
          awaiting = undefined;
          //? React cuts its output by bytes. Later chunks pass through as bytes, so the start of a character this
          //? chunk's end cut goes out as bytes too; left in the decoder it would surface at the document's end.
          const cut = HeadSplice.#cutCharacter(chunk);
          if (cut.length) controller.enqueue(cut);
        },
        flush(controller) {
          if (!awaiting) return;
          // No <head> (e.g. an error shell): emit the buffer rather than swallow the document.
          const rest = buffered + decoder.decode();
          if (rest) controller.enqueue(encoder.encode(awaiting === "open" ? withoutHead(rest) : rest));
        },
      }),
    );
  }

  static #cutCharacter(chunk: Uint8Array): Uint8Array {
    for (let back = 1; back <= Math.min(3, chunk.length); back++) {
      const byte = chunk[chunk.length - back];
      if (byte === undefined || byte < 0x80) break;
      if (byte < 0xc0) continue;
      const length = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2;
      return chunk.subarray(chunk.length - (back < length ? back : 0));
    }
    return chunk.subarray(chunk.length);
  }
}
