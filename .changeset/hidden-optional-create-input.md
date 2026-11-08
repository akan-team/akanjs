---
"akanjs": patch
---

A hidden field declared `.optional()` (`field.hidden(String).optional()`) is optional again in a service's `create<Model>` and `create<Model>Many` input, and in the document type `by()` makes of an input model or a scalar. It was typed there as a required, non-null value, though the model's own document already typed it optional, so a create that left it out needed a cast. A hidden field without `.optional()` stays required. Code that read such a field off a scalar's document as always present now handles its absence, as it already did on the model's document.
