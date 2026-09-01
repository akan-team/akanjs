import { Any } from "akanjs/base";
import { via } from "akanjs/constant";

export class InsightRows extends via((field) => ({
  columns: field([String]), // the answer's column names, in the order the statement selected them
  rows: field([Any]), // one object per row, keyed by `columns` — the shape is the statement's, not a model's
  truncated: field(Boolean, { default: false }), // the row ceiling cut the answer short; do not read it as complete
})) {
  isEmpty() {
    return !this.rows.length;
  }
  /** What to say above the table: a partial answer has to read as one. */
  formatCount() {
    return this.truncated ? `${this.rows.length}+ rows` : `${this.rows.length} rows`;
  }
}
