export interface RawSourceMap {
  version: 3;
  file?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

export interface SourceMapSection {
  /** The line of the combined file where the section's generated line 0 lands. */
  line: number;
  map: RawSourceMap;
}

type Segment = [number] | [number, number, number, number] | [number, number, number, number, number];

//* Flattened rather than an index map (`sections`): Safari's inspector, which debugs the iOS WebView, is not known
//* to read index maps, and every section here starts at column 0 of its own lines, so flattening is only re-basing.
export class CsrDevSourceMap {
  static readonly #chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  static readonly #digits = new Map([...CsrDevSourceMap.#chars].map((char, index) => [char, index]));

  //? A source shared by several sections (a module inlined into more than one importer) is listed once.
  static merge(file: string, sections: SourceMapSection[], lineCount: number): RawSourceMap {
    const sources: string[] = [];
    const sourcesContent: (string | null)[] = [];
    const sourceIndex = new Map<string, number>();
    const names: string[] = [];
    const lines: Segment[][] = Array.from({ length: lineCount }, () => []);
    for (const { line, map } of sections) {
      const sourceOf = map.sources.map((source, index) => {
        const known = sourceIndex.get(source);
        if (known !== undefined) return known;
        sourceIndex.set(source, sources.length);
        sources.push(source);
        sourcesContent.push(map.sourcesContent?.[index] ?? null);
        return sources.length - 1;
      });
      const nameBase = names.length;
      names.push(...map.names);
      CsrDevSourceMap.#decode(map.mappings).forEach((segments, index) => {
        const target = lines[line + index];
        if (!target) return;
        for (const segment of segments) target.push(CsrDevSourceMap.#rebase(segment, sourceOf, nameBase));
      });
    }
    return { version: 3, file, sources, sourcesContent, names, mappings: CsrDevSourceMap.#encode(lines) };
  }

  static #rebase(segment: Segment, sourceOf: number[], nameBase: number): Segment {
    if (segment.length === 1) return segment;
    const source = sourceOf[segment[1]] ?? segment[1];
    if (segment.length === 4) return [segment[0], source, segment[2], segment[3]];
    return [segment[0], source, segment[2], segment[3], segment[4] + nameBase];
  }

  static #decode(mappings: string): Segment[][] {
    const lines: Segment[][] = [];
    let source = 0;
    let originalLine = 0;
    let originalColumn = 0;
    let name = 0;
    for (const lineText of mappings.split(";")) {
      const segments: Segment[] = [];
      let column = 0;
      for (const segmentText of lineText.split(",")) {
        if (!segmentText) continue;
        const values = CsrDevSourceMap.#decodeVlq(segmentText);
        column += values[0] ?? 0;
        if (values.length < 4) {
          segments.push([column]);
          continue;
        }
        source += values[1] ?? 0;
        originalLine += values[2] ?? 0;
        originalColumn += values[3] ?? 0;
        if (values.length === 5) {
          name += values[4] ?? 0;
          segments.push([column, source, originalLine, originalColumn, name]);
        } else segments.push([column, source, originalLine, originalColumn]);
      }
      lines.push(segments);
    }
    return lines;
  }

  static #encode(lines: Segment[][]): string {
    let source = 0;
    let originalLine = 0;
    let originalColumn = 0;
    let name = 0;
    return lines
      .map((segments) => {
        let column = 0;
        return segments
          .map((segment) => {
            let text = CsrDevSourceMap.#encodeVlq(segment[0] - column);
            column = segment[0];
            if (segment.length === 1) return text;
            text += CsrDevSourceMap.#encodeVlq(segment[1] - source);
            text += CsrDevSourceMap.#encodeVlq(segment[2] - originalLine);
            text += CsrDevSourceMap.#encodeVlq(segment[3] - originalColumn);
            [, source, originalLine, originalColumn] = segment;
            if (segment.length === 5) {
              text += CsrDevSourceMap.#encodeVlq(segment[4] - name);
              name = segment[4];
            }
            return text;
          })
          .join(",");
      })
      .join(";");
  }

  static #decodeVlq(text: string): number[] {
    const values: number[] = [];
    let value = 0;
    let shift = 0;
    for (const char of text) {
      const digit = CsrDevSourceMap.#digits.get(char) ?? 0;
      value += (digit & 31) << shift;
      if (digit & 32) {
        shift += 5;
        continue;
      }
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
    return values;
  }

  static #encodeVlq(value: number): string {
    let rest = value < 0 ? (-value << 1) | 1 : value << 1;
    let text = "";
    do {
      let digit = rest & 31;
      rest >>>= 5;
      if (rest > 0) digit |= 32;
      text += CsrDevSourceMap.#chars[digit];
    } while (rest > 0);
    return text;
  }
}
