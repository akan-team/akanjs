# Enum Constant Usage Guide for Akan.js

This document provides guidelines for using `enumOf` to create type-safe enumerations in constant files within Akan.js applications.

## Table of Contents

1. [Overview of enumOf](#overview-of-enumof)
2. [Declaring Enumerations](#declaring-enumerations)
3. [Using Enums in Models](#using-enums-in-models)
4. [Enum Operations and Methods](#enum-operations-and-methods)
5. [Best Practices](#best-practices)
6. [Real-World Examples](#real-world-examples)

---

## 1. Overview of enumOf <a name="overview-of-enumof"></a>

`enumOf` provides runtime-enforced enumerations with full TypeScript type safety. Key features:

- **Type Safety**: Compile-time validation of enum values
- **Immutable Values**: Values are frozen at creation
- **Utility Methods**: Built-in methods for value manipulation
- **MongoDB Integration**: Works seamlessly with Akan.js decorators

Declared using:

```typescript
import { enumOf } from "@akanjs/base";

export const MyEnum = enumOf(["value1", "value2"] as const);
export type MyEnum = enumOf<typeof MyEnum>;
```

---

## 2. Declaring Enumerations <a name="declaring-enumerations"></a>

### Basic Declaration Pattern

```typescript
import { enumOf } from "@akanjs/base";

export const Status = enumOf(["active", "pending", "archived"] as const);
export type Status = enumOf<typeof Status>;
```

### Key Requirements:

1. **`as const` Assertion**: Essential for literal type inference
2. **Readonly Array**: Values must be declared as a constant array
3. **Double Export**: Export both the constant and its type
4. **Import from `@akanjs/base`**: Import from `@akanjs/base` to use `enumOf`

### Valid Patterns:

```typescript
// Simple string enum
export const Colors = enumOf(["red", "green", "blue"] as const);

// Complex values (use with caution)
export const ComplexEnum = enumOf([
  { id: 1, name: "Admin" },
  { id: 2, name: "User" },
] as const);
```

---

## 3. Using Enums in Models <a name="using-enums-in-models"></a>

### In Field Decorators

```typescript
@Field.Prop(() => String, {
  enum: Status,
  default: "active"
})
status: Status;
```

### In Arrays

```typescript
@Field.Prop(() => [String], {
  enum: UserRole
})
roles: UserRole[];
```

### In Filter Arguments

```typescript
@Filter.Mongo()
filterByStatus(
  @Filter.Arg("status", () => String, {
    enum: Status
  })
  status: Status
) {
  return { status };
}
```

---

## 4. Enum Operations and Methods <a name="enum-operations-and-methods"></a>

The Enum class provides useful methods:

### Value Checking

```typescript
Status.has("active"); // true
Status.has("invalid"); // false
```

### Index Lookup

```typescript
Status.indexOf("archived"); // Returns 2
```

### Iteration Methods

```typescript
// Find
Status.find((val) => val.includes("a"));

// Filter
Status.filter((val) => val.startsWith("a"));

// Map
Status.map((val) => val.toUpperCase());
```

---

## 5. Best Practices <a name="best-practices"></a>

1. **Use String Literals**: Prefer simple strings for enum values
2. **Group Related Enums**: Place enums near their usage context
3. **Default Values**: Always specify a default in decorators
4. **Immutable Patterns**: Never modify enum values after creation
5. **Naming Convention**: Use PascalCase for enum names (e.g., `TicketStatus`)

### Anti-Patterns to Avoid:

```typescript
// ❌ Missing 'as const'
export const BadEnum = enumOf(["value"]);

// ❌ Non-constant array
let values = ["a", "b"];
export const DynamicEnum = enumOf(values as any);
```

---

## 6. Real-World Examples <a name="real-world-examples"></a>

### Ticket Status (angelo app)

```typescript
export const TicketStatus = enumOf([
  "active",
  "rejected",
  "opened",
  "inProgress",
  "done",
  "reviewing",
  "feedback",
  "completed",
  "archived",
] as const);
```

### Board Policy (social lib)

```typescript
export const BoardPolicy = enumOf([
  "autoApprove",
  "private",
  "one-one",
  "noti.admin.discord",
  "noti.user.email",
  "noti.user.phone",
] as const);
```

### Credit Purpose (lu app)

```typescript
export const CreditPurpose = enumOf([
  "superlike",
  "changeNickName",
  "unlockOffer",
  "nextOfferList",
  "rewind",
  "moreLikes",
] as const);
```

### Complex Enum Example

```typescript
export const UserActions = enumOf([
  { type: "READ", scope: "public" },
  { type: "WRITE", scope: "private" },
] as const);
```

### Enum Usage in Class Methods

```typescript
static getActiveTickets(tickets: LightTicket[]) {
  return tickets.filter(t =>
    ["active", "inProgress"].includes(t.status)
  );
}
```

---

> **Key Takeaways**:
>
> 1. Enums ensure type safety across frontend/backend
> 2. Works seamlessly with Akan.js decorator system
> 3. Provides runtime validation in addition to compile-time checks
> 4. Enables autocompletion and refactoring support in IDEs
> 5. Essential for filter implementations and state management

For advanced patterns, refer to Akan.js documentation at [https://akanjs.com/docs](https://akanjs.com/docs)
