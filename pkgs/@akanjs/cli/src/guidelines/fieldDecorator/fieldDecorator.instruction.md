# Field Decorator Usage Guide for Akan.js

## Purpose of Field Decorators

Field decorators in Akan.js serve as the foundation for data modeling by:

- Defining properties in model classes with type safety
- Configuring GraphQL schema generation for API endpoints
- Setting up MongoDB schema properties and validation
- Enabling search indexing and optimization
- Managing relationships between data models
- Controlling data visibility and access patterns

## Decorator Types and Their Uses

| Decorator          | Purpose                               | Database      | GraphQL    | Default Behavior                    |
| ------------------ | ------------------------------------- | ------------- | ---------- | ----------------------------------- |
| `@Field.Prop()`    | Standard visible property             | ✅ Stored     | ✅ Exposed | Included in all operations          |
| `@Field.Hidden()`  | Internal data not exposed in API      | ✅ Stored     | ❌ Hidden  | Excluded from GraphQL schema        |
| `@Field.Secret()`  | Sensitive data with restricted access | ✅ Stored     | ✅ Exposed | Not selected by default in queries  |
| `@Field.Resolve()` | Computed property (no DB storage)     | ❌ Not stored | ✅ Exposed | Calculated at runtime via resolvers |

## Basic Syntax and Structure

```typescript
@Field.Prop(() => Type, { ...options })
propertyName: TypeScriptType;
```

### Key Components

1. **Decorator Function**: Determines field behavior (`Field.Prop`, `Field.Hidden`, etc.)
2. **Type Arrow Function**: Specifies GraphQL/MongoDB type using `() => Type` syntax
3. **Options Object**: Configures field behavior with various options
4. **TypeScript Type**: Defines the type for static analysis and development

## Field.Prop for Standard Properties

Used for typical model properties that should be stored in the database and exposed in the GraphQL API.

```typescript
// String property
@Field.Prop(() => String)
name: string;

// Number property with validation
@Field.Prop(() => Int, { min: 0, max: 100 })
score: number;

// Boolean property with default
@Field.Prop(() => Boolean, { default: false })
isActive: boolean;
```

## Field.Hidden for Database-Only Properties

Used for properties that should be stored in the database but not exposed in the GraphQL API.

```typescript
// Internal tracking data
@Field.Hidden(() => String)
internalId: string;

// Technical metadata
@Field.Hidden(() => JSON, { default: {} })
systemMetadata: Record<string, any>;
```

## Field.Secret for Sensitive Data

Used for sensitive properties that are stored but not selected by default in queries.

```typescript
// Personal information
@Field.Secret(() => String, { nullable: true })
phoneNumber: string | null;

// Security data
@Field.Secret(() => String)
apiKey: string;
```

## Field.Resolve for Computed Properties

Used for properties that are calculated at runtime and not stored in the database.

```typescript
// Computed property from other fields
@Field.Resolve(() => String)
get fullName(): string {
  return `${this.firstName} ${this.lastName}`;
}

// Calculated numeric value
@Field.Resolve(() => Int)
get age(): number {
  return dayjs().diff(this.birthDate, 'year');
}
```

## Field Options Reference

| Option       | Type                                | Description                          | Default | Example                            |
| ------------ | ----------------------------------- | ------------------------------------ | ------- | ---------------------------------- |
| `default`    | `any`                               | Default value                        | `null`  | `{ default: "active" }`            |
| `nullable`   | `boolean`                           | Allows null values                   | `false` | `{ nullable: true }`               |
| `enum`       | `Enum`                              | Restricts to enum values             | -       | `{ enum: StatusEnum }`             |
| `immutable`  | `boolean`                           | Prevents modification after creation | `false` | `{ immutable: true }`              |
| `min`        | `number`                            | Minimum value (numbers)              | -       | `{ min: 0 }`                       |
| `max`        | `number`                            | Maximum value (numbers)              | -       | `{ max: 100 }`                     |
| `minlength`  | `number`                            | Minimum length (strings)             | -       | `{ minlength: 3 }`                 |
| `maxlength`  | `number`                            | Maximum length (strings)             | -       | `{ maxlength: 255 }`               |
| `type`       | `"email"`, `"url"`, `"password"`    | Special validation type              | -       | `{ type: "email" }`                |
| `validate`   | `function`                          | Custom validation function           | -       | `{ validate: isEmail }`            |
| `select`     | `boolean`                           | Include in default queries           | `true`  | `{ select: false }`                |
| `ref`        | `string`                            | Reference to another model           | -       | `{ ref: "User" }`                  |
| `refPath`    | `string`                            | Dynamic reference path               | -       | `{ refPath: "modelType" }`         |
| `refType`    | `"child"`, `"parent"`, `"relation"` | Relationship type                    | -       | `{ refType: "child" }`             |
| `of`         | `GqlScalar`                         | Type for Map values                  | -       | `{ of: String }`                   |
| `text`       | `"search"`, `"filter"`              | Search indexing behavior             | -       | `{ text: "search" }`               |
| `query`      | `QueryOf<any>`                      | Default MongoDB query                | -       | `{ query: { active: true } }`      |
| `accumulate` | `AccumulatorOperator`               | MongoDB aggregation                  | -       | `{ accumulate: { $sum: 1 } }`      |
| `example`    | `any`                               | Example value for docs               | -       | `{ example: "example@email.com" }` |

## Working with Primitive Types

### String Fields

```typescript
// Basic string
@Field.Prop(() => String)
name: string;

// With length constraints
@Field.Prop(() => String, { minlength: 3, maxlength: 50 })
username: string;

// With special validation type
@Field.Prop(() => String, { type: "email" })
email: string;
```

### Number Fields

```typescript
// Integer
@Field.Prop(() => Int)
count: number;

// Float with range
@Field.Prop(() => Float, { min: 0, max: 1 })
percentage: number;
```

### Boolean Fields

```typescript
// Boolean with default
@Field.Prop(() => Boolean, { default: false })
isPublished: boolean;
```

## Working with Enums

```typescript
// Define enum with enumOf
export const Status = enumOf(["active", "inactive", "pending"] as const);
export type Status = enumOf<typeof Status>;

// Use in field
@Field.Prop(() => String, { enum: Status, default: "active" })
status: Status;
```

## Working with Arrays and Nested Structures

### Simple Arrays

```typescript
// String array
@Field.Prop(() => [String], { default: [] })
tags: string[];

// Number array
@Field.Prop(() => [Int], { default: [] })
scores: number[];
```

### Nested Arrays

```typescript
// 2D array
@Field.Prop(() => [[Int]], { default: [] })
matrix: number[][];
```

### Arrays of Custom Types

```typescript
// Array of references
@Field.Prop(() => [LightComment], { ref: "Comment" })
comments: LightComment[];

// Array of embedded scalars
@Field.Prop(() => [Address])
addresses: Address[];
```

## Reference Fields and Relationships

### Single References

```typescript
// Basic reference
@Field.Prop(() => LightUser, { ref: "User" })
owner: LightUser;

// Optional reference
@Field.Prop(() => LightCategory, { ref: "Category", nullable: true })
category: LightCategory | null;
```

### Dynamic References

```typescript
// Reference determined by path
@Field.Prop(() => String, { enum: ModelType })
modelType: ModelType;

@Field.Prop(() => LightModel, { refPath: "modelType" })
model: LightModel;
```

### Relationship Types

```typescript
// Parent-child relationship
@Field.Prop(() => LightProject, { ref: "Project", refType: "parent" })
project: LightProject;

// Many-to-many relationship
@Field.Prop(() => [LightTag], { ref: "Tag", refType: "relation" })
tags: LightTag[];
```

## Date and Special Type Handling

### Date Fields

```typescript
// Current date default
@Field.Prop(() => Date, { default: () => dayjs() })
createdAt: Dayjs;

// Immutable timestamp
@Field.Prop(() => Date, { default: () => dayjs(), immutable: true })
createdAt: Dayjs;
```

### JSON and Map Types

```typescript
// JSON object
@Field.Prop(() => JSON, { default: {} })
metadata: Record<string, any>;

// Map type
@Field.Prop(() => Map, { of: String, default: new Map() })
translations: Map<string, string>;
```

## Validation and Constraints

### Built-in Validation

```typescript
// Numeric range
@Field.Prop(() => Int, { min: 1, max: 10 })
rating: number;

// String length
@Field.Prop(() => String, { minlength: 8, maxlength: 100 })
password: string;
```

### Custom Validation

```typescript
// Custom validation function
@Field.Prop(() => String, {
  validate: (value, model) => {
    return /^[A-Z][a-z]+$/.test(value);
  }
})
properName: string;
```

## Search Optimization

### Full-Text Search

```typescript
// Searchable text field
@Field.Prop(() => String, { text: "search" })
description: string;
```

### Filter-Only Fields

```typescript
// Filterable but not searchable
@Field.Prop(() => String, { text: "filter" })
category: string;
```

## Default Values and Immutability

### Static Defaults

```typescript
// Static default value
@Field.Prop(() => String, { default: "Guest" })
role: string;
```

### Dynamic Defaults

```typescript
// Function-based default
@Field.Prop(() => Date, { default: () => dayjs() })
createdAt: Dayjs;

// Complex default value
@Field.Prop(() => JSON, { default: () => ({ version: 1, settings: {} }) })
config: Record<string, any>;
```

### Immutable Fields

```typescript
// Cannot be changed after creation
@Field.Prop(() => String, { immutable: true })
code: string;
```

## Integration with Model Types

### Input Models

```typescript
export class ProductInput {
  @Field.Prop(() => String)
  name: string;

  @Field.Prop(() => Float, { min: 0 })
  price: number;
}
```

### Object Models

```typescript
export class ProductObject extends via(ProductInput) {
  @Field.Prop(() => Date, { default: dayjs() })
  createdAt: Dayjs;
}
```

### Light Models

```typescript
export class LightProduct extends via(ProductObject, ["name", "price", "status"] as const) {}
```

### Full Models

```typescript
export class Product extends via(ProductObject, LightProduct) {}
```

### Scalar Models

```typescript
export class Address {
  @Field.Prop(() => String)
  street: string;

  @Field.Prop(() => String)
  city: string;
}
```

## Best Practices

### Type Safety

Always ensure TypeScript types match GraphQL types:

```typescript
// ✅ Correct
@Field.Prop(() => Int)
count: number;

// ❌ Incorrect (type mismatch)
@Field.Prop(() => String)
count: number;
```

### Nullable Fields

Always add both the decorator option and TypeScript union type:

```typescript
// ✅ Correct
@Field.Prop(() => String, { nullable: true })
middleName: string | null;

// ❌ Incorrect (missing union type)
@Field.Prop(() => String, { nullable: true })
middleName: string;
```

### Default Values

Provide sensible defaults for required fields:

```typescript
// ✅ Correct
@Field.Prop(() => [String], { default: [] })
tags: string[];

// ❌ Incorrect (missing default for array)
@Field.Prop(() => [String])
tags: string[];
```

### Sensitive Data

Use `Field.Secret` for sensitive information:

```typescript
// ✅ Correct
@Field.Secret(() => String)
apiKey: string;

// ❌ Incorrect (exposes sensitive data by default)
@Field.Prop(() => String)
apiKey: string;
```

### Array Type Syntax

Use bracket notation instead of generics:

```typescript
// ✅ Correct
@Field.Prop(() => [String])
tags: string[];

// ❌ Incorrect (using generics)
@Field.Prop(() => Array<String>)
tags: string[];
```

### Date Handling

Always use `Dayjs` type for date fields:

```typescript
// ✅ Correct
@Field.Prop(() => Date)
createdAt: Dayjs;

// ❌ Incorrect (using JavaScript Date)
@Field.Prop(() => Date)
createdAt: Date;
```

## Troubleshooting Common Issues

### Field Not Appearing in GraphQL

**Problem**: Field is defined but not showing up in GraphQL schema  
**Possible Causes**:

- Using `@Field.Hidden()` instead of `@Field.Prop()`
- Field has `{ select: false }` option
- GraphQL schema not regenerated after changes

**Solution**:

```typescript
// Change this
@Field.Hidden(() => String)
name: string;

// To this
@Field.Prop(() => String)
name: string;
```

### Default Value Not Applied

**Problem**: Default value isn't set when creating new documents  
**Possible Causes**:

- Default value type doesn't match field type
- Default function throws an error
- Middleware overriding the value

**Solution**:

```typescript
// Ensure type consistency
@Field.Prop(() => Int, { default: 0 }) // number default for number field
count: number;
```

### Validation Errors

**Problem**: Unexpected validation failures  
**Possible Causes**:

- Value outside min/max range
- String length outside minlength/maxlength
- Custom validation function returning false

**Solution**:

```typescript
// Check constraints
@Field.Prop(() => String, {
  minlength: 3,
  validate: (value) => /^[A-Z]/.test(value) // Must start with uppercase
})
username: string;
```

### Enum Values Not Working

**Problem**: Enum validation not working properly  
**Possible Causes**:

- Enum not created with `enumOf()`
- Enum values don't match expected format
- Missing `{ enum: YourEnum }` in options

**Solution**:

```typescript
// Proper enum definition
export const Status = enumOf(["active", "inactive"] as const);
export type Status = enumOf<typeof Status>;

// Correct field definition
@Field.Prop(() => String, { enum: Status, default: "active" })
status: Status;
```

### Search Not Working

**Problem**: Full-text search not working on fields  
**Possible Causes**:

- Missing `{ text: "search" }` option
- Search daemon not running
- Model not marked for indexing

**Solution**:

```typescript
// Add text search option
@Field.Prop(() => String, { text: "search" })
description: string;
```

### Circular Dependencies

**Problem**: Circular import errors when referencing models  
**Possible Causes**:

- Models directly importing each other
- Using Full models instead of Light models for references

**Solution**:

```typescript
// Use Light models for references
@Field.Prop(() => LightUser, { ref: "User" }) // Not FullUser
owner: LightUser;
```

## Summary Checklist

1. **Choose the right decorator**: `Field.Prop`, `Field.Hidden`, `Field.Secret`, or `Field.Resolve`
2. **Use correct type syntax**: `() => Type` or `() => [Type]` for arrays
3. **Match TypeScript types**: Ensure decorator type matches property type
4. **Handle nullability**: Use `{ nullable: true }` and `Type | null` together
5. **Provide defaults**: Set appropriate default values, especially for arrays
6. **Add validation**: Use min/max, minlength/maxlength, or custom validation
7. **Protect sensitive data**: Use `Field.Secret` for sensitive information
8. **Optimize for search**: Add `{ text: "search" }` to searchable fields
9. **Mark immutable fields**: Use `{ immutable: true }` for unchangeable fields
10. **Use proper references**: Specify `ref`, `refPath`, or `refType` for relationships

Following these guidelines will ensure your field decorators work correctly across the entire Akan.js framework ecosystem, from GraphQL APIs to MongoDB persistence and search functionality.
