# Model Signal Implementation Guide for Akan.js

## Purpose and Role of Model Signal Files

`model.signal.ts` files serve as the communication bridge between client and server in Akan.js applications. They implement a declarative pattern that simplifies and standardizes data flow throughout your application, while providing strong typing and automatic code generation.

Signals provide five key functionalities:

1. **Data Queries** (`@Query`) - Fetch data with typed parameters and responses
2. **Data Mutations** (`@Mutation`) - Modify data with transactional safety
3. **Real-time Messaging** (`@Message`) - Handle WebSocket communication
4. **Background Processing** (`@Process`) - Execute long-running jobs
5. **Publish/Subscribe** (`@Pubsub`) - Manage real-time data subscriptions

The Signal system abstracts away the underlying transport mechanisms (GraphQL, REST, WebSockets) while maintaining type safety across client and server.

## Signal Class Structure

A typical model.signal.ts file follows this structure:

```typescript
import { ID, Int } from "@akanjs/base";
import { SortOf } from "@akanjs/constant";
import { Arg, DbSignal, Mutation, Query, resolve, Self, Signal } from "@akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";

export class ModelNameSignal extends DbSignal(cnst.modelNameCnst, cnst.Srvs, {
  guards: { root: Admin, get: Query.Public, cru: Mutation.User },
}) {
  // Signal methods here...
}
```

Key components:

- `

### 2. @Mutation Decorator

Used for operations that modify data, with similar access control:

```typescript
@Mutation.User(() => cnst.ChatRoom)  // User-level access, returns ChatRoom
async openChatRoom(
  @Arg.Param("root", () => ID) root: string,
  @Arg.Param("targetId", () => ID) targetId: string,
  @Self() self: Self  // Gets current user automatically
) {
  const chatRoom = await this.chatRoomService.open({
    targetId,
    userId: self.id,
    root,
  });
  return resolve<cnst.ChatRoom>(chatRoom);
}
```

### 3. @Message Decorator

Handles real-time socket messages for instant communication:

```typescript
@Message.User(() => Boolean)  // User-level access, returns Boolean
async readChat(
  @Arg.Msg("root", () => ID) root: string,
  @Arg.Msg("userId", () => ID) userId: string
) {
  const chat = await this.chatRoomService.readChat(root, userId);
  return resolve<boolean>(!!chat);
}
```

### 4. @Process Decorator

For background processing on the server:

```typescript
@Process.Federation(() => Boolean)  // Federation scope, returns Boolean
async archiveDbBackup(
  @Arg.Msg("dbBackupId", () => String) dbBackupId: string
) {
  await this.dbBackupService.archiveDbBackup(dbBackupId);
  return done(true);  // Use done() for process completion
}
```

Process scopes:

- `Process.Federation` - Run on federation servers
- `Process.Batch` - Run on batch processing servers
- `Process.All` - Run on all server types

### 5. @Pubsub Decorator

Manages real-time subscriptions:

```typescript
@Pubsub.Public(() => cnst.Chat)  // Public subscription, emits Chat objects
chatAdded(
  @Arg.Room("root", () => ID) root: string,  // Room parameter for subscription
  @Ws() ws: Ws  // WebSocket context
) {
  return subscribe<cnst.Chat>();  // Subscribe to this type
}
```

## Parameter Decorators

Signals use parameter decorators to define how data is passed:

1. **HTTP/GraphQL Parameters**

   - `@Arg.Query()` - URL query parameters
   - `@Arg.Param()` - URL path parameters
   - `@Arg.Body()` - Request body data
   - `@Arg.Upload()` - File uploads

2. **WebSocket Parameters**

   - `@Arg.Msg()` - Message data
   - `@Arg.Room()` - Room for subscription

3. **Context Parameters**
   - `@Self()` - Current authenticated user
   - `@Account()` - User account information
   - `@UserIp()` - Client IP address
   - `@Ws()` - WebSocket context

## Slice Pattern for Data Access

The slice pattern standardizes data access with consistent naming and pagination:

```typescript
// * /////////////////////////////////////
// * Self Slice
@Query.User(() => [cnst.ChatRoom])
async chatRoomListInSelf(  // listIn<SliceName> pattern
  @Arg.Query("skip", () => Int, { nullable: true }) skip: number | null,
  @Arg.Query("limit", () => Int, { nullable: true }) limit: number | null,
  @Arg.Query("sort", () => String, { nullable: true }) sort: SortOf<db.ChatRoomFilter> | null,
  @Self() self: Self
) {
  const chatRooms = await this.chatRoomService.listInUser(self.id, { skip, limit, sort });
  return resolve<cnst.ChatRoom[]>(chatRooms);
}

@Query.User(() => cnst.ChatRoomInsight)
async chatRoomInsightInSelf(  // insightIn<SliceName> pattern
  @Self() self: Self
) {
  const chatRoomInsight = await this.chatRoomService.insightInUser(self.id);
  return resolve<cnst.ChatRoomInsight>(chatRoomInsight);
}
// * Self Slice
// * /////////////////////////////////////
```

Common slices:

- `Self` - Data related to the current user
- `Public` - Publicly accessible data
- `Featured` - Highlighted items
- `Root/Parent` - Items within a parent container
- Custom domain slices (e.g., `DevApp`, `Init`)

## Client-Side Signal Usage

### 1. Direct API Calls

```typescript
import { productGet, productListInFeatured } from "./product.signal";

// Fetch a single product
const product = await productGet("product-123");

// Fetch a list with parameters
const featuredProducts = await productListInFeatured(0, 10, "price-asc");
```

### 2. Store Integration

```typescript
// product.store.ts
import { create } from "zustand";
import { productListInFeatured, productInsightInFeatured } from "./product.signal";

export const useProductStore = create<ProductStore>((set) => ({
  featured: [],
  insight: undefined,

  loadFeatured: async (page = 1, limit = 10) => {
    const [products, insight] = await Promise.all([
      productListInFeatured((page - 1) * limit, limit, "popular"),
      productInsightInFeatured(),
    ]);

    set({ featured: products, insight });
  },
}));
```

### 3. React Component Integration

```tsx
import { useEffect } from "react";
import { useProductStore } from "./product.store";

function FeaturedProducts() {
  const { featured, insight, loadFeatured } = useProductStore();

  useEffect(() => {
    loadFeatured();
  }, []);

  return (
    <div>
      <h3>Featured Products ({insight?.count})</h3>
      {featured.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

### 4. Real-Time Subscriptions

```tsx
import { useEffect } from "react";
import { subscribeChatAdded } from "./chatRoom.signal";
import { useChatStore } from "./chat.store";

function ChatRoom({ roomId }) {
  const { addChat } = useChatStore();

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribe = subscribeChatAdded(roomId, (chat) => {
      addChat(chat);
    });

    return () => {
      // Cleanup subscription
      unsubscribe();
    };
  }, [roomId]);

  // Component JSX...
}
```

## Advanced Patterns

### 1. DbSignal for Standard CRUD

DbSignal creates standard operations that you don't need to implement:

```typescript
export class BoardSignal extends DbSignal(cnst.boardCnst, cnst.Srvs, {
  guards: { root: Admin, get: Query.Public, cru: Mutation.Admin },
}) {
  // Custom methods beyond CRUD go here
}
```

This automatically provides:

- `getBoard(id)` - Get by ID
- `lightBoard(id)` - Get lightweight version
- `boardList(filter, options)` - List with pagination
- `boardInsight(filter)` - Get counts/statistics
- `boardExists(filter)` - Check existence
- `createBoard(data)` - Create new record
- `updateBoard(id, data)` - Update existing record
- `removeBoard(id)` - Soft-delete record

### 2. Combined Queries

```typescript
@Query.Public(() => cnst.DashboardData)
async getDashboard(@Self() self: Self) {
  // Parallel data fetching
  const [stats, notifications, activities] = await Promise.all([
    this.statsService.getUserStats(self.id),
    this.notificationService.getRecent(self.id, { limit: 5 }),
    this.activityService.getRecent(self.id, { limit: 10 })
  ]);

  // Return combined result
  return resolve<cnst.DashboardData>({
    stats,
    notifications,
    activities
  });
}
```

### 3. Batch Operations

```typescript
@Mutation.Admin(() => [cnst.User])
async bulkUpdateUserStatus(
  @Arg.Body("userIds", () => [ID]) userIds: string[],
  @Arg.Body("status", () => String) status: cnst.UserStatus
) {
  const users = await this.userService.bulkUpdateStatus(userIds, status);
  return resolve<cnst.User[]>(users);
}
```

### 4. Filtered Access Control

```typescript
@Query.User(() => cnst.ProjectDetails)
async getProjectDetails(
  @Arg.Param("projectId", () => ID) projectId: string,
  @Self() self: Self
) {
  // Check permissions within the method
  const hasAccess = await this.projectService.checkUserAccess(projectId, self.id);
  if (!hasAccess) {
    throw new Error("Access denied");
  }

  const project = await this.projectService.getDetails(projectId);
  return resolve<cnst.ProjectDetails>(project);
}
```

## Best Practices

### 1. Naming Conventions

- **Method Names**:

  - Use `modelListIn<Slice>` for list queries
  - Use `modelInsightIn<Slice>` for insight queries
  - Prefix mutations with verbs (`createUser`, `updateProfile`)
  - Use descriptive names that indicate functionality

- **Parameter Names**:
  - Use consistent names across similar methods
  - Match service method parameter names where possible

### 2. Type Safety

- Always specify return types in decorators: `@Query.Public(() => ModelType)`
- Always use `resolve<Type>()` with explicit type
- Define parameter types with GraphQL scalar types: `() => ID`, `() => Int`
- Use nullability consistently: `{ nullable: true }`

### 3. Performance

- Use pagination parameters consistently (`skip`/`limit` or `page`/`pageSize`)
- Implement slices for focused data retrieval
- Use parallel requests with `Promise.all` for combined data
- Consider implementing cursor-based pagination for large datasets

### 4. Security

- Apply appropriate access control decorators
- Validate input data in signals or services
- Use the `@Self()` decorator to ensure user-scoped operations
- Implement rate limiting for public endpoints

### 5. Error Handling

- Use try/catch blocks for operations that might fail
- Return standardized error formats
- Add logging for debugging purposes
- Handle database errors gracefully

## Implementation Examples

### Basic CRUD Signal with DbSignal

```typescript
export class ProductSignal extends DbSignal(cnst.productCnst, cnst.Srvs, {
  guards: { root: Admin, get: Query.Public, cru: Mutation.Admin },
}) {
  // Custom methods beyond auto-generated CRUD
  @Query.Public(() => [cnst.Product])
  async productListInFeatured(
    @Arg.Query("skip", () => Int, { nullable: true }) skip: number | null,
    @Arg.Query("limit", () => Int, { nullable: true }) limit: number | null
  ) {
    const products = await this.productService.listFeatured({ skip, limit });
    return resolve<cnst.Product[]>(products);
  }

  @Mutation.Admin(() => Boolean)
  async toggleProductFeatured(
    @Arg.Param("productId", () => ID) productId: string,
    @Arg.Body("featured", () => Boolean) featured: boolean
  ) {
    await this.productService.setFeatured(productId, featured);
    return resolve<boolean>(true);
  }
}
```

### Real-Time Chat Signal

```typescript
export class ChatSignal {
  @Mutation.User(() => cnst.Chat)
  async sendChat(
    @Arg.Body("roomId", () => ID) roomId: string,
    @Arg.Body("message", () => String) message: string,
    @Self() self: Self
  ) {
    const chat = await this.chatService.create(roomId, self.id, message);
    return resolve<cnst.Chat>(chat);
  }

  @Message.User(() => Boolean)
  async markAsRead(@Arg.Msg("chatId", () => ID) chatId: string, @Self() self: Self) {
    await this.chatService.markAsRead(chatId, self.id);
    return resolve<boolean>(true);
  }

  @Pubsub.User(() => cnst.Chat)
  chatReceived(@Arg.Room("roomId", () => ID) roomId: string, @Ws() ws: Ws) {
    return subscribe<cnst.Chat>();
  }
}
```

### Background Processing Signal

```typescript
export class ReportSignal {
  @Mutation.Admin(() => cnst.Report)
  async generateReport(
    @Arg.Body("type", () => String) type: cnst.ReportType,
    @Arg.Body("parameters", () => cnst.ReportParameters) parameters: cnst.ReportParameters,
    @Self() self: Self
  ) {
    // Create report record
    const report = await this.reportService.initReport(type, parameters, self.id);

    // Queue background process
    await this.reportService.queueReportGeneration(report.id);

    return resolve<cnst.Report>(report);
  }

  @Process.Batch(() => Boolean)
  async processReport(@Arg.Msg("reportId", () => ID) reportId: string) {
    await this.reportService.generateReport(reportId);
    return done(true);
  }
}
```

## Troubleshooting

### Common Issues

1. **Type Mismatch Errors**

   - Ensure GraphQL types match TypeScript types
   - Check nullable parameters and provide default values
   - Verify service method return types match signal return types

2. **Authentication Errors**

   - Verify guard levels match your security requirements
   - Check that @Self() is used in user-scoped operations
   - Test with different user roles to verify access control

3. **Real-Time Communication Issues**

   - Ensure room names are consistent between subscriptions and messages
   - Verify WebSocket connection is established
   - Check that subscription events are being triggered correctly

4. **Missing Data in Client**
   - Verify signal method parameters match client call parameters
   - Check that resolve<Type>() is being used correctly
   - Ensure proper error handling on the client side

### Debugging Tips

1. Enable verbose logging in development
2. Use network inspection tools to examine requests/responses
3. Add temporary logging in signal methods
4. Test signals directly in a backend-only environment
5. Use GraphQL playground to test queries/mutations

## Advanced Topics

### Custom Signal Decorators

You can create custom decorators for reusable patterns:

```typescript
// Create a custom slice decorator
export function SelfSlice<T>(returnType: () => T) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Query.User(returnType)(target, propertyKey, descriptor);
    // Add additional metadata or behavior
  };
}
```

### Signal Integration with External APIs

```typescript
export class ExternalApiSignal {
  @Query.Public(() => cnst.WeatherData)
  async getWeatherData(@Arg.Query("location", () => String) location: string) {
    // Call external API with proper error handling
    try {
      const data = await this.externalApiService.fetchWeather(location);
      return resolve<cnst.WeatherData>(data);
    } catch (error) {
      // Handle and transform errors from external API
      throw new Error(`Weather API error: ${error.message}`);
    }
  }
}
```

### Caching Strategies

Signals can implement caching for performance:

```typescript
export class ProductSignal extends DbSignal(cnst.productCnst, Srvs) {
  @Query.Public(() => cnst.Product)
  async getProduct(@Arg.Param("productId", () => ID) productId: string) {
    // Check cache first
    const cached = await this.cacheService.get(`product:${productId}`);
    if (cached) {
      return resolve<cnst.Product>(cached);
    }

    // Fetch from database if not cached
    const product = await this.productService.get(productId);

    // Cache for future requests
    await this.cacheService.set(`product:${productId}`, product, 3600);

    return resolve<cnst.Product>(product);
  }
}
```

Remember that signals should be pure TypeScript with no framework-specific code, as they're used by both client and server. The Akan.js framework handles the conversion to the appropriate transport mechanism.
