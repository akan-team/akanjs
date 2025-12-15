# Scalar Constant Implementation Guide for Akan.js

## Purpose of Scalar Constants

Scalar constants in Akan.js serve as the foundation for complex data modeling by:

- Defining reusable value objects that can be embedded in other models
- Representing complex data types without creating database collections
- Providing standardized field definitions across the application
- Enabling type-safe data modeling and validation
- Serving as building blocks for larger domain models

## File Structure and Location

### Location Convention

```
{app,lib}/
└── */lib/__scalar/
    └── <scalarName>/                 # camelCase directory
        └── <scalarName>.constant.ts  # scalar definition file
```

### Naming Standards

- **Directory**: `camelCase` (e.g., `encourageInfo`, `geoLocation`)
- **File**: `<scalarName>.constant.ts` (matches directory name)
- **Scalar Class**: `PascalCase` (e.g., `EncourageInfo`, `GeoLocation`)
- **Enum Class**: `PascalCase` (e.g., `Journey`, `NotiSetting`)
- **Enum Values**: `camelCase` (e.g., `firstJoin`, `waitPay`)

## Required Imports

### Essential Framework Imports

```typescript
import { via } from "@akanjs/constant";
```

### Common Base Types

```typescript
import { ID, Int, Float, dayjs, enumOf } from "@akanjs/base";
```

### Cross-Scalar References

```typescript
import { OtherScalar } from "../otherScalar/otherScalar.constant";
```

## Basic Syntax with via()

The `via()` function is the foundation for defining scalars. It takes a callback that receives the `field()` function, which you use to define each field's type and options.

### Basic Structure

```typescript
import { via } from "@akanjs/constant";

export class ScalarName extends via((field) => ({
  fieldName: field(FieldType),
  fieldWithOptions: field(FieldType, { ...options }),
})) {
  // Optional: Add instance methods here
}
```

### Simple Example

```typescript
import { via } from "@akanjs/constant";

export class RestrictInfo extends via((field) => ({
  until: field(Date),
  reason: field(String),
})) {}
```

### Key Patterns

| Pattern                    | Description                                                                      |
| -------------------------- | -------------------------------------------------------------------------------- |
| `via((field) => ({...}))`  | Creates a class with typed fields. The callback receives the `field()` helper.   |
| `field(Type)`              | Defines a single field. First argument is the type (String, Number, Date, etc.). |
| `field(Type, { options })` | Optional second argument is an options object for defaults, validation, etc.     |

## Available Field Types

### Primitive Types

```typescript
import { ID, Int, Float } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class Example extends via((field) => ({
  // String type
  name: field(String),

  // Number types
  count: field(Int), // Integer
  price: field(Float), // Floating point

  // Boolean type
  isActive: field(Boolean),

  // Date type (internally uses Dayjs)
  createdAt: field(Date),

  // ID type (MongoDB ObjectId)
  referenceId: field(ID),
})) {}
```

### Array Types

Array types are defined by wrapping the type in square brackets:

```typescript
export class Example extends via((field) => ({
  // Array of strings
  tags: field([String]),

  // Array of numbers
  scores: field([Int]),

  // Array of other scalars
  items: field([OtherScalar]),

  // Nested arrays (2D matrix)
  matrix: field([[Int]]),
})) {}
```

### Optional Fields

Optional fields can be defined using the `.optional()` chain:

```typescript
import { ID, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class FileMeta extends via((field) => ({
  fileId: field(ID).optional(), // Optional field
  lastModifiedAt: field(Date),
  size: field(Int),
})) {}
```

## Field Options Reference

| Option      | Type     | Default     | Description                                      | Example                       |
| ----------- | -------- | ----------- | ------------------------------------------------ | ----------------------------- |
| `default`   | Any/Func | `undefined` | Default field value (static or factory function) | `{ default: 0 }`              |
| `min`       | Number   | -           | Minimum numeric value                            | `{ min: 0 }`                  |
| `max`       | Number   | -           | Maximum numeric value                            | `{ max: 100 }`                |
| `minlength` | Number   | -           | Minimum string length                            | `{ minlength: 3 }`            |
| `maxlength` | Number   | -           | Maximum string length                            | `{ maxlength: 255 }`          |
| `validate`  | Function | -           | Custom validation function                       | `{ validate: isPhoneNumber }` |
| `example`   | Any      | -           | Example value for documentation                  | `{ example: [0, 0] }`         |

### Field Options Examples

```typescript
import { dayjs, Int, Float } from "@akanjs/base";
import { isPhoneNumber } from "@akanjs/common";
import { via } from "@akanjs/constant";

export class OrderInfo extends via((field) => ({
  // Static default value
  quantity: field(Int, { default: 1 }),

  // Dynamic default using factory function
  orderedAt: field(Date, { default: () => dayjs() }),

  // Number range validation
  rating: field(Float, { min: 0, max: 5 }),

  // String length validation
  description: field(String, { minlength: 10, maxlength: 500 }),

  // Custom validation function
  phone: field(String, { validate: isPhoneNumber }),

  // Combined options
  price: field(Float, {
    default: 0,
    min: 0,
    example: 29.99,
  }),
})) {}
```

### Static vs Dynamic Defaults

- Use **static values** for constants: `{ default: 0 }`, `{ default: "active" }`
- Use **factory functions** for values computed at creation time: `{ default: () => dayjs() }`, `{ default: () => new ObjectId() }`

## Enum Definition with enumOf()

The `enumOf()` function creates typed enum classes. Define enums before using them in your scalar fields.

### Basic Enum

```typescript
import { enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Simple enum definition
export class NotiSetting extends enumOf("notiSetting", ["disagree", "fewer", "normal", "block"]) {}

// Using enum in a scalar
export class NotiInfo extends via((field) => ({
  setting: field(NotiSetting, { default: "normal" }),
})) {}
```

### Enum with 'as const'

For better TypeScript type inference, use `as const`:

```typescript
import { dayjs, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Use "as const" for better type inference
export class Status extends enumOf("status", ["pending", "active", "completed", "cancelled"] as const) {}

export class Order extends via((field) => ({
  status: field(Status, { default: "pending" }),
  orderedAt: field(Date, { default: () => dayjs() }),
})) {}
```

### Enum Key Points

| Point                  | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `enumOf(name, values)` | First argument is the enum name (used in dictionary/GraphQL). Second is the value array. |
| camelCase Values       | Always use camelCase for enum values (e.g., `"waitPay"`, not `"WAIT_PAY"`).              |
| `as const`             | Add `as const` to the values array for better TypeScript type inference.                 |

## Instance Methods

You can add instance methods directly to the scalar class for computed properties and utility functions:

```typescript
import { Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class Stock extends via((field) => ({
  total: field(Int, { default: 0, min: 0 }),
  current: field(Int, { default: 0, min: 0 }),
})) {
  getPercentage() {
    if (this.total === 0) return 0;
    return (this.current / this.total) * 100;
  }
}
```

### Method Guidelines

- Instance methods have access to all fields via `this`
- Use them for calculations based on field values
- Methods defined in `constant.ts` are available on both server and client
- For server-only logic, use `document.ts` instead

## Static Methods

Scalar classes can include static methods for common operations:

```typescript
import { enumOf, Float } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class CoordinateType extends enumOf("coordinateType", ["Point"] as const) {}

export class Coordinate extends via((field) => ({
  type: field(CoordinateType, { default: "Point" }),
  coordinates: field([Float], { default: [0, 0], example: [127.114367, 37.497114] }),
  altitude: field(Float, { default: 0 }),
})) {
  static getDistanceKm(loc1: Coordinate, loc2: Coordinate) {
    const [lon1, lat1] = loc1.coordinates;
    const [lon2, lat2] = loc2.coordinates;
    const R = 6371; // Earth's radius in kilometers
    // Distance calculation logic...
    return distance;
  }

  static moveMeters(loc: Coordinate, x: number, y: number): Coordinate {
    // Calculate new position...
    return { ...loc, coordinates: [newLon, newLat] };
  }
}
```

## Common Mistakes and Fixes

| Issue           | Wrong ❌                           | Correct ✅                                |
| --------------- | ---------------------------------- | ----------------------------------------- |
| Enum case       | `enumOf("status", ["ACTIVE"])`     | `enumOf("status", ["active"])`            |
| Array syntax    | `field(Array<Int>)`                | `field([Int])`                            |
| Dynamic default | `{ default: dayjs() }`             | `{ default: () => dayjs() }`              |
| Missing export  | `class Status extends enumOf(...)` | `export class Status extends enumOf(...)` |
| Optional field  | `field(ID, { nullable: true })`    | `field(ID).optional()`                    |

### Important Note

For Date defaults that should be computed at creation time, **always use a factory function**:

```typescript
// ❌ Wrong - creates a single fixed date at module load
{ default: dayjs() }

// ✅ Correct - creates a new date each time
{ default: () => dayjs() }
```

## Implementation Checklist

### File-Level

- [ ] File location: `__scalar/<camelCase>/<camelCase>.constant.ts`
- [ ] Import `via` from `@akanjs/constant`
- [ ] Import `enumOf` from `@akanjs/base` (if using enums)
- [ ] Export all classes (scalar and enums)

### Naming

- [ ] Use PascalCase for class names
- [ ] Use camelCase for enum values
- [ ] Class name matches directory name in PascalCase

### Field Definition

- [ ] Use `[Type]` syntax for arrays
- [ ] Use factory functions for dynamic defaults
- [ ] Use `.optional()` for nullable fields
- [ ] Add `as const` for large enum value arrays

## Full Examples

### Basic Scalar Example

```typescript
// libs/payment/lib/__scalar/amount/amount.constant.ts
import { Float } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class Amount extends via((field) => ({
  value: field(Float, { min: 0, default: 0 }),
  currency: field(String, { default: "USD" }),
})) {}
```

### Scalar with Enum

```typescript
// apps/akasys/lib/__scalar/version/version.constant.ts
import { dayjs, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class VersionStatus extends enumOf("versionStatus", ["active", "expired"] as const) {}

export class Version extends via((field) => ({
  source: field(File).optional(),
  appBuild: field(File).optional(),
  build: field(File).optional(),
  status: field(VersionStatus, { default: "active" }),
  at: field(Date, { default: () => dayjs() }),
})) {}
```

### Scalar with Optional Fields

```typescript
// apps/angelo/lib/__scalar/estimate/estimate.constant.ts
import { Float, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class Estimate extends via((field) => ({
  name: field(String),
  value: field(Float, { min: 0, default: 0 }),
  num: field(Int, { min: 1, default: 1 }),
  unit: field(String).optional(),
  note: field(String).optional(),
})) {}
```

### Complex Scalar with Static Methods

```typescript
// libs/util/lib/__scalar/coordinate/coordinate.constant.ts
import { enumOf, Float } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class CoordinateType extends enumOf("coordinateType", ["Point"] as const) {}

export class Coordinate extends via((field) => ({
  type: field(CoordinateType, { default: "Point" }),
  coordinates: field([Float], { default: [0, 0], example: [127.114367, 37.497114] }),
  altitude: field(Float, { default: 0 }),
})) {
  static getDistanceKm(loc1: Coordinate, loc2: Coordinate) {
    const [lon1, lat1] = loc1.coordinates;
    const [lon2, lat2] = loc2.coordinates;
    const R = 6371;
    // ... calculation logic
    return distance;
  }

  static moveMeters(loc: Coordinate, x: number, y: number, z: number = 0): Coordinate {
    const [lon, lat] = loc.coordinates;
    const dx = ((x / 1000 / 6371) * (180 / Math.PI)) / Math.cos(lat * (Math.PI / 180));
    const dy = (y / 1000 / 6371) * (180 / Math.PI);
    return { ...loc, coordinates: [lon + dx, lat + dy], altitude: loc.altitude + z };
  }
}
```

## Pro Tips

- **Keep scalars focused**: If it grows too large, split it into multiple scalars
- **Value objects only**: Avoid adding ID or timestamp fields (use Models for that)
- **Define enums first**: Define enums before the scalar class that uses them
- **Dictionary support**: Don't forget to create `dictionary.ts` for i18n support
- **Reusability**: Create separate scalars for commonly used structures

## Summary

1. **Location**: `__scalar/<camelCase>/<camelCase>.constant.ts`
2. **Import**: `via` from `@akanjs/constant`, `enumOf` from `@akanjs/base`
3. **Scalar Class**: `export class Name extends via((field) => ({...})) {}`
4. **Enum Class**: `export class EnumName extends enumOf("enumName", [...] as const) {}`
5. **Fields**: `field(Type)` or `field(Type, { options })`
6. **Optional**: Use `.optional()` chain method
7. **Arrays**: Use `[Type]` syntax
8. **Enum Values**: Always camelCase

Following these patterns ensures type-safe, maintainable scalar definitions that integrate seamlessly with the Akan.js framework's data modeling layer.
