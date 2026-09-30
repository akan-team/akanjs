# scalar.abstract.md

- Source: /conventions/scalar/abstract
- Mirror: /llms/pages/conventions/scalar/abstract.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- scalar.abstract.md (#scalar-abstract)
- Writing The Rules (#rules)
- Fill In The Scaffold (#scaffold)

## Content

scalar.abstract.md

Every scalar keeps one `lib/__scalar/<scalar>/<scalar>.abstract.md`: a few lines of markdown about the value. A scalar is a value that something else holds, usually a model's field, so this file answers not what the value is, but what may be assumed about it.

What May Be Assumed

Take `coordinate` in `libs/util`. Its constant file and its abstract say different things about the same array.

What The Constant File Shows

`coordinates` is an array of two floats.

What Only The Abstract Says

Longitude comes first, the opposite of how almost everyone says a position out loud.

The Three Parts

A scalar abstract has three parts, and there is no fourth:

<one sentence: what this value represents, and who holds it>

<something a caller would otherwise get wrong>

<two to five bullets in all>

Part

- # <scalar> Abstract: One title line with the scalar name spelled the way its folder spells it. — Example: `# coordinate Abstract`

- One sentence: What the value represents and, when it matters, who holds it, with no heading above.

- ## Rules: Two to five bullets: a fixed value, a field order, a unit, a lifetime, what a static computes.

**No workflow section.** All 17 scalar abstracts in the Akan.js repository have these three parts, and none has a workflow. That is where a scalar differs from `model.abstract.md`, whose optional fourth part is `## Workflow`.

**A value has no lifecycle of its own.** It is embedded in something else, so there is no flow of its own to describe.

**A state change still fits in one rule.** When a held value does move between states, as `oauthRequest` does, it is one `## Rules` bullet: `pending -> approved | denied`, never back.

Writing The Rules

A bullet belongs in Rules only if a caller would get something wrong without it. One real abstract shows what that looks like.

A Real Example

The whole of `coordinate.abstract.md` is eight lines, for a class with fourteen static helpers:

Four bullets, and each one is something a caller would otherwise get wrong:

The rule says

Without it, a caller assumes

- `type` is always `Point`. — That `type` is open and could hold another GeoJSON shape.

- `coordinates` is longitude, then latitude. — The spoken order, with latitude first.

- Distance is spherical, and the 3D form folds in the altitude difference. — A flat-plane distance, or one that ignores altitude.

- Bounds, center and zoom need a list of coordinates. — That an empty list works, but `computeCenterAndZoomFromLocations` returns `null`.

**Nothing the declaration already says.** No bullet lists the fields or their types; each one says what `coordinate.constant.ts` cannot.

**One language per file.** Korean and English abstracts sit side by side in this repository (the `oauth*` scalars are English), but a language switch inside one file is not.

What Earns A Bullet

Examples from the scalars in this repository, sorted by whether they belong in Rules:

Content

Write

Leave out

- What the type cannot carry

  - A unit: Kilometres rather than metres: `getDistanceKm` and `getDistanceM` differ only by unit.

  - An order: Longitude before latitude in `coordinate`.

  - A match by position: Each `fileMeta` lines up with the uploaded file at the same index.

  - A lifetime or a consumption rule: For a held value: an `oauthGrant` lives 60 seconds and is spent on first exchange, pass or fail.

  - What a static computes: Only when a caller could reasonably expect something else, such as a flat distance.

- What the code already says

  - The field list: The constant file already lists every field.

  - The types: Each `field(...)` declaration already states its type.

  - That it is reusable: Every scalar is reusable, so saying so tells the reader nothing.

Do this

Not this

Fill In The Scaffold

`akan create-scalar` writes the first abstract for you, called the scaffold. It already has the house shape: the title, a placeholder sentence and two placeholder rules. Every line in angle brackets is a prompt, and none of them survives the first real edit.

What `akan create-scalar price` writes:

What each line becomes:

Scaffold

Becomes

- # price Abstract — Written for you from the folder name. Keep it.

- <One sentence …> — Replaced by the value this scalar holds and what embeds it, stated as fact.

- ## Rules — Stays. Both placeholder bullets become what a caller may assume about the value, two to five in all.

- A field's meaning — Not here: a trailing comment beside the field in `price.constant.ts`.

- Workflow — None: a value embedded in something else has no lifecycle of its own.

**Field meaning lives beside the field.** A trailing comment is where the next reader of that field looks, as in `oauthGrant.constant.ts`:

Keeping It Current

Read it before changing the scalar, and update it only when something callers rely on changes:

Change

Update

Leave

- When what callers rely on changes

  - Validation meaning: What counts as a valid value, such as the 1 to 5 satisfaction range in `leaveInfo`.

  - Public behavior: What callers can observe, such as what a static returns.

  - Reuse rules: How it combines with other scalars, as `accessLog` stores its location as a `coordinate`.

- When only how the code looks changes

  - Formatting: Whitespace and line breaks the formatter decides.

  - Imports: Adding, removing or reordering imports.

  - Style: A code style change that alters no behavior.

## Code Examples

### apps/koyo/lib/__scalar/price/price.abstract.md

```markdown
# price Abstract
<one sentence: what this value represents, and who holds it>

## Rules
- <something a caller would otherwise get wrong>
- <two to five bullets in all>
```

### libs/util/lib/__scalar/coordinate/coordinate.abstract.md

```markdown
# coordinate Abstract
GeoJSON Point 좌표와 고도를 표현하고 거리/방위 계산을 제공한다.

## Rules
- type은 `Point`로 고정된다.
- coordinates는 longitude, latitude 순서를 따른다.
- 거리 계산은 지구 반지름 기반 구면 거리이며 3D 계산은 altitude 차이를 더한다.
- 지도 표시용 bounds, center, zoom 계산은 좌표 목록이 있을 때만 가능하다.
```

### apps/koyo/lib/__scalar/price/price.abstract.md

```markdown
# price Abstract

<One sentence: the value this scalar holds, and what embeds it.>

## Rules

- <What a caller may assume about the value that the constant file cannot say: an order, a unit, a fixed value.>
- <Two to five of them. A single field's meaning goes in a trailing comment beside it in the constant file.>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

