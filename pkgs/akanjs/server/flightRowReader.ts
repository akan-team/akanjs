//? RSDW's client reads a row with one of these tags as `<id>:<tag><hex byte length>,<raw bytes>`, with no newline.
export const FLIGHT_LENGTH_PREFIXED_TAGS = "TAOobUSsLlGgMmV";

const NEWLINE = 10;
const COLON = 58;
const COMMA = 44;
const TEXT = 84;
const ROW_ID = 0;
const ROW_TAG = 1;
const ROW_LENGTH = 2;
const ROW_LINE = 3;
const ROW_PAYLOAD = 4;
const EMPTY = new Uint8Array(0);
//? The copy runs on the thread that renders the shell; copying a held megabyte chunk whole delays its first byte.
const MAX_COPIED_BATCH_BYTES = 16 * 1024;

const lengthPrefixedTags = new Uint8Array(256);
for (const tag of FLIGHT_LENGTH_PREFIXED_TAGS) lengthPrefixedTags[tag.charCodeAt(0)] = 1;

const joinRows = (rows: Uint8Array[]): Uint8Array => {
  const joined = new Uint8Array(rows.reduce((total, row) => total + row.byteLength, 0));
  let offset = 0;
  for (const row of rows) {
    joined.set(row, offset);
    offset += row.byteLength;
  }
  return joined;
};

const isLineRowTag = (byte: number): boolean => (byte > 64 && byte < 91) || byte === 35 || byte === 114 || byte === 120;

const hexDigit = (byte: number): number => (byte > 96 ? byte - 87 : byte - 48);

export interface FlightLineRowHandler {
  (row: Uint8Array, tag: string): Uint8Array | null;
  end?: () => void;
}

interface FlightRowSink {
  enqueue(row: Uint8Array, binary?: boolean): void;
}

//? A rewrite (one row, ending where the old one did) reaches later handlers as a pass of its own would read it.
const lineRowTagOf = (row: Uint8Array): string | null => {
  const colon = row.indexOf(COLON);
  if (colon === -1 || colon + 1 === row.byteLength) return null;
  const byte = row[colon + 1];
  if (lengthPrefixedTags[byte] === 1) return null;
  return isLineRowTag(byte) ? String.fromCharCode(byte) : "";
};

class FlightRowReader {
  readonly #onLineRows: FlightLineRowHandler[];
  #state = ROW_ID;
  #tag = 0;
  #length = 0;
  #pending: Uint8Array[] = [];

  constructor(onLineRows: FlightLineRowHandler[]) {
    this.#onLineRows = onLineRows;
  }

  read(chunk: Uint8Array, sink: FlightRowSink): void {
    const end = chunk.byteLength;
    let rowStart = 0;
    let index = 0;
    while (index < end) {
      if (this.#state === ROW_ID) {
        const byte = chunk[index++];
        if (byte === COLON) this.#state = ROW_TAG;
        else if (byte === NEWLINE) {
          sink.enqueue(this.#cutRow(chunk, rowStart, index));
          rowStart = index;
        }
      } else if (this.#state === ROW_TAG) {
        const byte = chunk[index];
        const lengthPrefixed = lengthPrefixedTags[byte] === 1;
        this.#state = lengthPrefixed ? ROW_LENGTH : ROW_LINE;
        if (lengthPrefixed || isLineRowTag(byte)) {
          this.#tag = byte;
          index++;
        }
      } else if (this.#state === ROW_LENGTH) {
        const byte = chunk[index++];
        if (byte !== COMMA) this.#length = (this.#length << 4) | hexDigit(byte);
        else if (this.#length > 0) this.#state = ROW_PAYLOAD;
        else {
          sink.enqueue(this.#cutRow(chunk, rowStart, index));
          rowStart = index;
        }
      } else if (this.#state === ROW_PAYLOAD) {
        if (end - index < this.#length) {
          this.#length -= end - index;
          index = end;
        } else {
          index += this.#length;
          const binary = this.#tag !== TEXT;
          sink.enqueue(this.#cutRow(chunk, rowStart, index), binary);
          rowStart = index;
        }
      } else {
        const newline = chunk.indexOf(NEWLINE, index);
        if (newline === -1) index = end;
        else {
          index = newline + 1;
          const tag = this.#tag;
          this.#enqueueLineRow(this.#cutRow(chunk, rowStart, index), tag, sink);
          rowStart = index;
        }
      }
    }
    if (rowStart < end) this.#pending.push(chunk.subarray(rowStart));
  }

  end(sink: FlightRowSink): void {
    if (this.#pending.length === 0) return;
    const state = this.#state;
    const tag = this.#tag;
    const rest = this.#cutRow(EMPTY, 0, 0);
    if (state === ROW_LINE) this.#enqueueLineRow(rest, tag, sink);
    else sink.enqueue(rest);
  }

  #enqueueLineRow(row: Uint8Array, tag: number, sink: FlightRowSink): void {
    let mapped = row;
    let lineTag: string | null = tag === 0 ? "" : String.fromCharCode(tag);
    for (const onLineRow of this.#onLineRows) {
      if (lineTag === null) break;
      const next = onLineRow(mapped, lineTag);
      if (!next || next.byteLength === 0) return;
      if (next !== mapped) lineTag = lineRowTagOf(next);
      mapped = next;
    }
    sink.enqueue(mapped);
  }

  #cutRow(chunk: Uint8Array, start: number, end: number): Uint8Array {
    this.#reset();
    const tail = chunk.subarray(start, end);
    if (this.#pending.length === 0) return tail;
    const pieces = this.#pending;
    this.#pending = [];
    pieces.push(tail);
    return joinRows(pieces);
  }

  #reset(): void {
    this.#state = ROW_ID;
    this.#tag = 0;
    this.#length = 0;
  }
}

//? The SSR document inlines a chunk as one script, base64 whole if any byte is not UTF-8, so a binary row goes alone.
class FlightRowBatch implements FlightRowSink {
  readonly #sink: FlightRowSink;
  #rows: Uint8Array[] = [];
  #byteLength = 0;
  #contiguous: boolean = true;

  constructor(sink: FlightRowSink) {
    this.#sink = sink;
  }

  enqueue(row: Uint8Array, binary = false): void {
    if (binary) {
      this.flush();
      this.#sink.enqueue(row);
      return;
    }
    const last = this.#rows.at(-1);
    const contiguous =
      !last || (this.#contiguous && row.byteOffset === last.byteOffset + last.byteLength && row.buffer === last.buffer);
    if (!contiguous && this.#byteLength + row.byteLength > MAX_COPIED_BATCH_BYTES) this.flush();
    else this.#contiguous = contiguous;
    this.#rows.push(row);
    this.#byteLength += row.byteLength;
  }

  flush(): void {
    const rows = this.#rows;
    const [first] = rows;
    if (!first) return;
    const joined =
      rows.length === 1
        ? first
        : this.#contiguous
          ? new Uint8Array(first.buffer, first.byteOffset, this.#byteLength)
          : joinRows(rows);
    this.#rows = [];
    this.#byteLength = 0;
    this.#contiguous = true;
    this.#sink.enqueue(joined);
  }
}

export const mapFlightLineRows = (
  stream: ReadableStream<Uint8Array>,
  ...onLineRows: FlightLineRowHandler[]
): ReadableStream<Uint8Array> => {
  const reader = new FlightRowReader(onLineRows);
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        const batch = new FlightRowBatch(controller);
        reader.read(chunk, batch);
        batch.flush();
      },
      flush: (controller) => {
        reader.end(controller);
        for (const onLineRow of onLineRows) onLineRow.end?.();
      },
    }),
  );
};

export const flightRowsEndWatcher = (onEnd: () => void): FlightLineRowHandler =>
  Object.assign((row: Uint8Array) => row, { end: onEnd });

export type FlightRowPass = (...onLineRows: FlightLineRowHandler[]) => ReadableStream<Uint8Array>;

export const flightRowPassOf =
  (stream: ReadableStream<Uint8Array>, ...firstOnLineRows: FlightLineRowHandler[]): FlightRowPass =>
  (...onLineRows) =>
    mapFlightLineRows(stream, ...firstOnLineRows, ...onLineRows);
