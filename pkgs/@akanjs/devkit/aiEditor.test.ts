import { describe, expect, test } from "bun:test";
import { parseTypescriptFileBlocks, preserveTypescriptResponseContent } from "./aiEditor";

describe("parseTypescriptFileBlocks", () => {
  test("parses TypeScript file blocks with common fence variants", () => {
    const writes = parseTypescriptFileBlocks(`
\`\`\`ts

// File: lib/car/car.constant.ts

export const car = "car";
\`\`\`

\`\`\`tsx
  // File: lib/car/Car.Unit.tsx
export const CarUnit = () => null;
\`\`\`
`);

    expect(writes).toEqual([
      {
        filePath: "lib/car/car.constant.ts",
        content: 'export const car = "car";',
      },
      {
        filePath: "lib/car/Car.Unit.tsx",
        content: "export const CarUnit = () => null;",
      },
    ]);
  });

  test("keeps previous code response when validation responds with prose only", () => {
    const previousContent = `
\`\`\`typescript
// File: lib/car/car.constant.ts
export const car = "car";
\`\`\`
`;
    const nextContent = "The generated file meets all specified requirements. No rewrite is necessary.";

    expect(preserveTypescriptResponseContent(previousContent, nextContent)).toBe(previousContent);
  });

  test("uses next code response when validation rewrites with parseable files", () => {
    const previousContent = `
\`\`\`typescript
// File: lib/car/car.constant.ts
export const car = "car";
\`\`\`
`;
    const nextContent = `
\`\`\`typescript
// File: lib/car/car.constant.ts
export const car = "updated";
\`\`\`
`;

    expect(preserveTypescriptResponseContent(previousContent, nextContent)).toBe(nextContent);
  });
});
