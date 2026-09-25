import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="scalar-abstract" title="scalar.abstract.md">
        <Docs.Title>scalar.abstract.md</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A scalar abstract explains the meaning and reuse rules of a small embedded value object. Use it when validation intent, normalization behavior, or usage boundaries are not obvious from the scalar constant file.",
              ko: "scalar abstract는 작은 embedded value object의 의미와 재사용 규칙을 설명합니다. validation 의도, normalization 동작, 사용 경계가 scalar constant 파일만으로 명확하지 않을 때 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="lib/__scalar/money/money.abstract.md"
          language="markdown"
          code={`# Money Scalar Abstract

## Purpose

Describe the reusable value concept this scalar owns.

## Domain Rules

- Keep validation and meaning rules here.

## Data Meaning

Explain field meaning and when this scalar should be reused.

## Workflows

Describe normalization or lifecycle behavior when relevant.

## Agent Notes

- Read this abstract before changing validation meaning or public behavior.
- Do not duplicate field types from the constant file.

## Related Modules

- None documented yet.`}
        />
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
