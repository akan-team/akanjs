# model.abstract.md

- Source: /conventions/module/abstract
- Mirror: /llms/pages/conventions/module/abstract.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.abstract.md (#module-abstract)
- A Real Example (#worked-example)
- Replace The Scaffold (#scaffold)

## Content

model.abstract.md

Every database module keeps one `lib/<model>/<model>.abstract.md`: a few lines of markdown stating the rules the module obeys but its code cannot say. Read it before changing the module, and update it when one of those rules changes.

What The Code Cannot Say

Take the `user` module in `libs/shared`. Its constant file and its abstract say different things about the same two fields.

What The Constant File Shows

`accountId` and `phone` are secret, optional strings.

What Only The Abstract Says

Neither may repeat across active, dormant and restricted accounts, but both may repeat once an account has left.

**Nothing else states it.** No field or type says it, and `user.document.ts` repeats the check in several methods without ever naming it as a rule.

**Missing it breaks sign-up.** A uniqueness index added without knowing the rule stops everyone who ever deleted an account from signing up again.

**That is the abstract's job.** It holds the invariants the module obeys but cannot state (rules that must always hold), and nothing the constant file already says.

The Four Parts

Every abstract has four parts, and only the last is optional:

<one sentence: what this module owns>

<an invariant the code cannot show>

<two to five bullets in all>

<optional: how a ticket moves from state to state>

Part

- # <model> Abstract: One title line with the module name spelled as in its file name. — Example: `# user Abstract`

- One sentence: What the module owns, stated as fact, right under the title with no heading.

- ## Rules: Two to five bullets, each an invariant a reader could not derive from the code.

- ## Workflow: Optional: a list under this heading, or one arrow chain with no heading at all. — Example: `authorize -> pending -> approved | denied -> code -> token -> refresh -> revoked`

In the Akan.js repository, 31 of the 33 abstracts are written with these parts, and six carry a `## Workflow` list. The other two belong to the app root services `_akan` and `_minimal`, which still hold the generated scaffold unedited.

A Real Example

The whole of `libs/shared/lib/user/user.abstract.md` is sixteen lines, for a module with constant, document, service, signal and store files and five components:

Read it next to the code and notice what is and is not there:

**No types.** Not one bullet names a field type, a class or a method signature.

**Only constraints and couplings.** Each rule is a constraint the database cannot express on its own, or a coupling between this module and another.

**The last rule is one you would otherwise learn by breaking it.** Restriction, dormancy, leaving and activation all move together with the `summary` aggregate.

**One language per file.** Korean is common in this repository and English is just as normal, but a language switch inside one file is not.

Replace The Scaffold

`akan create-module` writes the first abstract for you, called the scaffold. It already has the house shape: a title, one sentence and a `## Rules` list with two starting rules. The first real edit rewrites those lines to say what this module owns.

What `akan create-module project` writes in an app that mounts `libs/shared`:

**Without `libs/shared`, the first rule is closed.** It reads that nobody creates, updates or removes a project until the slice names a guard, matching the scaffolded `None` guards.

Where each line goes:

Scaffold

Becomes

- # project Abstract — Written for you, spelled as in the file name. Keep it.

- Project represents … — Rewritten as what the module owns, stated as fact.

- ## Rules — Stays, and grows to the module's real invariants, two to five in all.

- - Anyone may read a project; … — Mirrors the scaffolded slice guards; rewrite it whenever you change them.

- - Removal is soft: … — Stays: removal of a model is always soft.

- ## Workflow — Not written by the scaffold; add it, or one arrow chain, once the module has a flow.

Keeping It Current

Read it before changing the constant, document, service, signal, store or any component of the same module. Update it only when what the module means changes:

Change

Update

Leave

- When the module's meaning changes

  - A business invariant: A rule that must always hold, such as the uniqueness rule above.

  - A workflow or state transition: How a record moves, such as from `prepare` to `active`.

  - A permission: Who may do what, such as an admin adjusting a restriction.

  - Public behavior: What callers of the module can observe.

- When only how the code looks changes

  - Formatting: Whitespace and line breaks the formatter decides.

  - Imports: Adding, removing or reordering imports.

  - Style: A code style change that alters no behavior.

Do this

Not this

## Code Examples

### apps/koyo/lib/ticket/ticket.abstract.md

```markdown
# ticket Abstract
<one sentence: what this module owns>

## Rules
- <an invariant the code cannot show>
- <two to five bullets in all>

## Workflow
- <optional: how a ticket moves from state to state>
```

### libs/shared/lib/user/user.abstract.md

```markdown
# user Abstract
사용자 가입, 인증, 프로필 심사, 상태 전이를 관리한다.

## Rules
- active/dormant/restricted 계정의 accountId와 phone은 중복될 수 없다.
- prepare 사용자는 인증 단계가 끝난 뒤 active로 전환된다.
- password, phone code, SSO, refresh session은 cache와 security service로 검증한다.
- refresh token은 한 번만 쓰인다: 회전된 토큰을 다시 내밀면 계정의 모든 세션이 끊긴다(브라우저 세션). 한 토큰을 여러
  프로세스가 쥐는 호출자(클라우드 CLI)만 `refreshUserToken`에 `{ graceMs, reuseRevokes: "lineage" }`를 넘겨, 창 안의
  재사용은 새 세션으로 받고 창 밖의 재사용은 그 토큰의 lineage만 끊는다.
- 제한, 휴면, 탈퇴, 활성화는 summary 집계와 함께 움직인다.

## Workflow
- prepare user 생성 후 nickname/profile/auth 정보를 채우고 activate한다.
- 로그인은 access token과 refresh token session을 발급한다.
- 관리자는 역할, 제한, 계정 정보, 프로필 상태를 조정할 수 있다.
```

### apps/koyo/lib/project/project.abstract.md

```markdown
# project Abstract
Project represents a project workspace or business initiative managed by the app.

## Rules
- Anyone may read a project; only an admin creates, updates or removes one.
- Removal is soft: a removed project keeps its row with `removedAt` set.
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

