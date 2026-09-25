---
"akanjs": patch
---

fix: an undescribable `st.tool` argument withdraws the tool instead of throwing during render

`.arg(name, type)` validated the type where it was written and threw for anything that was not a scalar or an
enum. That check runs during render, so a model class passed to one argument of one component tool aborted the
server render of the whole route — React fell back to client rendering with `st.tool takes scalar and enum
arguments only.`, a message naming neither the tool, nor the argument, nor the type.

It now withdraws the tool the way a falsy name does — nothing is published, the callable still drives the click a
person makes, and the page renders — and reports it as
`st.tool("editProject") is not published: its "info" argument is the type PortfolioInfo, and st.tool takes scalar
and enum arguments only.` `st.useState`'s `set` degrades to read-only on the same terms. This matches what the
surface already did everywhere else: `FormFields` drops a field it cannot describe, and MCP refuses an endpoint
and names it in the boot log. An agent-tooling concern should not be able to cost a route its server rendering.

Note that form fields were never able to trigger this: `useFormTools` and `useFieldTool` build their schemas from
an effect, which does not run during SSR. A regression test now server-renders a form over a model carrying an
embedded-scalar array field to keep it that way.
