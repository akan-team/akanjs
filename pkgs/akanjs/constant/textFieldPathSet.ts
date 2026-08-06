/** The `search_doc` columns a model feeds, each holding the document paths that write it. */
export class TextFieldPathSet {
  readonly title = new Set<string>();
  readonly desc = new Set<string>();
  readonly tag = new Set<string>();
  readonly thumb = new Set<string>();
  readonly filter = new Set<string>();
}
