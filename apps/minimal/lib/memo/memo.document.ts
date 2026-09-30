import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class MemoFilter extends from(cnst.Memo, (filter) => ({
  query: {},
  sort: {},
})) {}

export class Memo extends by(cnst.Memo) {}

export class MemoModel extends into(Memo, MemoFilter, cnst.memo, () => ({})) {}
