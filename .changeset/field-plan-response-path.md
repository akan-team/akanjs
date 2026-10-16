---
"akanjs": patch
---

A response is resolved and serialized from a field plan built once per model class (`FieldPlan` in `akanjs/constant`) instead of walking `FIELD_META` and its getters for every object, and a return type with no relation or `resolve` field anywhere below it resolves in one synchronous pass instead of awaiting each row and each embedded scalar. Measured in process, a 20-row list of a six-field scalar went from 16.0 to 6.5 µs per call. The output is unchanged.
