# Akan.js Documentation Page Creation Guide

## Purpose of Documentation Pages in Akan.js

Documentation pages serve as the comprehensive knowledge base for Akan.js framework developers. They:

- Provide clear explanations of framework concepts, architecture, and components
- Offer technical reference for APIs, modules, and system functionalities
- Present implementation examples with real-world code snippets
- Establish consistent standards for documentation across the framework
- Support multi-language access for international developers
- Serve as onboarding resources for new team members
- Document best practices and common patterns for framework usage

## How to Create a Documentation Page

### 1. File Location and Structure

Documentation pages should be created in the following location:

```
apps/angelo/app/[lang]/akanjs/(docs)/docs/[category]/[pageName]/page.tsx
```

Where:

- `[lang]`: Language code (e.g., `en`, `ko`)
- `[category]`: Main documentation category (e.g., `systemArch`, `module`, `api`)
- `[pageName]`: Specific page name (e.g., `frontend`, `signal`, `authentication`)

Example path:
`apps/angelo/app/en/akanjs/(docs)/docs/module/signal/page.tsx`

### 2. Basic Page Structure

Each documentation page follows this basic structure:

```tsx
import { usePage } from "@angelo/client";
import { Docs } from "@angelo/ui";

export default function Page() {
  const { l } = usePage(); // For internationalization

  return (
    <>
      <Docs.Title>
        {l.trans({
          en: "Main Page Title",
          ko: "메인 페이지 제목",
        })}
      </Docs.Title>

      <Docs.Description>
        {l.trans({
          en: "Introduction paragraph that explains the concept...",
          ko: "개념을 설명하는 소개 문단...",
        })}
      </Docs.Description>

      <div className="divider"></div>

      <Docs.SubTitle>
        {l.trans({
          en: "Section Title",
          ko: "섹션 제목",
        })}
      </Docs.SubTitle>

      <Docs.Description>
        {l.trans({
          en: "Detailed explanation of this section...",
          ko: "이 섹션에 대한 자세한 설명...",
        })}
      </Docs.Description>

      <Docs.CodeSnippet
        language="typescript"
        code={`
// Code example
const example = "Hello Akan.js";
`}
      />

      {/* Additional sections and components */}
    </>
  );
}
```

### 3. Page Organization

Documentation pages should be organized in a hierarchical structure:

1. **Title**: Main page title (`<Docs.Title>`)
2. **Introduction**: Brief overview (`<Docs.Description>`)
3. **Sections**: Main content sections
   - Section title (`<Docs.SubTitle>`)
   - Section content (`<Docs.Description>`)
   - Code examples (`<Docs.CodeSnippet>`)
   - Subsections (`<Docs.SubSubTitle>`)
   - Tables (`<Docs.OptionTable>`, `<Docs.IntroTable>`)
4. **Related Content**: Links to related documentation pages

### 4. Internationalization

All user-facing text must support multiple languages using the translation hook:

```tsx
const { l } = usePage();

<Docs.Title>
  {l.trans({
    en: "English Title",
    ko: "한국어 제목",
    // Add other languages as needed
  })}
</Docs.Title>;
```

## Utility Components

The `Docs` namespace provides specialized components for creating consistent documentation pages. Always import and use them with the `Docs` prefix:

```tsx
import { Docs } from "@angelo/ui";
// Correct usage: <Docs.Title>, NOT import { Title } from "@angelo/ui";
```

### 1. Title Components

```tsx
<Docs.Title>Main Page Title</Docs.Title>             // H1 equivalent
<Docs.SubTitle>Section Title</Docs.SubTitle>         // H2 equivalent
<Docs.SubSubTitle>Subsection Title</Docs.SubSubTitle> // H3 equivalent
```

### 2. Content Components

**Description Block:**

```tsx
<Docs.Description>
  Detailed explanatory text that supports: - Markdown-style formatting - Multi-paragraph content - HTML elements -
  Internationalization via l.trans()
</Docs.Description>
```

**Code Snippet:**

```tsx
<Docs.CodeSnippet
  language="typescript" // Supported: typescript, bash, and others
  code={`
    // Your code example with syntax highlighting
    const example = "Hello Akan.js";
    function demo() {
      return example;
    }
  `}
/>
```

### 3. Table Components

**Option Table:** For displaying configuration options, parameters, or properties

```tsx
<Docs.OptionTable
  items={[
    {
      key: "optionName", // Option identifier
      type: "string", // Data type
      default: "defaultVal", // Default value
      desc: "Description", // Explanation (can use l.trans())
      example: "example()", // Usage example
    },
    // Additional items...
  ]}
/>
```

**Introduction Table:** For listing and describing related items

```tsx
<Docs.IntroTable
  type="conceptName" // Table category identifier
  items={[
    {
      name: "itemName", // Item name
      desc: "Description", // Explanation (can use l.trans())
      example: "example()", // Usage example
    },
    // Additional items...
  ]}
/>
```

### 4. Code Display Components

**Inline Code:**

```tsx
<Docs.Code language="typescript">inlineCodeExample</Docs.Code>
```

**Custom Code Block:**

```tsx
<Docs.CodeView>
  <Docs.Code prefix="1">// First line with line number</Docs.Code>
  <Docs.Code prefix="2">// Second line with line number</Docs.Code>
</Docs.CodeView>
```

### 5. Layout Components

The document layout is automatically applied through the parent layout.tsx file, so you don't need to use `<Docs.Layout>` in your page component.

**Header and Footer:**

```tsx
<Docs.Header>Header content</Docs.Header>
<Docs.Footer>Footer content</Docs.Footer>
```

## Best Practices

### 1. Content Organization

- Begin with a clear, concise introduction that explains the purpose and importance of the topic
- Use a logical hierarchy of headings (Title → SubTitle → SubSubTitle)
- Structure content to flow from basic concepts to advanced usage
- Include a "Getting Started" or "Basic Usage" section near the beginning
- Group related information under appropriate section headings
- Maintain consistent terminology throughout the document

### 2. Code Examples

- Include complete, working code examples that can be copied and used directly
- Provide context for each code example to explain what it demonstrates
- Use realistic, practical examples rather than overly simplified ones
- Include comments in code examples to explain key points
- Specify the correct language for proper syntax highlighting
- Show both basic and advanced usage patterns

### 3. Formatting and Style

- Use sentence case for all headings (e.g., "How to use signals" not "How To Use Signals")
- Keep paragraphs focused on a single concept
- Use lists for sequential steps or related items
- Include whitespace (dividers, margins) to separate sections visually
- Apply consistent formatting across all documentation pages

### 4. Internationalization

- Wrap all user-facing text in `l.trans()` calls with at least English and Korean translations
- Maintain parallel structure and meaning across languages
- Keep translations concise but complete
- Use descriptive keys for translation objects

### 5. Performance and Accessibility

- Use lazy-loading for heavy components when appropriate
- Ensure documentation is responsive for both desktop and mobile viewing
- Include anchor links to specific sections for easy reference
- Provide alt text for images and diagrams
- Avoid overly complex or deeply nested components

## Complete Example

```tsx
import { usePage } from "@angelo/client";
import { Docs, type IntroItem, type OptionItem } from "@angelo/ui";

export default function SignalDocsPage() {
  const { l } = usePage();

  // Define configuration options
  const signalOptions: OptionItem[] = [
    {
      key: "initialValue",
      type: "T",
      default: "undefined",
      desc: l.trans({
        en: "Initial value of the signal",
        ko: "시그널의 초기값",
      }),
      example: "signal(0)",
    },
    // Additional options...
  ];

  // Define feature list
  const signalFeatures: IntroItem[] = [
    {
      name: "createSignal",
      desc: l.trans({
        en: "Creates a new reactive signal",
        ko: "새로운 반응형 시그널을 생성",
      }),
      example: "const [value, setValue] = createSignal(0)",
    },
    // Additional features...
  ];

  return (
    <>
      <Docs.Title>
        {l.trans({
          en: "Signal Module",
          ko: "시그널 모듈",
        })}
      </Docs.Title>

      <Docs.Description>
        {l.trans({
          en: "The Signal module provides reactive state management capabilities for Akan.js applications. Signals allow components to efficiently respond to state changes without unnecessary re-renders.",
          ko: "시그널 모듈은 Akan.js 애플리케이션을 위한 반응형 상태 관리 기능을 제공합니다. 시그널을 통해 컴포넌트는 불필요한 재렌더링 없이 상태 변화에 효율적으로 반응할 수 있습니다.",
        })}
      </Docs.Description>

      <div className="divider"></div>

      <Docs.SubTitle>
        {l.trans({
          en: "Basic Usage",
          ko: "기본 사용법",
        })}
      </Docs.SubTitle>

      <Docs.Description>
        {l.trans({
          en: "Creating and using signals is straightforward:",
          ko: "시그널 생성 및 사용은 간단합니다:",
        })}
      </Docs.Description>

      <Docs.CodeSnippet
        language="typescript"
        code={`
// Create a signal with an initial value
const count = signal(0);

// Read the signal value
console.log(count()); // 0

// Update the signal value
count(1);
console.log(count()); // 1

// Use in a component
function Counter() {
  return <div>{count()}</div>;
}`}
      />

      <Docs.SubTitle>
        {l.trans({
          en: "Configuration Options",
          ko: "설정 옵션",
        })}
      </Docs.SubTitle>

      <Docs.OptionTable items={signalOptions} />

      <Docs.SubTitle>
        {l.trans({
          en: "API Reference",
          ko: "API 참조",
        })}
      </Docs.SubTitle>

      <Docs.IntroTable type="function" items={signalFeatures} />
    </>
  );
}
```

## Troubleshooting

1. **Layout Issues**: Do not manually add `<Docs.Layout>` as it's automatically applied at the layout level
2. **Component Import**: Always use the namespace import `import { Docs } from "@angelo/ui"` and reference components as `<Docs.ComponentName>`
3. **Translation Issues**: Ensure all user-facing text uses `l.trans()` with complete translations for all supported languages
4. **Code Highlighting**: Verify the correct language is specified for `<Docs.CodeSnippet>` and `<Docs.Code>` components
5. **Style Consistency**: If your documentation looks different from others, compare with existing pages to identify styling discrepancies
6. **Navigation Anchors**: For long pages, include anchor links by adding hidden divs with IDs

For additional assistance, refer to existing documentation pages or contact the framework documentation team.
