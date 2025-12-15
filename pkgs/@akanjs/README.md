# Akan.js Framework Guide

> **⚠️ Important Notice**: This repository is currently a uni-directional repository that syncs the monorepo of the Akan team. It will be converted to a standalone project soon. Please stay tuned for updates.

## Introduction to Akan.js Framework

Akan.js is a comprehensive full-stack TypeScript framework designed to streamline application development across all layers of the technology stack. It enables developers to:

- Build complete, type-safe applications with minimal code
- Deploy simultaneously to web, mobile, server, database, and infrastructure
- Maintain consistent patterns and high performance throughout the application

Akan.js reduces development complexity by providing a unified interface for all development concerns, from database schema to UI components, with built-in best practices for architecture, security, and scalability.

---

## Key Features and Benefits

### Unified Development Experience

- **Integral Interface**: Single cohesive system for schema design, service logic, API endpoints, state management, and UI components
- **Reduced Boilerplate**: Write once, deploy everywhere with automated code generation
- **Full Type Safety**: End-to-end TypeScript with automatic type inference between layers
- **Automated Synchronization**: Changes to models automatically propagate across the stack

### Built-in Capabilities

- **Type-Safe API Layer**: Automatic API generation with proper typing
- **Internationalization**: Built-in i18n system with dictionary-based translations
- **Security**: Standardized authentication, authorization, and security practices
- **File Management**: Integrated system for uploads, storage, and delivery
- **Text Search**: Optimized search capabilities out of the box
- **Documentation**: Automatic API and model documentation
- **Admin Interface**: Generated admin panels for data management

### Platform Support

- **Web**: Next.js-based SSR and CSR support
- **Mobile**: Native iOS and Android apps via Capacitor
- **Server**: NestJS-based backend with GraphQL and REST
- **Database**: MongoDB integration with Mongoose
- **Infrastructure**: Automated deployment to Akan Cloud

---

## Architecture Overview

### Modular Architecture

```
├── apps/                 # Application code
│   ├── app1/             # Individual application
│   │   ├── akan.config.ts   # Application configuration
│   │   ├── app/          # Next.js app router
│   │   ├── lib/          # Domain modules
│   │   │   ├── moduleA/  # Feature module
│   │   │   │   ├── moduleA.constant.ts  # Types and schemas
│   │   │   │   ├── moduleA.service.ts   # Business logic
│   │   │   │   ├── moduleA.signal.ts    # API endpoints
│   │   │   │   ├── moduleA.store.ts     # State management
│   │   │   │   ├── moduleA.dictionary.ts # Translations
│   │   │   │   ├── moduleA.View.tsx     # Page view component
│   │   │   │   ├── moduleA.Unit.tsx     # List/card item component
│   │   │   │   └── moduleA.Template.tsx # Form template component
│   │   ├── env/         # Environment configurations
│   │   ├── main.ts      # Application entry point
│   │   ├── client.ts    # Client-side entry point
│   │   └── server.ts    # Server-side entry point
├── libs/                 # Shared libraries
│   ├── shared/           # Core shared library
│   ├── util/             # Utility library
│   └── [other libs]/     # Domain-specific libraries
└── pkgs/                 # Framework packages
    └── @akanjs/          # Core framework components
```

### Data Flow

1. **Model Definition**: `model.constant.ts` defines types, schemas, and validations
2. **Service Layer**: `model.service.ts` implements business logic and database operations
3. **API Layer**: `model.signal.ts` exposes endpoints and handles client-server communication
4. **State Management**: `model.store.ts` manages client-side state with Zustand
5. **UI Components**: `.View.tsx`, `.Unit.tsx`, `.Template.tsx` render the UI

### Multi-Environment Support

Configure and deploy to different environments with environment-specific settings:

```
apps/yourapp/env/
├── env.client.debug.ts    # Debug client environment
├── env.client.develop.ts  # Development client environment
├── env.client.main.ts     # Production client environment
├── env.server.debug.ts    # Debug server environment
├── env.server.develop.ts  # Development server environment
└── env.server.main.ts     # Production server environment
```

---

## Domain-Driven Development Pattern

Akan.js embraces domain-driven design principles, organizing code around business domains rather than technical concerns.

### Module Pattern

Each domain feature follows a consistent module pattern:

1. **Constants**: Define types, interfaces, and schemas
2. **Service**: Implement business logic and database interactions
3. **Signal**: Create API endpoints and client-server communication
4. **Store**: Manage client-side state for the module
5. **Dictionary**: Provide translations for the module
6. **UI Components**: Create specialized components for the module

### Module Composition

Modules can interact and compose:

```typescript
// Importing from another module
import { userService } from "../user/user.service";
import { projectStore } from "../project/project.store";

// Using in your service
export const taskService = {
  async assignTask(taskId: string, userId: string) {
    // Validate user exists
    const user = await userService.getUser(userId);
    if (!user) throw new Error("User not found");

    // Update task
    const task = await Task.findByIdAndUpdate(taskId, {
      assignedTo: userId,
    });

    // Update client state
    projectStore.getState().refreshTasks();

    return task;
  },
};
```

---

## Full-Stack Development Workflow

### Create a New Model

1. Define the model in `model.constant.ts`:

```typescript
import { Field, Model } from "@akanjs/constant";

@Model()
export class Project {
  @Field()
  id: string;

  @Field()
  title: string;

  @Field()
  description: string;

  @Field()
  status: "active" | "completed" | "archived";

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
```

2. Generate service, signal, and store files:

```bash
akan generate:module project
```

3. Implement business logic in `project.service.ts`:

```typescript
import { Project } from "./project.constant";

export const projectService = {
  async getProjects() {
    return Project.find().sort({ updatedAt: -1 });
  },

  async createProject(data: Partial<Project>) {
    return Project.create(data);
  },
};
```

4. Define API endpoints in `project.signal.ts`:

```typescript
import { Signal } from "@akanjs/signal";
import { Project } from "./project.constant";
import { projectService } from "./project.service";

export class ProjectSignal {
  async projectList() {
    return projectService.getProjects();
  }

  async createProject(data: Partial<Project>) {
    return projectService.createProject(data);
  }
}
```

5. Create UI components for your model:

```tsx
// project.View.tsx
import { usePage } from "@akanjs/client";
import { projectSignal } from "./project.signal";

export const ProjectView = () => {
  const { data } = projectSignal.useProjectList();
  const { l } = usePage();

  return (
    <div>
      <h1>{l("project.modelName")}</h1>
      <div className="grid gap-4">{data?.map((project) => <ProjectUnit key={project.id} project={project} />)}</div>
    </div>
  );
};
```

---

## Model Architecture

### Model Constants (`model.constant.ts`)

Defines the data structure, validation rules, and relationships:

```typescript
import { Field, Model, FilterArg, Query } from "@akanjs/constant";

@Model()
export class Task {
  @Field()
  id: string;

  @Field()
  title: string;

  @Field({ required: false })
  description?: string;

  @Field()
  status: "todo" | "in-progress" | "done";

  @Field()
  projectId: string;

  @Field({ ref: () => User })
  assignedTo: string;
}

export class TaskFilter {
  @FilterArg()
  statuses?: string[];

  @Query("byProject")
  byProject(projectId: string) {
    return { projectId };
  }
}
```

### Model Service (`model.service.ts`)

Implements business logic and database operations:

```typescript
import { Task } from "./task.constant";
import { userService } from "../user/user.service";

export const taskService = {
  async getTasks(query = {}) {
    return Task.find(query).sort({ updatedAt: -1 });
  },

  async createTask(data: Partial<Task>) {
    // Business logic validation
    if (data.assignedTo) {
      const userExists = await userService.userExists(data.assignedTo);
      if (!userExists) {
        throw new Error("Assigned user not found");
      }
    }

    return Task.create({
      ...data,
      status: data.status || "todo",
    });
  },

  async updateTaskStatus(taskId: string, status: Task["status"]) {
    return Task.findByIdAndUpdate(taskId, { status });
  },
};
```

### Model Signal (`model.signal.ts`)

Exposes API endpoints for client-server communication:

```typescript
import { Signal } from "@akanjs/signal";
import { Task, TaskFilter } from "./task.constant";
import { taskService } from "./task.service";

export class TaskSignal {
  async taskList(query: TaskFilter, skip = 0, limit = 20) {
    return taskService.getTasks(query);
  }

  async task(taskId: string) {
    return taskService.getTask(taskId);
  }

  async createTask(data: Partial<Task>) {
    return taskService.createTask(data);
  }

  async updateTaskStatus(taskId: string, status: Task["status"]) {
    return taskService.updateTaskStatus(taskId, status);
  }
}
```

### Model Store (`model.store.ts`)

Manages client-side state:

```typescript
import { create } from "zustand";
import { Task } from "./task.constant";
import { taskSignal } from "./task.signal";

interface TaskStore {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  fetchTasks: (projectId?: string) => Promise<void>;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, data: Partial<Task>) => void;
}

export const taskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  fetchTasks: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const query = projectId ? { byProject: projectId } : {};
      const tasks = await taskSignal.taskList(query);
      set({ tasks, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  addTask: (task) => {
    set({ tasks: [...get().tasks, task] });
  },

  updateTask: (taskId, data) => {
    set({
      tasks: get().tasks.map((task) => (task.id === taskId ? { ...task, ...data } : task)),
    });
  },
}));
```

---

## Component Architecture

Akan.js uses a specialized component pattern to ensure consistency and separation of concerns.

### View Components (`model.View.tsx`)

Page-level components that display a full page or section:

```tsx
import { usePage } from "@akanjs/client";
import { taskStore } from "./task.store";
import { TaskUnit } from "./task.Unit";
import { TaskTemplate } from "./task.Template";

export const TaskView = () => {
  const { l } = usePage();
  const { tasks, loading, fetchTasks } = taskStore();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">{l("task.modelName")}</h1>

      <TaskTemplate className="mb-6" />

      {loading ? (
        <div>Loading tasks...</div>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task) => (
            <TaskUnit key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
};
```

### Unit Components (`model.Unit.tsx`)

Card or list item components that display a single instance of a model:

```tsx
import { usePage } from "@akanjs/client";
import { Task } from "./task.constant";
import { taskSignal } from "./task.signal";

interface TaskUnitProps {
  task: Task;
  onStatusChange?: () => void;
}

export const TaskUnit = ({ task, onStatusChange }: TaskUnitProps) => {
  const { l } = usePage();
  const { mutate: updateStatus } = taskSignal.useUpdateTaskStatus();

  const handleStatusChange = (status: Task["status"]) => {
    updateStatus(task.id, status).then(() => {
      onStatusChange?.();
    });
  };

  return (
    <div className="rounded border p-4">
      <h3 className="font-bold">{task.title}</h3>
      <p className="text-gray-700">{task.description}</p>
      <div className="mt-2 flex justify-between">
        <span className={`badge ${task.status}`}>{l(`enum-status-${task.status}`)}</span>
        <select value={task.status} onChange={(e) => handleStatusChange(e.target.value as Task["status"])}>
          <option value="todo">{l("enum-status-todo")}</option>
          <option value="in-progress">{l("enum-status-in-progress")}</option>
          <option value="done">{l("enum-status-done")}</option>
        </select>
      </div>
    </div>
  );
};
```

### Template Components (`model.Template.tsx`)

Form components for creating or editing a model:

```tsx
import { useState } from "react";
import { usePage } from "@akanjs/client";
import { Task } from "./task.constant";
import { taskSignal } from "./task.signal";
import { taskStore } from "./task.store";

interface TaskTemplateProps {
  initialData?: Partial<Task>;
  className?: string;
}

export const TaskTemplate = ({ initialData = {}, className }: TaskTemplateProps) => {
  const { l } = usePage();
  const { mutate: createTask, isLoading } = taskSignal.useCreateTask();
  const addTask = taskStore((state) => state.addTask);

  const [formData, setFormData] = useState({
    title: initialData.title || "",
    description: initialData.description || "",
    status: initialData.status || "todo",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTask(formData).then((newTask) => {
      addTask(newTask);
      setFormData({ title: "", description: "", status: "todo" });
    });
  };

  return (
    <form className={`rounded border p-4 ${className}`} onSubmit={handleSubmit}>
      <h2 className="mb-4 text-xl font-bold">{l("task.createTask")}</h2>

      <div className="mb-4">
        <label className="mb-1 block">{l("task.title")}</label>
        <input
          type="text"
          className="w-full rounded border px-2 py-1"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block">{l("task.description")}</label>
        <textarea
          className="w-full rounded border px-2 py-1"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <button type="submit" className="rounded bg-blue-500 px-4 py-2 text-white" disabled={isLoading}>
        {isLoading ? l("loading") : l("submit")}
      </button>
    </form>
  );
};
```

### Zone Components (`model.Zone.tsx`)

Layout containers that organize multiple components:

```tsx
import { ReactNode } from "react";
import { usePage } from "@akanjs/client";

interface TaskZoneProps {
  title?: string;
  children: ReactNode;
}

export const TaskZone = ({ title, children }: TaskZoneProps) => {
  const { l } = usePage();

  return (
    <div className="rounded-lg border bg-gray-50 p-6">
      {title && <h2 className="mb-4 text-xl font-bold">{title || l("task.tasks")}</h2>}
      <div className="space-y-4">{children}</div>
    </div>
  );
};
```

---

## API Integration Pattern

### Defining API Endpoints

In your signal file:

```typescript
import { Signal } from "@akanjs/signal";
import { Product, ProductFilter } from "./product.constant";
import { productService } from "./product.service";

export class ProductSignal {
  async productList(query: ProductFilter, skip = 0, limit = 20) {
    return productService.getProducts(query, skip, limit);
  }

  async product(productId: string) {
    return productService.getProduct(productId);
  }

  async createProduct(data: Partial<Product>) {
    return productService.createProduct(data);
  }

  async updateProduct(productId: string, data: Partial<Product>) {
    return productService.updateProduct(productId, data);
  }
}
```

### Using API Endpoints in Components

With auto-generated React hooks:

```tsx
import { productSignal } from "./product.signal";

export const ProductList = () => {
  // Query hook with automatic caching and refetching
  const { data: products, isLoading, error } = productSignal.useProductList();

  // Mutation hook with automatic cache updating
  const { mutate: createProduct, isLoading: isCreating } = productSignal.useCreateProduct();

  // Access both data and mutation functions
  return (
    <div>
      {isLoading ? (
        <div>Loading...</div>
      ) : error ? (
        <div>Error: {error.message}</div>
      ) : (
        <ul>{products?.map((product) => <li key={product.id}>{product.name}</li>)}</ul>
      )}

      <button onClick={() => createProduct({ name: "New Product" })} disabled={isCreating}>
        Add Product
      </button>
    </div>
  );
};
```

---

## State Management Pattern

Akan.js uses Zustand for state management, providing a simple but powerful store pattern:

### Creating a Store

```typescript
import { create } from "zustand";
import { Order } from "./order.constant";
import { orderSignal } from "./order.signal";

interface OrderStore {
  // State
  orders: Order[];
  selectedOrderId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchOrders: () => Promise<void>;
  selectOrder: (orderId: string) => void;
  addOrder: (order: Order) => void;
  updateOrder: (orderId: string, data: Partial<Order>) => void;
  deleteOrder: (orderId: string) => Promise<void>;
}

export const orderStore = create<OrderStore>((set, get) => ({
  // Initial state
  orders: [],
  selectedOrderId: null,
  loading: false,
  error: null,

  // Actions
  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await orderSignal.orderList();
      set({ orders, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  selectOrder: (orderId) => {
    set({ selectedOrderId: orderId });
  },

  addOrder: (order) => {
    set({ orders: [...get().orders, order] });
  },

  updateOrder: (orderId, data) => {
    set({
      orders: get().orders.map((order) => (order.id === orderId ? { ...order, ...data } : order)),
    });
  },

  deleteOrder: async (orderId) => {
    set({ loading: true, error: null });
    try {
      await orderSignal.removeOrder(orderId);
      set({
        orders: get().orders.filter((order) => order.id !== orderId),
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },
}));
```

### Using the Store in Components

```tsx
import { orderStore } from "./order.store";
import { orderSignal } from "./order.signal";

export const OrderManager = () => {
  // Access store state and actions
  const { orders, selectedOrderId, loading, fetchOrders, selectOrder } = orderStore();

  // Lifecycle hooks
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Render UI based on state
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h2>Orders</h2>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <ul>
            {orders.map((order) => (
              <li
                key={order.id}
                className={order.id === selectedOrderId ? "selected" : ""}
                onClick={() => selectOrder(order.id)}
              >
                {order.number} - {order.customerName}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2>Details</h2>
        {selectedOrderId && <OrderDetails orderId={selectedOrderId} />}
      </div>
    </div>
  );
};

// Another component using the same store
const OrderDetails = ({ orderId }) => {
  // Selective state access
  const order = orderStore((state) => state.orders.find((o) => o.id === orderId));

  // API integration
  const { mutate: updateOrder } = orderSignal.useUpdateOrder();

  // UI based on store state
  return order ? (
    <div>
      <h3>{order.number}</h3>
      <p>Customer: {order.customerName}</p>
      <p>Status: {order.status}</p>

      <select value={order.status} onChange={(e) => updateOrder(order.id, { status: e.target.value })}>
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="shipped">Shipped</option>
        <option value="delivered">Delivered</option>
      </select>
    </div>
  ) : null;
};
```

---

## Multi-Platform Support

Akan.js provides seamless support for various platforms:

### Web Applications

SSR with Next.js:

```tsx
// app/[lang]/projects/page.tsx
import { ProjectView } from "../../../lib/project/project.View";

export default function ProjectsPage() {
  return <ProjectView />;
}
```

### Mobile Applications

Using Capacitor for iOS and Android:

```typescript
// capacitor.config.ts
import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.myapp",
  appName: "My App",
  webDir: "dist",
  bundledWebRuntime: false,
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
    },
  },
};

export default config;
```

Then build and run:

```bash
akan build
npx cap add ios
npx cap add android
npx cap copy
npx cap open ios    # Open in Xcode
npx cap open android  # Open in Android Studio
```

---

## Type Safety and Code Generation

Akan.js provides end-to-end type safety:

### Type-Safe Database Schema

```typescript
import { Field, Model } from "@akanjs/constant";

@Model()
export class Customer {
  @Field()
  id: string;

  @Field({ required: true, maxLength: 100 })
  name: string;

  @Field({ required: true, isEmail: true })
  email: string;

  @Field({ required: false, minLength: 6 })
  phone?: string;

  @Field()
  createdAt: Date;
}
```

### Type-Safe API Calls

```typescript
// Generated types for API responses
const { data, isLoading, error } = customerSignal.useCustomerList();
if (data) {
  // data is typed as Customer[]
  data.forEach((customer) => {
    // Type-safe access to customer properties
    console.log(customer.name, customer.email);
  });
}
```

### Type-Safe Form Handling

```tsx
// Form with type checking
const { mutate: updateCustomer } = customerSignal.useUpdateCustomer();

// This will give a type error if fields don't match Customer model
updateCustomer(customerId, {
  name: "John Doe",
  email: "john@example.com",
  invalidField: "value", // TypeScript error: Property 'invalidField' does not exist on type 'Customer'
});
```

---

## Internationalization (i18n) System

Akan.js provides a robust i18n system:

### Translation Dictionaries

```typescript
// customer.dictionary.ts
import { ModelDictionary, baseTrans } from "@akanjs/dictionary";
import { Customer, CustomerFilter } from "./customer.constant";

export const modelDictionary = {
  ...baseTrans,
  modelName: ["Customer", "고객"],
  modelDesc: ["Customer account information", "고객 계정 정보"],

  // * ==================== Model ==================== * //
  name: ["Name", "이름"],
  "desc-name": ["Customer's full name", "고객의 전체 이름"],

  email: ["Email", "이메일"],
  "desc-email": ["Primary contact email", "주요 연락 이메일"],

  phone: ["Phone", "전화번호"],
  "desc-phone": ["Contact phone number", "연락처 전화번호"],
  // * ==================== Model ==================== * //

  // * ==================== Filter ==================== * //
  "qry-byEmail": ["By Email", "이메일로 검색"],
  "qrydesc-byEmail": ["Search customers by email", "이메일로 고객 검색"],
  "qarg-byEmail-email": ["Email", "이메일"],
  "qargdesc-byEmail-email": ["Email address to search", "검색할 이메일 주소"],
  // * ==================== Filter ==================== * //

  // * ==================== Etc ==================== * //
  "enum-status-active": ["Active", "활성"],
  "enumdesc-status-active": ["Active customer", "활성 고객"],

  "enum-status-inactive": ["Inactive", "비활성"],
  "enumdesc-status-inactive": ["Inactive customer", "비활성 고객"],
  // * ==================== Etc ==================== * //
} satisfies ModelDictionary<Customer, any, CustomerFilter>;

export const customerDictionary = modelDictionary;
```

### Using Translations

```tsx
import { usePage } from "@akanjs/client";

export const CustomerForm = () => {
  const { l, locale } = usePage();

  return (
    <form>
      <h2>{l("customer.modelName")}</h2>

      <div>
        <label>{l("customer.name")}</label>
        <input type="text" placeholder={l("customer.desc-name")} />
      </div>

      <div>
        <label>{l("customer.email")}</label>
        <input type="email" placeholder={l("customer.desc-email")} />
      </div>

      <div>
        <label>{l("customer.phone")}</label>
        <input type="tel" placeholder={l("customer.desc-phone")} />
      </div>

      <button type="submit">{l("submit")}</button>
    </form>
  );
};
```

---

## Development Tools and Commands

Akan.js provides powerful CLI tools for development:

### Starting Applications

```bash
# Start frontend and backend
akan start my-app

# Start only the frontend
akan start-frontend my-app

# Start only the backend
akan start-backend my-app
```

### Code Generation

```bash
# Generate a new module
akan generate:module customer

# Generate a new component
akan generate:component customer CustomerDetails

# Generate service from a model
akan generate:service customer
```

### Building and Deployment

```bash
# Build for production
akan build my-app

# Deploy to Akan Cloud
akan deploy my-app
```

### Testing

```bash
# Run unit tests
akan test my-app

# Run end-to-end tests
akan test:e2e my-app
```

---

## Best Practices and Common Patterns

### File Naming Conventions

- **Model Files**: `moduleName.constant.ts`, `moduleName.service.ts`, etc.
- **Component Files**: `ModuleName.View.tsx`, `ModuleName.Unit.tsx`, etc.
- **Utility Files**: `moduleName.util.ts`

### Code Organization

- Group files by domain/module, not by technical function
- Keep related code together in the same directory
- Use absolute imports for cross-module dependencies

### State Management

- Use stores for global state that needs to be shared between components
- Use React's local state for component-specific state
- Keep API data fetching in signal hooks

### Error Handling

- Use the `Revert` class for business logic errors
- Include proper error messages in dictionaries
- Handle errors at the UI level for better user experience

### Performance Optimization

- Use SSR for initial page loads
- Implement code splitting for large applications
- Optimize images and assets for faster loading
- Use memoization for expensive calculations

---

## Troubleshooting and Common Issues

### API Connection Issues

If you encounter API connection problems:

1. Check that your backend is running (`akan start-backend`)
2. Verify environment variables in env files
3. Check network request in browser developer tools
4. Ensure signal files are properly imported

### Type Errors

For TypeScript errors:

1. Run `akan typecheck` to identify issues
2. Ensure models are properly defined in constant files
3. Check import paths for correctness
4. Update generated types if necessary: `akan generate:types`

### Build Failures

If builds are failing:

1. Check console errors for specific issues
2. Verify dependencies in package.json
3. Run `akan lint` to identify code issues
4. Clear cache with `akan clear-cache`

### Component Rendering Issues

For UI rendering problems:

1. Check component props and types
2. Verify data is being loaded correctly
3. Inspect component hierarchy with React DevTools
4. Check for conditional rendering issues

---

## Further Resources

- [Official Documentation](https://docs.akanjs.com)
- [API Reference](https://docs.akanjs.com/api)
- [Example Projects](https://github.com/akanjs/examples)
- [Community Forum](https://community.akanjs.com)
- [Video Tutorials](https://youtube.com/akanjs)
