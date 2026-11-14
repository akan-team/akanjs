---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`agentService.loop` now counts what a run reads as untrusted unless the app says otherwise. With no `untrusted` option, every result of a call that ran taints the run: an endpoint tool's or a client tool's, an error included.

- A run with `approve` is asked with `tainted: true` for every call after the first result.
- A run with no `approve` writes only in the batch the model wrote before any result came back. A later write is not run: its result carries the code `writeAfterRead` and a sentence saying to pass `approve` or `untrusted`, and the server logs a warning naming the tool.
- `askUser`'s answer, `openToolkit`'s answer and a call the run refused without running taint nothing. A resume cannot tell a stored refusal from a stored result, so with no `untrusted` it counts every stored tool result.
- `untrusted` still decides for endpoint results when it is given: `() => false` trusts every one, and `(result) => !own.has(result.name)` trusts the endpoints the app names. No endpoint option says whose text a tool returns, so the predicate is where that is declared.
- A client tool's answer always taints the run and is never shown to `untrusted`: a page may lend a tool under the name of an endpoint the run does not list, which a predicate reading names would trust. `approve` receives `client: true` for a call to a page's tool, and only `approve` lets a write follow a page's answer.
- A compaction summary is now always written with its `tainted` field, and a stored summary without one counts as tainted in every run, where it used to count only in a run with `untrusted`.

**Upgrading.** This changes a default of the 3.2.0 release candidates. A `loop` call that passes neither `untrusted` nor `approve` and whose `allow` or `clientTools` hold a tool that changes data must now choose one of three:

- pass `approve`, and decide there what may run once `tainted` is `true`;
- pass `untrusted: (result) => …` returning `true` for the results that can carry text someone else wrote;
- pass `untrusted: () => false` to keep the release candidates' behaviour for endpoint tools, when nothing they return was written by anyone but the app and the member.

A run with `clientTools` and no `approve` refuses every write after a page's answer, whatever `untrusted` returns: pass `approve` and allow there what may follow. A call that already passes `untrusted` otherwise changes nothing, with one exception for stored transcripts: a summary stored without a `tainted` field by a run that had no `untrusted` now taints the run that resumes from it. Set `tainted: false` on such a stored summary if what it replaced was the app's own data. A call that passes only `approve` now receives `tainted: true` after the first result, so an approver that denies or defers every tainted call does so from then on: pass `untrusted` as well to keep `tainted` for the results that warrant it.
