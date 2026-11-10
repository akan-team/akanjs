export interface ErrorReportOption {
  /** Called with the failed request's dictionary key, as a `Button`'s `onError` takes it; the action still rejects. */
  onError?: (key: string) => void;
}
export interface CreateOption<Full extends { id: string }> extends ErrorReportOption {
  path?: string;
  modal?: string;
  sliceName?: string;
  onSuccess?: (model: Full) => void | Promise<void>;
}
export interface NewOption {
  modal?: string;
  setDefault?: boolean;
  sliceName?: string;
  /** Built by the shell from the raw seed (merged date defaults would rotate the key). Absent means no draft. */
  draftScope?: string;
}
export interface EditOption {
  modal?: string | null;
  /** Built by the shell from the record id. Absent means no draft. */
  draftScope?: string;
}
