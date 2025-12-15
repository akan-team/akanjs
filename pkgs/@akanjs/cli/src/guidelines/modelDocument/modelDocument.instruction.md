# Akan.js Model Document Implementation Guide

## Purpose and Role of model.document.ts Files

`model.document.ts` files are essential components in the Akan.js framework that define MongoDB data models and their associated behaviors. These files serve as the bridge between your application's data structure and MongoDB, providing:

1. **Schema Definition** - Define the structure and validation for MongoDB documents
2. **Business Logic** - Implement domain-specific operations through document methods
3. **Query Patterns** - Create reusable database queries with model statics
4. **Lifecycle Hooks** - Add middleware for handling events during document operations
5. **Performance Optimization** - Configure indexes and implement DataLoader for efficient querying
6. **Caching Integration** - Seamlessly integrate with Redis for high-performance data access
7. **Search Capabilities** - Connect with Meilisearch for full-text search functionality

## File Structure

A `model.document.ts` file is structured into four distinct classes, each with a specific responsibility:

### 2. Document Class

Represents a MongoDB document with instance methods:

```typescript
export class Example extends by(cnst.Example) {
  // Document methods here
}
```

### 3. Model Class

Represents the MongoDB collection with static methods:

```typescript
export class ExampleModel extends into(Example, cnst.exampleCnst) {
  // Model statics here
}
```

### 4. Middleware Class

Defines schema hooks and indexes:

```typescript
export class ExampleMiddleware extends beyond(ExampleModel, Example) {
  onSchema(schema) {
    // Middleware and indexes here
  }
}
```

## How to Use Document Methods

Document methods operate on individual document instances and typically follow these patterns:

### Characteristics of Document Methods:

- They operate on the current document instance (`this`)
- They typically return `this` to enable method chaining
- They're often synchronous, but can be asynchronous when needed
- They handle document-level operations and transformations

### Example of Document Methods:

```typescript
export class User extends by(cnst.User) {
  // Simple transformation method (synchronous)
  addRole(role: string) {
    if (!this.roles.includes(role)) {
      this.roles = [...this.roles, role];
    }
    return this;
  }

  // Remove item method (synchronous)
  removeRole(role: string) {
    this.roles = this.roles.filter((r) => r !== role);
    return this;
  }

  // Complex operation with save (asynchronous)
  async updateProfile(data: Partial<UserProfile>) {
    Object.assign(this.profile, data);
    this.lastUpdatedAt = new Date();
    return await this.save();
  }
}
```

## How to Use Model Statics

Model statics operate on the entire collection and are typically asynchronous. They implement reusable query patterns and business operations.

### Characteristics of Model Statics:

- They operate on the entire collection, not a single document
- They're almost always asynchronous, returning Promises
- They often use built-in Mongoose methods like `find`, `findOne`, etc.
- They can implement complex business logic involving multiple documents

### Example of Model Statics:

```typescript
export class OrderModel extends into(Order, cnst.orderCnst) {
  // Query by specific criteria
  async findPendingOrders(userId: string) {
    return this.Order.find({
      user: userId,
      status: "pending",
    }).sort({ createdAt: -1 });
  }

  // Complex operation with multiple steps
  async processRefund(orderId: string, amount: number) {
    const order = await this.Order.pickById(orderId);

    if (order.status !== "completed") {
      throw new Error("Cannot refund an incomplete order");
    }

    if (order.totalAmount < amount) {
      throw new Error("Refund amount exceeds order total");
    }

    return await order
      .set({
        refundAmount: amount,
        status: "refunded",
      })
      .save();
  }

  // Aggregation example
  async getOrderStatsByUser(userId: string) {
    const result = await this.Order.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]);

    return result.reduce((acc, item) => {
      acc[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount,
      };
      return acc;
    }, {});
  }
}
```

## Built-in Model Functions

Akan.js provides several built-in methods that are available on all models:

```typescript
// Direct access to Mongoose model
await userModel.User.find({...});

// Common operations
const user = await userModel.getUser(userId);                 // Get by ID or throw error
const maybeUser = await userModel.loadUser(userId);           // Get by ID or return null
const users = await userModel.loadUserMany([userId1, userId2]); // Get multiple by IDs

// CRUD operations
const newUser = await userModel.createUser(userData);         // Create new document
const updated = await userModel.updateUser(userId, userData); // Update document
const removed = await userModel.removeUser(userId);           // Soft delete (sets removedAt)

// Search operations (when Meilisearch is configured)
const { docs, count } = await userModel.searchUser("john");   // Full-text search
const users = await userModel.searchDocsUser("john");         // Just get documents
const total = await userModel.searchCountUser("john");        // Just get count
```

## How to Apply Middleware

Middleware allows you to intercept and modify document operations at various lifecycle stages.

### Common Middleware Hooks:

- `pre('save')` - Before saving a document
- `post('save')` - After saving a document
- `pre('remove')` - Before removing a document
- `pre('validate')` - Before validation
- `pre('findOneAndUpdate')` - Before findOneAndUpdate operations

### Example Middleware Implementation:

```typescript
export class UserMiddleware extends beyond(UserModel, User) {
  onSchema(schema: SchemaOf<UserModel, User>) {
    // Pre-save hook for password hashing
    schema.pre<User>("save", async function (next) {
      // Only hash the password if it's modified
      if (this.isModified("password") && this.password) {
        try {
          this.password = await hashPassword(this.password);
          next();
        } catch (error) {
          next(error);
        }
      } else {
        next();
      }
    });

    // Post-save hook for logging
    schema.post<User>("save", function (doc) {
      console.log(`User ${doc.id} was saved`);
    });

    // Pre-remove hook for cleanup
    schema.pre<User>("remove", async function (next) {
      try {
        // Perform cleanup operations
        await someCleanupFunction(this.id);
        next();
      } catch (error) {
        next(error);
      }
    });
  }
}
```

## How to Apply Indexes

Indexes are crucial for query performance. Define them in the Middleware's `onSchema` method:

### Types of Indexes:

- **Single field index** - Optimize queries on a single field
- **Compound index** - Optimize queries that filter or sort on multiple fields
- **Text index** - Enable full-text search on specified fields
- **Unique index** - Ensure field values are unique across the collection
- **Sparse index** - Only include documents that have the indexed field

### Example Index Implementation:

```typescript
export class ProductMiddleware extends beyond(ProductModel, Product) {
  onSchema(schema: SchemaOf<ProductModel, Product>) {
    // Single field index (1=ascending, -1=descending)
    schema.index({ createdAt: -1 });

    // Compound index
    schema.index({ category: 1, price: -1 });

    // Unique index
    schema.index({ sku: 1 }, { unique: true });

    // Text search index
    schema.index({ name: "text", description: "text" });

    // Sparse index (only indexes docs with the field)
    schema.index(
      { promotionCode: 1 },
      {
        sparse: true,
      }
    );

    // Partial index with filter expression
    schema.index(
      { status: 1 },
      {
        partialFilterExpression: { status: { $exists: true } },
      }
    );

    // Time-to-live index (auto-expire documents)
    schema.index(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0,
      }
    );
  }
}
```

## How to Use MongoDB Model

The Akan.js framework provides direct access to the Mongoose model, allowing you to perform standard MongoDB operations:

```typescript
// Find operations
const product = await productModel.Product.findById(id);
const activeProducts = await productModel.Product.find({ status: "active" });

// Update operations
await productModel.Product.updateMany({ category: "electronics" }, { $set: { onSale: true } });

// Aggregation
const stats = await productModel.Product.aggregate([
  { $match: { status: "active" } },
  {
    $group: {
      _id: "$category",
      count: { $sum: 1 },
      avgPrice: { $avg: "$price" },
    },
  },
]);

// Advanced querying
const products = await productModel.Product.find({
  price: { $gte: 100, $lte: 500 },
  category: { $in: ["electronics", "gadgets"] },
})
  .sort({ rating: -1 })
  .limit(10);
```

## How to Use DataLoader

DataLoader batches and caches database requests to optimize performance, especially for resolving relationships between documents.

### Types of Loaders:

- `@Loader.ByField(fieldName)` - Load documents by a specific field value
- `@Loader.ByArrayField(fieldName)` - Load documents that contain a value in an array field
- `@Loader.ByQuery(queryKeys)` - Load documents by complex query criteria

### Example DataLoader Implementation:

```typescript
export class OrderModel extends into(Order, cnst.orderCnst) {
  // Load orders by user ID
  @Loader.ByField("userId")
  userOrdersLoader: Loader<string, Order[]>;

  // Load orders by status
  @Loader.ByField("status")
  statusOrdersLoader: Loader<string, Order[]>;

  // Load orders by tag (array field)
  @Loader.ByArrayField("tags")
  tagOrdersLoader: Loader<string, Order[]>;

  // Load order by complex query
  @Loader.ByQuery(["userId", "orderNumber"])
  specificOrderLoader: Loader<{ userId: string; orderNumber: string }, Order>;
}

// Usage:
const userOrders = await orderModel.userOrdersLoader.load(userId);
const pendingOrders = await orderModel.statusOrdersLoader.load("pending");
const taggedOrders = await orderModel.tagOrdersLoader.load("priority");
const specificOrder = await orderModel.specificOrderLoader.load({
  userId: "user123",
  orderNumber: "ORD-12345",
});
```

## How to Use Cache with Redis

Akan.js integrates Redis caching through the model's cache instance, providing simple methods for storing and retrieving data:

```typescript
// Set cache
await userModel.UserCache.set(
  "session", // Topic/category
  userId, // Key
  sessionData, // Value
  { expireAt: dayjs().add(1, "hour") } // Options
);

// Get cache
const session = await userModel.UserCache.get("session", userId);

// Delete cache
await userModel.UserCache.delete("session", userId);

// Example: Caching expensive computation
async function getUserStats(userId: string) {
  // Try to get from cache first
  const cachedStats = await userModel.UserCache.get("stats", userId);
  if (cachedStats) return JSON.parse(cachedStats);

  // If not in cache, compute and store
  const stats = await computeExpensiveUserStats(userId);
  await userModel.UserCache.set("stats", userId, JSON.stringify(stats), { expireAt: dayjs().add(30, "minute") });

  return stats;
}
```

## How to Use Search with Meilisearch

Akan.js provides Meilisearch integration for full-text search capabilities:

```typescript
// Basic search with pagination
const { docs, count } = await productModel.searchProduct("wireless headphones", {
  skip: 0,
  limit: 10,
});

// Search with filtering
const { docs, count } = await productModel.searchProduct("wireless headphones", {
  filter: "category=electronics AND price<=100",
});

// Search with sorting
const { docs, count } = await productModel.searchProduct("wireless headphones", {
  sort: ["rating:desc", "price:asc"],
});

// Just get the documents
const products = await productModel.searchDocsProduct("wireless headphones");

// Just get the count
const resultCount = await productModel.searchCountProduct("wireless headphones");
```

## Best Practices

### 1. Document Methods vs. Model Statics

- Use **document methods** for operations on a single document
- Use **model statics** for operations on multiple documents or complex business logic

### 2. Efficient Querying

- Add indexes for frequently used queries
- Use projection (`select`) to limit fields returned
- Use `lean()` when you don't need full Mongoose documents
- Implement DataLoader for relationship fields

### 3. Error Handling

- Use `pickOne` and `pickById` when you expect a document to exist
- Implement custom error classes for domain-specific errors
- Validate inputs before database operations

### 4. Transactions

Use transactions for operations that need to be atomic:

```typescript
export class OrderModel extends into(Order, cnst.orderCnst) {
  @Transaction()
  async createOrderWithItems(orderData, items) {
    const order = await this.createOrder(orderData);
    await Promise.all(items.map((item) => itemModel.createItem({ ...item, orderId: order.id })));
    return order;
  }
}
```

### 5. Soft Deletes

Akan.js implements soft deletes by default:

```typescript
// Soft delete (sets removedAt field)
await userModel.removeUser(userId);

// To query only non-deleted documents
const users = await userModel.User.find({ removedAt: { $exists: false } });

// To permanently delete (rarely needed)
await userModel.User.findByIdAndDelete(userId);
```

## Complete Example

Here's a complete example integrating multiple features:

```typescript
// product.document.ts
import { dayjs } from "@akanjs/base";
import { beyond, by, Database, into, Loader, SchemaOf } from "@akanjs/document";
import * as cnst from "../cnst";

export class Product extends by(cnst.Product) {
  applyDiscount(percentage: number) {
    if (percentage < 0 || percentage > 100) {
      throw new Error("Discount percentage must be between 0 and 100");
    }

    const discount = (this.price * percentage) / 100;
    this.discountedPrice = this.price - discount;
    this.discountPercentage = percentage;

    return this;
  }

  isInStock() {
    return this.stockCount > 0;
  }

  decreaseStock(quantity = 1) {
    if (this.stockCount < quantity) {
      throw new Error("Not enough stock");
    }

    this.stockCount -= quantity;

    return this;
  }
}

export class ProductModel extends into(Product, cnst.productCnst) {
  @Loader.ByField("category")
  categoryProductsLoader: Loader<string, Product[]>;

  @Loader.ByArrayField("tags")
  tagProductsLoader: Loader<string, Product[]>;

  async findPopularProducts(limit = 10) {
    return this.Product.find({
      status: "active",
      popularity: { $gte: 4 },
    })
      .sort({ popularity: -1 })
      .limit(limit);
  }

  async updatePrices(categoryId: string, increasePercentage: number) {
    const products = await this.Product.find({ category: categoryId });

    const updates = products.map((product) => {
      const newPrice = product.price * (1 + increasePercentage / 100);
      return product.set({ price: newPrice }).save();
    });

    return Promise.all(updates);
  }

  async getCategoryStats() {
    const result = await this.Product.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          avgPrice: { $avg: "$price" },
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Cache the results
    await this.ProductCache.set("stats", "categories", JSON.stringify(result), { expireAt: dayjs().add(1, "hour") });

    return result;
  }
}

export class ProductMiddleware extends beyond(ProductModel, Product) {
  onSchema(schema: SchemaOf<ProductModel, Product>) {
    // Update stock status on save
    schema.pre<Product>("save", function (next) {
      if (this.isModified("stockCount")) {
        this.stockStatus = this.stockCount > 0 ? "in_stock" : "out_of_stock";
      }
      next();
    });

    // Create slug from name
    schema.pre<Product>("save", function (next) {
      if (this.isNew || this.isModified("name")) {
        this.slug = this.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
      next();
    });

    // Indexes
    schema.index({ category: 1, status: 1 });
    schema.index({ name: "text", description: "text" });
    schema.index({ slug: 1 }, { unique: true });
    schema.index({ createdAt: -1 });
    schema.index({ price: 1 });
    schema.index({ "meta.specifications.key": 1, "meta.specifications.value": 1 });
  }
}
```

## Integration with NestJS

When using Akan.js with NestJS, models are injected using the service provider system:

```typescript
// product.service.ts
import { Injectable } from "@nestjs/common";
import { getModel } from "@akanjs/nest";
import { ProductModel } from "./product.document";

@Injectable()
export class ProductService {
  private productModel = getModel(ProductModel);

  async getProductById(id: string) {
    return this.productModel.getProduct(id);
  }

  async searchProducts(query: string, options = {}) {
    return this.productModel.searchProduct(query, options);
  }

  async createProduct(data) {
    return this.productModel.createProduct(data);
  }

  async applyDiscount(productId: string, percentage: number) {
    const product = await this.productModel.getProduct(productId);
    return product.applyDiscount(percentage).save();
  }
}
```

## Client-Side Usage

On the client side, you'll typically interact with models through GraphQL or REST APIs:

```typescript
// Using model-generated GraphQL operations
const { data } = await client.query({
  query: gql`
    query GetProduct($id: ID!) {
      getProduct(id: $id) {
        id
        name
        price
        description
        category
        status
        stockCount
      }
    }
  `,
  variables: { id: productId },
});
```

## Summary

The `model.document.ts` files in Akan.js provide a comprehensive system for defining and working with MongoDB data. By properly implementing these files, you can:

1. Define clear data structures with validation
2. Implement business logic at both document and collection levels
3. Optimize database performance with indexes and DataLoader
4. Leverage caching for high-performance operations
5. Implement full-text search capabilities
6. Create a maintainable and scalable data layer

Following the patterns and best practices outlined in this guide will help you build robust and efficient data-driven applications with Akan.js.
