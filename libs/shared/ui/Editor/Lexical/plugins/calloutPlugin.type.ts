import type { CalloutVariant } from "../nodes/calloutNode.util";

export interface CalloutPickerState {
  rect: DOMRect;
  nodeKey: string;
  variant: CalloutVariant;
}
