import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="service-abstract" title="service.abstract.md">
        <Docs.Title>service.abstract.md</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service abstract explains the intent and boundaries of a workflow or integration module. Service folders keep the underscore, but the abstract filename drops it: `lib/_payment/payment.abstract.md`.",
              ko: "service abstract는 workflow 또는 integration module의 의도와 경계를 설명합니다. service folder에는 underscore를 유지하지만 abstract 파일명은 `lib/_payment/payment.abstract.md`처럼 underscore를 제외합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use it for rules that should guide service, signal, store, and UI changes, especially when a workflow touches external systems or background work.",
              ko: "service, signal, store, UI 변경을 안내해야 하는 규칙을 여기에 둡니다. 특히 workflow가 외부 시스템이나 background work와 연결될 때 유용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="lib/_payment/payment.abstract.md"
          language="markdown"
          code={`# Payment Service Abstract

## Purpose

Describe the workflow or integration this service owns.

## Domain Rules

- Keep durable workflow and integration invariants here.

## Data Meaning

Explain important inputs, outputs, and state meanings.

## Workflows

Describe external calls, jobs, state transitions, or service orchestration.

## Agent Notes

- Keep business behavior in service code.
- Expose callable actions through signal files.
- Update this abstract when public behavior or workflow rules change.

## Related Modules

- None documented yet.`}
        />
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
