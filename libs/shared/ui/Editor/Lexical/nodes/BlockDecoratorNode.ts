import { DecoratorNode } from "lexical";
import type { JSX } from "react";

/** A media block: a bare `<div>` host its `decorate()` component draws into, and never inline. */
export abstract class BlockDecoratorNode extends DecoratorNode<JSX.Element> {
  override createDOM(): HTMLElement {
    return document.createElement("div");
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): false {
    return false;
  }
}
