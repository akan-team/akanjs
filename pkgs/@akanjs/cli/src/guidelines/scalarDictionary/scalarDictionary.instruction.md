# Scalar Dictionary Implementation Guide for Akan.js

## Purpose of Scalar Dictionary Files

Scalar dictionary files in Akan.js provide internationalization (i18n) support by:

- Defining translations for scalar names, fields, and enum values
- Supporting multiple languages (primarily English and Korean)
- Enabling consistent terminology across the application
- Providing field descriptions for documentation and tooltips
- Maintaining type safety with the constant model definition
- Creating a centralized translation source for UI components

## File Structure and Location

### Location Convention

```
{app,lib}/
└── */lib/__scalar/
    └── <scalarName>/                  # camelCase directory
        ├── <scalarName>.constant.ts   # scalar definition
        └── <scalarName>.dictionary.ts # translations
```

### Key Benefits

- End-to-end type safety
- Fluent builder pattern
- Automatic validation via generics
- Multi-language support

## Required Imports

```typescript
import { scalarDictionary } from "@akanjs/dictionary";

// Import types using "import type" for cleaner code
import type { YourScalar, YourEnum } from "./yourScalar.constant";
```

## Scalar Dictionary Builder

The `scalarDictionary()` function creates a type-safe dictionary using a fluent builder pattern.

### Builder Methods

| Method                       | Description                      | Example                                                                    |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `.of((t) => ...)`            | Define scalar name & description | `.of((t) => t(["Scalar Name", "스칼라 이름"]).desc(["Desc", "설명"]))`     |
| `.model<T>((t) => ...)`      | Define field translations        | `.model<YourScalar>((t) => ({ fieldName: t(["Label", "레이블"]) }))`       |
| `.enum<T>(name, (t) => ...)` | Define enum value translations   | `.enum<YourEnum>("enumName", (t) => ({ value1: t(["Label", "레이블"]) }))` |

## Translation Format

Each translation uses the `t()` function with an array of values. The array order matches the language order defined in `scalarDictionary()`.

```typescript
// Language order: ["en", "ko"]
// Index 0 = English, Index 1 = Korean

t(["English Label", "한국어 레이블"]).desc(["English description", "한국어 설명"]);
```

### Translation Methods

| Method         | Purpose                | Example                                  |
| -------------- | ---------------------- | ---------------------------------------- |
| `t([...])`     | Define the label/name  | `t(["Status", "상태"])`                  |
| `.desc([...])` | Define the description | `.desc(["Current status", "현재 상태"])` |

> **Note**: Both label and description are required for complete internationalization support.

## Basic Structure

```typescript
import { scalarDictionary } from "@akanjs/dictionary";
import type { YourScalar, YourEnum } from "./yourScalar.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Scalar Name", "스칼라 이름"]).desc(["Scalar description", "스칼라 설명"]))
  .model<YourScalar>((t) => ({
    fieldName: t(["Field Label", "필드 레이블"]).desc(["Field description", "필드 설명"]),
  }))
  .enum<YourEnum>("enumName", (t) => ({
    value1: t(["Value Label", "값 레이블"]).desc(["Value description", "값 설명"]),
  }));
```

## Complete Example

```typescript
// File: libs/payment/lib/__scalar/price/price.dictionary.ts
import { scalarDictionary } from "@akanjs/dictionary";
import type { Currency, Price } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price information", "가격 정보"]))
  .model<Price>((t) => ({
    amount: t(["Amount", "금액"]).desc(["Price amount", "가격 금액"]),
    currency: t(["Currency", "통화"]).desc(["Currency type", "통화 유형"]),
  }))
  .enum<Currency>("currency", (t) => ({
    usd: t(["USD", "달러"]).desc(["US Dollar", "미국 달러"]),
    krw: t(["KRW", "원"]).desc(["Korean Won", "한국 원"]),
    eur: t(["EUR", "유로"]).desc(["Euro", "유로"]),
  }));
```

## Enum Name Matching

The first argument to `.enum()` must match the name used in `enumOf()` from the constant file. This ensures proper type checking and runtime resolution.

### Example

**constant.ts**:

```typescript
export class Currency extends enumOf("currency", ["usd", "krw", "eur"]) {}
```

**dictionary.ts**:

```typescript
// Must match: "currency"
.enum<Currency>("currency", (t) => ({
  usd: t(["USD", "달러"]).desc(["US Dollar", "미국 달러"]),
  krw: t(["KRW", "원"]).desc(["Korean Won", "한국 원"]),
  eur: t(["EUR", "유로"]).desc(["Euro", "유로"]),
}))
```

> **Important**: The enum name string must exactly match the first argument of `enumOf()`. For example, `enumOf("journey", [...])` requires `.enum<Journey>("journey", ...)`.

## Type Imports

Always import types from the constant file to ensure type safety. The generic parameters enforce that all fields and enum values have translations.

```typescript
import { scalarDictionary } from "@akanjs/dictionary";

// Import types using "import type" for cleaner code
import type { EncourageInfo, Inquiry, Journey } from "./encourageInfo.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Encourage Info", "격려 정보"]).desc(["Encouragement information", "격려 정보"]))
  .model<EncourageInfo>((t) => ({
    // TypeScript ensures all fields of EncourageInfo are defined
  }))
  .enum<Journey>("journey", (t) => ({
    // TypeScript ensures all values of Journey enum are defined
  }))
  .enum<Inquiry>("inquiry", (t) => ({
    // TypeScript ensures all values of Inquiry enum are defined
  }));
```

### Type Safety Benefits

- **`import type`**: Use `import type` for type-only imports. This ensures no runtime code is included.
- **`.model<Type>`**: Provides autocomplete for field names and validates that all fields are translated.
- **`.enum<Type>`**: Provides autocomplete for enum values and validates that all values are translated.

## Common Mistakes and Fixes

| Issue             | Wrong ❌                         | Correct ✅                                      |
| ----------------- | -------------------------------- | ----------------------------------------------- |
| Missing .desc()   | `t(["Label", "레이블"])`         | `t(["Label", "레이블"]).desc(["Desc", "설명"])` |
| Wrong enum name   | `.enum<Journey>("Journey", ...)` | `.enum<Journey>("journey", ...)`                |
| Missing export    | `const dictionary = ...`         | `export const dictionary = ...`                 |
| Wrong array order | `t(["한국어", "English"])`       | `t(["English", "한국어"])`                      |
| Missing field     | (TypeScript error)               | All fields defined                              |

## Best Practices

### 1. Always Use Type Generics

Use `.model<Type>` and `.enum<Type>` to ensure TypeScript validates all fields and values are translated.

### 2. Consistent Language Order

Always use the same language order (e.g., `["en", "ko"]`) across all dictionaries in your project.

### 3. Meaningful Descriptions

Provide helpful descriptions that explain the field's purpose, not just repeat the label.

```typescript
// ❌ Bad - description just repeats the label
amount: t(["Amount", "금액"]).desc(["Amount", "금액"]),

// ✅ Good - description explains the purpose
amount: t(["Amount", "금액"]).desc(["Price amount in selected currency", "선택된 통화의 가격 금액"]),
```

### 4. Export as 'dictionary'

Use the standard export name `dictionary` for consistency with the framework's auto-import system.

```typescript
// ✅ Correct
export const dictionary = scalarDictionary(["en", "ko"])...
```

## Implementation Checklist

### Required Elements

- [ ] File location: `__scalar/<name>/<name>.dictionary.ts`
- [ ] Import `scalarDictionary` from `@akanjs/dictionary`
- [ ] Import types from constant file using `import type`
- [ ] Initialize with correct language order: `["en", "ko"]`
- [ ] Define scalar name/description with `.of()`
- [ ] Define all field translations with `.model<Type>()`
- [ ] Define all enum translations with `.enum<Type>(name)`
- [ ] Ensure enum name matches `enumOf()` name
- [ ] Include both label and description for all entries
- [ ] Export as `dictionary`

### Translation Format

- [ ] Each translation uses `t([...]).desc([...])`
- [ ] First element is English translation
- [ ] Second element is Korean translation
- [ ] No trailing punctuation in translations
- [ ] First letter capitalized in English

## Full Example with Multiple Enums

```typescript
// File: apps/example/lib/__scalar/encourageInfo/encourageInfo.dictionary.ts
import { scalarDictionary } from "@akanjs/dictionary";
import type { EncourageInfo, Inquiry, Journey } from "./encourageInfo.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Encourage Info", "격려 정보"]).desc(["User encouragement settings", "사용자 격려 설정"]))
  .model<EncourageInfo>((t) => ({
    journey: t(["Journey", "여정"]).desc(["User journey stage", "사용자 여정 단계"]),
    inquiry: t(["Inquiry", "문의"]).desc(["Inquiry type", "문의 유형"]),
    message: t(["Message", "메시지"]).desc(["Encouragement message", "격려 메시지"]),
    showAt: t(["Show At", "표시 시간"]).desc(["When to show encouragement", "격려 표시 시점"]),
  }))
  .enum<Journey>("journey", (t) => ({
    firstJoin: t(["First Join", "첫 가입"]).desc(["User just joined", "사용자가 방금 가입함"]),
    waitPay: t(["Waiting Payment", "결제 대기"]).desc(["Awaiting payment", "결제 대기 중"]),
    onProgress: t(["In Progress", "진행 중"]).desc(["Currently active", "현재 진행 중"]),
    completed: t(["Completed", "완료됨"]).desc(["Journey completed", "여정 완료"]),
  }))
  .enum<Inquiry>("inquiry", (t) => ({
    general: t(["General", "일반"]).desc(["General inquiry", "일반 문의"]),
    support: t(["Support", "지원"]).desc(["Technical support", "기술 지원"]),
    billing: t(["Billing", "청구"]).desc(["Billing inquiry", "청구 문의"]),
  }));
```

## Pro Tips

- **TypeScript Errors**: TypeScript will show errors if you miss any fields or enum values - use this to your advantage!
- **Usage**: The dictionary is used for UI labels, form validation messages, and API documentation
- **Descriptions**: Keep descriptions concise but informative - they appear in tooltips and help text
- **Consistency**: Match the field order in dictionary with the constant file for easier maintenance

## Summary

1. **Import**: `scalarDictionary` from `@akanjs/dictionary`, types from constant file
2. **Initialize**: `scalarDictionary(["en", "ko"])`
3. **Scalar Info**: `.of((t) => t([...]).desc([...]))`
4. **Fields**: `.model<Type>((t) => ({ field: t([...]).desc([...]) }))`
5. **Enums**: `.enum<Type>("enumName", (t) => ({ value: t([...]).desc([...]) }))`
6. **Export**: `export const dictionary = ...`
7. **Format**: `t(["English", "Korean"]).desc(["English desc", "Korean desc"])`

Following these guidelines ensures your scalar dictionary files are complete, type-safe, and maintainable across the Akan.js framework.
