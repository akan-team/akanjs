# Akan.js Model Service Implementation Guide

## Purpose and Role of model.service.ts Files

In the Akan.js framework, `model.service.ts` files are central components that implement business logic and manage interactions with data models. These services serve multiple critical purposes:

1. **Business Logic Layer** - Encapsulate domain-specific operations and rules
2. **Data Orchestration** - Coordinate operations between different models and external systems
3. **Transaction Management** - Handle complex multi-step operations that may involve multiple models
4. **Lifecycle Management** - Initialize resources and clean up when the application starts or stops
5. **Scheduled Tasks** - Execute recurring operations using cron jobs and intervals
6. **Security** - Implement authorization and permission checks
7. **Integration** - Connect with external APIs, message queues, and other services

Services in Akan.js follow a stateless design pattern, where any persistent state should be managed through MongoDB and Redis, not within the service instance itself.

## Service Structure and Inheritance

Akan.js services typically extend base service classes provided by the framework:

### DbService

Most services extend `DbService` to work with MongoDB models:

```typescript
export class ProductService extends DbService(db.productDb) {
  // Service methods here
}
```

The `DbService` function automatically injects the database model and provides numerous convenience methods for CRUD operations.

### serve

For utility services that don't directly work with a database model:

```typescript
export class SecurityService extends serve("security" as const) {
  // Utility methods here
}
```

### Custom Service Base Classes

For specific domain services with shared functionality:

```typescript
// In _libName/libName.service.ts
export const LibService = MixSrvs(SharedService, PlatformService, SocialService);

// In another service

export class CustomService extends LibService {
  // Custom methods here
}
```

## Core Decorators

Options:

- `enabled`: Boolean flag to conditionally disable a service (default: true)
- `serverMode`: Restricts the service to run only in specific server modes:
  - `"federation"`: For API/GraphQL servers
  - `"batch"`: For background processing servers
  - Not specified: Runs in all modes

### @Srv Decorator

Injects another service by name:

```typescript
@Srv()
protected readonly userService: UserService;  // Injects using capitalized property name

@Srv("CustomName")
protected readonly customService: SomeService;  // Injects using specified name
```

The `@Srv` decorator automatically capitalizes the property name if no explicit name is provided. For example, `@Srv() userService` will look for a service named "UserService".

### @Use Decorator

Injects non-service dependencies like APIs, configurations, or utilities:

```typescript
@Use()
protected readonly emailApi: EmailApi;  // Injects using capitalized property name

@Use("CustomKey")
protected readonly customConfig: SomeConfig;  // Injects using specified name
```

Similar to `@Srv`, the `@Use` decorator capitalizes property names by default.

### @Db Decorator

Injects a specific database model directly (rarely needed since `DbService` already provides this):

```typescript
@Db("User")
protected readonly userModel: UserModel;
```

### @Queue Decorator

Injects a Bull queue for background processing:

```typescript
@Queue()
protected readonly userQueue: Queue<UserSignal>;
```

### @Websocket Decorator

Injects a websocket server instance for real-time communication:

```typescript
@Websocket()
protected readonly websocket: Websocket<ChatSignal>;
```

## Database Operations

When extending `DbService`, your service automatically inherits numerous methods for working with the database model.

### Basic CRUD Operations

```typescript
// Create
const newProduct = await this.createProduct(productData);

// Read
const product = await this.getProduct(productId); // Throws if not found
const maybeProduct = await this.loadProduct(productId); // Returns null if not found
const products = await this.loadProductMany([id1, id2, id3]); // Load multiple by IDs

// Update
const updatedProduct = await this.updateProduct(productId, updateData);

// Delete (soft delete)
const removedProduct = await this.removeProduct(productId);
```

### Query Operations

```typescript
// List with filtering, sorting, and pagination
const products = await this.listActiveProducts(categoryId, {
  skip: 0,
  limit: 10,
  sort: "priceAsc",
});

// Get IDs only
const productIds = await this.listIdsActiveProducts(categoryId);

// Find a single item (returns null if not found)
const product = await this.findActiveProduct(categoryId);

// Pick a single item (throws if not found)
const product = await this.pickActiveProduct(categoryId);

// Check existence
const exists = await this.existsActiveProduct(categoryId);

// Count
const count = await this.countActiveProducts(categoryId);

// Insight (aggregate statistics)
const stats = await this.insightActiveProducts(categoryId);
```

### Search Operations (with Meilisearch)

```typescript
// Full-text search with pagination
const { docs, count } = await this.searchProduct("wireless headphones", {
  skip: 0,
  limit: 10,
});

// Just get documents
const products = await this.searchDocsProduct("wireless headphones");

// Just get count
const total = await this.searchCountProduct("wireless headphones");
```

## Customizing Database Operations

`DbService` provides hooks for customizing database operations:

```typescript
// Called before document creation
async _preCreate(data: ProductInput): Promise<ProductInput> {
  // Validate or transform input data
  if (!data.slug && data.name) {
    data.slug = this.generateSlug(data.name);
  }
  return data;
}

// Called after document creation
async _postCreate(doc: Product): Promise<Product> {
  // Perform additional actions after creation
  await this.notificationService.notifyNewProduct(doc);
  return doc;
}

// Called before document update
async _preUpdate(id: string, data: Partial<Product>): Promise<Partial<Product>> {
  // Validate update data
  const product = await this.getProduct(id);
  if (product.status === 'published' && data.status === 'draft') {
    throw new Error('Cannot revert published product to draft');
  }
  return data;
}

// Called after document update
async _postUpdate(doc: Product): Promise<Product> {
  // Perform additional actions after update
  await this.cacheService.invalidateProduct(doc.id);
  return doc;
}

// Called before document removal
async _preRemove(id: string): Promise<void> {
  // Validate removal
  const product = await this.getProduct(id);
  if (product.hasActiveOrders) {
    throw new Error('Cannot remove product with active orders');
  }
}

// Called after document removal
async _postRemove(doc: Product): Promise<Product> {
  // Perform additional actions after removal
  await this.searchService.removeProductFromIndex(doc.id);
  return doc;
}
```

## Working with Other Services

Services often work together to implement complex operations:

```typescript
export class OrderService extends DbService(db.orderDb) {
  @Srv() productService: ProductService;
  @Srv() userService: UserService;
  @Srv() paymentService: PaymentService;
  @Use() emailApi: EmailApi;

  async createOrder(userId: string, items: OrderItemInput[]): Promise<Order> {
    // Get user information
    const user = await this.userService.getUser(userId);

    // Verify product availability and calculate total
    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await this.productService.getProduct(item.productId);

      if (product.stock < item.quantity) {
        throw new Error(`Not enough stock for ${product.name}`);
      }

      const itemTotal = product.price * item.quantity;
      total += itemTotal;

      orderItems.push({
        product: product.id,
        quantity: item.quantity,
        price: product.price,
        total: itemTotal,
      });

      // Update product stock
      await this.productService.updateProduct(product.id, {
        stock: product.stock - item.quantity,
      });
    }

    // Create order
    const order = await this.createOrder({
      user: user.id,
      items: orderItems,
      total,
      status: "pending",
    });

    // Send confirmation email
    await this.emailApi.sendOrderConfirmation(user.email, order);

    return order;
  }
}
```

## Websocket Integration

For real-time features:

```typescript
export class ChatService extends DbService(db.chatDb) {
  @Websocket()
  websocket: Websocket<ChatSignal>;

  async sendMessage(roomId: string, userId: string, content: string) {
    // Create message in database
    const message = await this.createMessage({
      room: roomId,
      sender: userId,
      content,
      sentAt: new Date(),
    });

    // Broadcast to room subscribers
    this.websocket.pubsubNewMessage(roomId, {
      id: message.id,
      sender: message.sender,
      content: message.content,
      sentAt: message.sentAt,
    });

    return message;
  }
}
```

## Queue Integration

For background processing:

```typescript
export class EmailService extends serve("email" as const) {
  @Queue()
  emailQueue: Queue<EmailSignal>;
  @Use()
  emailApi: EmailApi;

  async sendWelcomeEmail(userId: string, email: string) {
    // Add to background queue
    await this.emailQueue.add("sendWelcomeEmail", { userId, email });
  }

  // Process queue job
  async processSendWelcomeEmail(userId: string, email: string) {
    const template = await this.getWelcomeTemplate();
    await this.emailApi.send(email, "Welcome!", template);
    await this.userService.updateUser(userId, { emailSent: true });
  }
}
```

## Error Handling

Akan.js services should implement proper error handling:

```typescript
async transferFunds(fromAccountId: string, toAccountId: string, amount: number) {
  try {
    // Validate accounts
    const [fromAccount, toAccount] = await Promise.all([
      this.getAccount(fromAccountId),
      this.getAccount(toAccountId)
    ]);

    // Check balance
    if (fromAccount.balance < amount) {
      throw new InsufficientFundsError(
        `Account ${fromAccountId} has insufficient funds: ${fromAccount.balance} < ${amount}`
      );
    }

    // Perform transfer
    await Promise.all([
      this.updateAccount(fromAccountId, { balance: fromAccount.balance - amount }),
      this.updateAccount(toAccountId, { balance: toAccount.balance + amount })
    ]);

    // Log transaction
    await this.createTransaction({
      from: fromAccountId,
      to: toAccountId,
      amount,
      status: 'completed'
    });

    return true;
  } catch (error) {
    // Log error
    this.logger.error(`Transfer failed: ${error.message}`, error.stack);

    // Create failed transaction record
    await this.createTransaction({
      from: fromAccountId,
      to: toAccountId,
      amount,
      status: 'failed',
      error: error.message
    });

    // Rethrow domain-specific errors, wrap others
    if (error instanceof DomainError) {
      throw error;
    }

    throw new TransferFailedError(`Transfer failed: ${error.message}`, { cause: error });
  }
}
```

## Best Practices

### 1. Stateless Design

Services should not maintain internal state between requests:

```typescript
// BAD - maintains state in the service

class CounterService {
  private count = 0; // This state is lost on server restart

  increment() {
    this.count++;
  }
  getCount() {
    return this.count;
  }
}

// GOOD - uses database for state

class CounterService extends DbService(db.counterDb) {
  async increment(counterId: string) {
    const counter = await this.getCounter(counterId);
    return await counter.set({ count: counter.count + 1 }).save();
  }

  async getCount(counterId: string) {
    const counter = await this.getCounter(counterId);
    return counter.count;
  }
}
```

### 2. Single Responsibility

Each service should focus on a specific domain:

```typescript
// BAD - mixing concerns

class UserService extends DbService(db.userDb) {
  async createUser(data) {
    // User creation logic
  }

  async sendEmail(userId, subject, content) {
    // Email sending logic
  }

  async processPayment(userId, amount) {
    // Payment processing logic
  }
}

// GOOD - separate services

class UserService extends DbService(db.userDb) {
  @Srv() emailService: EmailService;
  @Srv() paymentService: PaymentService;

  async createUser(data) {
    // User creation logic
  }
}

class EmailService extends serve("email" as const) {
  async sendEmail(userId, subject, content) {
    // Email sending logic
  }
}

class PaymentService extends DbService(db.paymentDb) {
  async processPayment(userId, amount) {
    // Payment processing logic
  }
}
```

### 4. Transaction Safety

Use hooks for validating operations:

```typescript
async _preUpdate(id: string, data: Partial<Product>) {
  // Validate that product exists
  const product = await this.getProduct(id);

  // Check authorization
  if (product.owner !== this.currentUser.id) {
    throw new UnauthorizedError('You do not own this product');
  }

  // Validate business rules
  if (product.status === 'published' && data.price < product.price) {
    throw new ValidationError('Cannot reduce price of published product');
  }

  return data;
}
```

### 5. Service Dependency Injection

Inject other services using decorators, not direct imports:

```typescript
// BAD - direct import
import { UserService } from "../user/user.service";

class OrderService extends DbService(db.orderDb) {
  private userService = new UserService(); // Hard-coded dependency
}

// GOOD - dependency injection

class OrderService extends DbService(db.orderDb) {
  @Srv() userService: UserService; // Injected dependency
}
```

### 6. Logging

Use the built-in logger for consistent logging:

```typescript
class PaymentService extends DbService(db.paymentDb) {
  async processPayment(orderId: string, amount: number) {
    this.logger.log(`Processing payment of ${amount} for order ${orderId}`);

    try {
      // Payment processing logic
      this.logger.debug("Payment gateway response", response);

      return result;
    } catch (error) {
      this.logger.error(`Payment failed for order ${orderId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
```

## Complete Example

Here's a complete example of a service implementation:

```typescript
import { Dayjs } from "@akanjs/base";
import { Cron } from "@akanjs/nest";
import { DbService, Srv, Use } from "@akanjs/service";
import type { EmailApi } from "@util/nest";

import * as cnst from "../cnst";
import * as db from "../db";
import { Revert } from "../dict";
import type * as srv from "../srv";

export class OrderService extends DbService(db.orderDb) {
  @Srv() userService: srv.UserService;
  @Srv() productService: srv.ProductService;
  @Srv() paymentService: srv.PaymentService;
  @Use() emailApi: EmailApi;

  async onModuleInit() {
    await this.syncPendingOrders();
    this.logger.log("Order service initialized");
  }

  // Custom business logic
  async createOrder(userId: string, items: OrderItemInput[]): Promise<Order> {
    const user = await this.userService.getUser(userId);

    // Calculate total and check stock
    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await this.productService.getProduct(item.productId);

      if (product.stock < item.quantity) {
        throw new Revert("order.insufficientStock", { product: product.name });
      }

      const itemTotal = product.price * item.quantity;
      total += itemTotal;

      orderItems.push({
        product: product.id,
        name: product.name,
        quantity: item.quantity,
        price: product.price,
        total: itemTotal,
      });

      // Update product stock
      await this.productService.updateProduct(product.id, {
        stock: product.stock - item.quantity,
      });
    }

    // Create order
    const order = await this.createOrder({
      user: user.id,
      items: orderItems,
      total,
      status: "pending",
    });

    // Send confirmation email
    await this.emailApi.sendOrderConfirmation(user.email, {
      orderId: order.id,
      items: orderItems,
      total,
    });

    return order;
  }

  async cancelOrder(orderId: string) {
    const order = await this.getOrder(orderId);

    if (order.status !== "pending") {
      throw new Revert("order.cannotCancelProcessedOrder");
    }

    // Return stock to inventory
    for (const item of order.items) {
      await this.productService.updateProduct(item.product, {
        $inc: { stock: item.quantity },
      });
    }

    return await order.set({ status: "cancelled" }).save();
  }

  // Lifecycle hooks
  async _preUpdate(id: string, data: Partial<db.Order>) {
    const order = await this.getOrder(id);

    if (order.status === "completed" && data.status === "pending") {
      throw new Revert("order.cannotRevertCompletedOrder");
    }

    return data;
  }
}
```

## Troubleshooting

### Database Operations Failing

1. Check model definition and schema:

   ```typescript
   // Is the schema defined correctly?
   console.log(db.userDb);
   ```

2. Verify input data format:

   ```typescript
   this.logger.debug("Creating user with data:", userData);
   ```

3. Check for middleware or hook errors:
   ```typescript
   async _preCreate(data) {
     try {
       return await validateUser(data);  // This might be throwing
     } catch (error) {
       this.logger.error('Validation error:', error);
       throw error;
     }
   }
   ```

## Summary

Model services in Akan.js are powerful components that encapsulate business logic and data operations. By following the patterns and best practices outlined in this guide, you can create maintainable, scalable services that effectively implement your application's domain logic while maintaining clean separation of concerns.

Key takeaways:

- Services should be stateless, with persistent state managed in the database
- Use the appropriate decorator (@Srv, @Use, etc.) for dependency injection
- Implement lifecycle hooks for proper resource management
- Use scheduled tasks for recurring operations
- Follow single responsibility principle
- Use proper error handling and logging
- Leverage the built-in database operations from DbService
