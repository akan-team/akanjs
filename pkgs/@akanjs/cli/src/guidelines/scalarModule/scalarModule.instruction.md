# Scalar Modules Overview

## Purpose

Scalar modules provide reusable value objects for:

- Embedded documents in domain models
- Shared DTOs and configuration objects
- Type-safe schemas across your application
- Internationalized data structures

## Core Principles

- **Reusability**: Designed for cross-module consumption
- **Stateless**: Pure data containers without business logic
- **Type-Safe**: Full TypeScript integration with runtime validation
- **Composable**: Embeddable within larger domain models
- **I18n Ready**: Built-in translation support

## File Structure

```
{domain}/lib/
└── __scalar/                  // Special scalar directory
    └── [scalarName]/          // camelCase scalar name
        ├── [name].constant.ts   // Schema definition
        ├── [name].dictionary.ts // I18n translations
        └── [name].document.ts   // Method extensions (optional)
```

## File Responsibilities

| File Type         | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `*.constant.ts`   | Defines schema with `@Model.Scalar` and `@Field.Prop` decorators |
| `*.dictionary.ts` | Provides internationalization with `ModelDictionary<Type>`       |
| `*.document.ts`   | Extends functionality with custom methods using `by()` decorator |

## Naming Conventions

| Element          | Convention             | Example                     |
| ---------------- | ---------------------- | --------------------------- |
| Scalar Directory | `camelCase`            | `geoLocation`               |
| Constant File    | `[name].constant.ts`   | `geoLocation.constant.ts`   |
| Dictionary File  | `[name].dictionary.ts` | `geoLocation.dictionary.ts` |
| Document File    | `[name].document.ts`   | `geoLocation.document.ts`   |
| Scalar Class     | `PascalCase`           | `GeoLocation`               |
| Enum Values      | `camelCase`            | `highAccuracy`              |
| Dictionary Keys  | `kebab-case` prefixes  | `desc-fieldName`            |

## Core Components

1. **Constant File**: Schema definition with typed fields and validation
2. **Dictionary File**: I18n translations for model metadata, fields and enums
3. **Document File**: Optional method extensions for data transformations

## Key Rules

1. One scalar class per file with matching `@Model.Scalar` parameter
2. All fields require decorators (`@Field.Prop`, `@Field.Hidden`, etc.)
3. Dictionary must include all fields/enums with `modelName`/`modelDesc`
4. Use `satisfies ModelDictionary<Type>` for dictionary type safety

## Best Practices

- Design for maximum reusability across modules
- Keep scalars focused and lightweight
- Use immutable fields for invariant data
- Provide complete I18n coverage in dictionaries
- Add document methods only for data transformations
- Validate fields with options (min/max, minlength/maxlength)

## Integration Points

- **Domain Models**: Embedded as value objects
- **GraphQL**: Auto-generated types and enums
- **Validation**: Runtime type checking through decorators
- **Internationalization**: Consistent terminology via dictionaries
- **API Contracts**: Shared request/response payloads

Scalar modules provide foundational data structures that enable consistent, type-safe modeling across Akan.js applications while promoting code reuse and maintainability.
