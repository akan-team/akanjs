---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

An `Agent.Zone`'s label and a value published with `st.expose`, `st.useState` or `useAgentResource` reach the model the way route params and store keys do: ids, enum members, numbers and booleans in the turn's context, free text through a read tool.

- **A published value rides in the `screen` block only when it is the app's own kind of data.** A string rides when it is one token (the rule route params follow) or an ISO timestamp, beside numbers, booleans and `null`. A list rides when every item does and it spells at most twelve words; a list with free text in it is left out whole. An object keeps its fields of that kind, at most twelve of them and twelve words of values, under names that are tokens. A resource with anything left out is marked `withheld: true`, and one whose read threw is listed with no error text.
- **`readState(name)` answers a published value.** The name is the one the `screen` block lists, a zone's prefix included. The answer is the whole value, as page content, so the first change after it asks the user first. A store key the screen reads is answered before a published value of the same name.
- **A zone's `label` rides only when it is one token.** `readScreen` with `section` set to the zone's path, or with no `section` inside the zone's own chat, starts with a `Zone label:` line when the label was left out.
- `StoreSurfaceSource` takes the surface it is attached to as its second argument, `AgenticSurface.shared` by default.
- The agent guideline and the `akan-agent` skill describe the rule.

**Upgrading.** A model that read a sentence from `st.expose`, `st.useState`, `useAgentResource` or a zone's `label` in the turn's context now finds the resource marked `withheld` and reads it with `readState`, which makes the next change ask for approval. Where an agent should act on a value without that ask, publish an id, a count or an enum member. A host that builds its own `StoreSurfaceSource` on a surface other than `AgenticSurface.shared` passes that surface to it.
