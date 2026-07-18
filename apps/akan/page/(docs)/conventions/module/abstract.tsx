import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="module-abstract" title="model.abstract.md">
        <Docs.Title>model.abstract.md</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A module abstract is the business-intent file for a domain module. It explains why the module exists, what rules must stay true, which workflows matter, and what agents should know before editing implementation files.",
              ko: "module abstract는 domain module의 business intent 파일입니다. 모듈이 왜 존재하는지, 어떤 규칙이 유지되어야 하는지, 어떤 workflow가 중요한지, 구현 파일을 수정하기 전에 agent가 무엇을 알아야 하는지 설명합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Do not duplicate the constant or dictionary file in prose. Use this file for information that code alone does not make obvious.",
              ko: "constant나 dictionary 파일을 자연어로 반복하지 마세요. 코드만으로 명확하지 않은 정보를 이 파일에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="lib/product/product.abstract.md"
          language="markdown"
          code={`# Product Abstract

## Purpose

Describe the business concept this module owns.

## Domain Rules

- Keep durable business invariants here.

## Data Meaning

Explain important data meanings only when the code does not make the intent obvious.

## Workflows

Describe create, update, approval, deletion, or state transition flows.

## Agent Notes

- Read this abstract before changing module behavior.
- Update it when public behavior, workflows, or invariants change.

## Related Modules

- None documented yet.`}
        />
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="update-rule" title={l.trans({ en: "Update Rule", ko: "갱신 규칙" })}>
        <Docs.Title>{l.trans({ en: "Update Rule", ko: "갱신 규칙" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Update it when business invariants, workflows, public behavior, permissions, or state transitions change.",
                ko: "business invariant, workflow, public behavior, permission, state transition이 바뀌면 갱신합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Do not update it for formatting-only, import-only, or style-only changes.",
                ko: "formatting, import, style만 바뀌는 변경에서는 갱신하지 않습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Read it before changing constant, document, service, signal, store, or UI files in the same module.",
                ko: "같은 모듈의 constant, document, service, signal, store, UI 파일을 수정하기 전에 먼저 읽습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
