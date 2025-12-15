# Database Module in Akan.js

## Purpose of Database Modules

Database modules in Akan.js provide a structured approach to building domain-specific features with seamless integration between server and client:

1. **Domain Encapsulation**: Encapsulate all domain-specific logic (models, services, signals) in a consistent structure
2. **Full-Stack Integration**: Enable seamless integration between MongoDB, NestJS server, and React client
3. **Type Safety**: Ensure type safety across the entire stack with auto-generated GraphQL types
4. **Automated CRUD**: Provide automatic CRUD operations through standardized patterns
5. **Real-time Capabilities**: Support for websockets, GraphQL subscriptions, and background processing
6. **Security**: Implement role-based access control and validation at every level

## File Structure and Location Conventions

A complete database module follows this structure:

```
libs/shared/lib/[module-name]/
├── [ModuleName].Template.tsx      // Form components
├── [ModuleName].Unit.tsx          // Card/list view components
├── [ModuleName].Util.tsx          // Utility components (dashboard, insights)
├── [ModuleName].View.tsx          // Single item view components
├── [ModuleName].Zone.tsx          // Main zone layout and routing
├── [module-name].constant.ts      // Model definitions
├── [module-name].dictionary.ts    // Translations
├── [module-name].document.ts      // Database schema
├── [module-name].service.ts       // Business logic
├── [module-name].signal.ts        // API endpoints
├── [module-name].store.ts         // Client state management
└── index.tsx                      // Module exports
```

## How to Create Database Modules

### 1. Define Model Schema (`[module-name].constant.ts`)

Start by defining your data model schema using the decorator pattern:

```typescript
import { Dayjs, dayjs, enumOf, Int } from "@akanjs/base";
import { Field, Filter, Model, sortOf, via } from "@akanjs/constant";
import { validate } from "@util/common";

// Define enums
export const UserRole = enumOf(["user", "admin"] as const);
export type UserRole = enumOf<typeof UserRole>;

// Define input model (for create/update operations)

export class UserInput {
  @Field.Prop(() => String, { validate: validate.email, type: "email", example: "user@example.com" })
  email: string;

  @Field.Secret(() => String, { nullable: true, type: "password", example: "password123" })
  password: string | null;
}

// Define object model (full data model)

export class UserObject extends via(UserInput) {
  @Field.Prop(() => [String], [{ enum: UserRole, example: ["user"] }])
  roles: (typeof UserRole.value)[];

  @Field.Prop(() => Date, { default: () => dayjs(), example: dayjs() })
  lastLoginAt: Dayjs;
}

// Define light model (client-side model with essential fields)

export class LightUser extends via(UserObject, ["email", "roles"] as const) {
  hasAccess(role: UserRole) {
    return this.roles.includes(role);
  }
}

// Define full model (server-side model with all fields)

export class User extends via(UserObject, LightUser) {}

// Define filter model (for queries)

export class UserFilter extends sortOf(User, {}) {
  @Filter.Mongo()
  byEmail(@Filter.Arg("email", () => String) email: string) {
    return { email };
  }
}
```

### 2. Implement Database Schema (`[module-name].document.ts`)

Create the MongoDB schema with document methods and middleware:

```typescript
import { dayjs } from "@akanjs/base";
import { beyond, by, Database, into, Loader, type SchemaOf } from "@akanjs/document";
import { hashPassword } from "@shared/nest";

import * as cnst from "../cnst";

// Document model with methods

export class User extends by(cnst.User) {
  addRole(role: cnst.UserRole) {
    if (!this.roles.includes(role)) this.roles = [...this.roles, role];
    return this;
  }

  updateLastLogin() {
    this.lastLoginAt = dayjs();
    return this;
  }
}

// Model with database operations

export class UserModel extends into(User, cnst.userCnst, ...user.models) {
  @Loader.ByField("email") userEmailLoader: Loader<string, User>;

  async findByEmail(email: string) {
    return this.User.findOne({ email, removedAt: { $exists: false } });
  }

  async getUserSecret(email: string) {
    return this.User.pickOne({ email, removedAt: { $exists: false } }, { roles: true, password: true });
  }
}

// Middleware for hooks and indexes

export class UserMiddleware extends beyond(UserModel, User) {
  onSchema(schema: SchemaOf<UserModel, User>) {
    // Hash password before saving
    schema.pre<User>("save", async function (next) {
      if (!this.isModified("password") || !this.password) {
        next();
        return;
      }
      const encryptedPassword = await hashPassword(this.password);
      this.password = encryptedPassword;
      next();
    });

    // Create indexes
    schema.index({ email: 1 }, { unique: true });
    schema.index({ email: "text" });
  }
}
```

### 3. Create Service (`[module-name].service.ts`)

Implement business logic in the service:

```typescript
import { DbService, Srv, Use } from "@akanjs/service";
import { Account, type Me } from "@akanjs/signal";
import { isPasswordMatch } from "@shared/nest";

import * as cnst from "../cnst";
import * as db from "../db";
import type * as option from "../option";
import type * as srv from "../srv";

export class UserService extends DbService(db.userDb) {
  @Use() protected readonly config: option.SecurityConfig;
  @Srv() protected readonly securityService: srv.util.SecurityService;

  async signin(email: string, password: string, account?: Account) {
    const userSecret = await this.userModel.getUserSecret(email);
    if (!userSecret) throw new Error("User not found");

    const matched = await isPasswordMatch(password, userSecret.password || "");
    if (!matched) throw new Error("Invalid credentials");

    const user = await this.userModel.getUser(userSecret.id);
    await user.updateLastLogin().save();

    return this.securityService.addJwt({ me: user }, account);
  }

  async addRole(userId: string, role: cnst.UserRole) {
    const user = await this.userModel.getUser(userId);
    return await user.addRole(role).save();
  }

  async createUser(data: db.UserInput) {
    const existingUser = await this.userModel.findByEmail(data.email);
    if (existingUser) throw new Error("User already exists");

    const user = await this.userModel.createUser(data);
    return await user.set({ roles: ["user"] }).save();
  }
}
```

### 4. Create Signal (`[module-name].signal.ts`)

Define GraphQL operations in the signal:

```typescript
import { ID } from "@akanjs/base";
import { Account, Arg, DbSignal, Me, Mutation, Query, resolve, Signal } from "@akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";

export class UserSignal extends DbSignal(cnst.userCnst, cnst.Srvs, {
  guards: { root: Admin, get: Query.Public, cru: Mutation.Admin },
}) {
  @Mutation.Public(() => cnst.util.AccessToken)
  async signin(
    @Arg.Body("email", () => String, { example: "user@example.com" }) email: string,
    @Arg.Body("password", () => String, { example: "password123" }) password: string,
    @Account() account: Account
  ) {
    const accessToken = await this.userService.signin(email, password, account);
    return resolve<cnst.util.AccessToken>(accessToken);
  }

  @Query.User(() => cnst.User)
  async me(@Me() me: Me) {
    const user = await this.userService.getUser(me.id);
    return resolve<cnst.User>(user);
  }

  @Mutation.Admin(() => cnst.User)
  async createUser(@Arg.Body("data", () => cnst.UserInput) data: db.UserInput) {
    const user = await this.userService.createUser(data);
    return resolve<cnst.User>(user);
  }

  @Mutation.Admin(() => cnst.User)
  async addUserRole(
    @Arg.Param("userId", () => ID) userId: string,
    @Arg.Body("role", () => String) role: cnst.UserRole
  ) {
    const user = await this.userService.addRole(userId, role);
    return resolve<cnst.User>(user);
  }
}
```

### 5. Create Store (`[module-name].store.ts`)

Implement client-side state management:

```typescript
import { StateCreator } from "zustand";
import { immer } from "zustand/middleware/immer";

import * as cnst from "../cnst";
import * as fetch from "../sig";

export interface UserState {
  users: cnst.User[];
  selectedUser?: cnst.User;
  userForm: cnst.UserInput;
}

export interface UserAction {
  setUsers: (users: cnst.User[]) => void;
  selectUser: (user?: cnst.User) => void;
  setUserForm: (form: Partial<cnst.UserInput>) => void;
  resetUserForm: () => void;
  signin: () => Promise<void>;
  createUser: () => Promise<void>;
}

export type UserStore = UserState & UserAction;

export const createUserStore: StateCreator<UserStore, [["zustand/immer", never]], [], UserStore> = immer(
  (set, get) => ({
    users: [],
    userForm: { email: "", password: null },

    setUsers: (users) =>
      set((state) => {
        state.users = users;
      }),
    selectUser: (user) =>
      set((state) => {
        state.selectedUser = user;
      }),
    setUserForm: (form) =>
      set((state) => {
        state.userForm = { ...state.userForm, ...form };
      }),
    resetUserForm: () =>
      set((state) => {
        state.userForm = { email: "", password: null };
      }),

    signin: async () => {
      const { email, password } = get().userForm;
      if (!password) return;
      await fetch.user.signin(email, password);
      get().resetUserForm();
    },

    createUser: async () => {
      const { userForm } = get();
      const user = await fetch.user.createUser({ data: userForm });
      set((state) => {
        state.users = [...state.users, user];
        state.userForm = { email: "", password: null };
      });
    },
  })
);
```

### 6. Create Dictionary (`[module-name].dictionary.ts`)

Define internationalization strings:

```typescript
export const userDict = {
  email: {
    ko: "이메일",
    en: "Email",
  },
  password: {
    ko: "비밀번호",
    en: "Password",
  },
  signin: {
    ko: "로그인",
    en: "Sign In",
  },
  user_list: {
    ko: "사용자 목록",
    en: "User List",
  },
  add_user: {
    ko: "사용자 추가",
    en: "Add User",
  },
};
```

### 7. Create UI Components

#### Template Component (`[ModuleName].Template.tsx`)

```tsx
import { Button } from "@akanjs/ui";

import { dict } from "../dict";
import { st } from "../st";

export const General = () => {
  const { userForm } = st.use.userForm();

  return (
    // WIP
  );
};
```

#### Unit Component (`[ModuleName].Unit.tsx`)

```tsx
import { Card, ModelProps } from "@util/ui";

export const UserCard = ({ user }: ModelProps<"user">) => (
  <Card>
    <Card.Title>{user.email}</Card.Title>
    <Card.Content>
      <div>Roles: {user.roles.join(", ")}</div>
    </Card.Content>
  </Card>
);
```

#### View Component (`[ModuleName].View.tsx`)

```tsx
import { useEffect } from "react";
import { Container, ListContainer } from "@util/ui";

import * as Unit from "./User.Unit";
import * as Template from "./User.Template";
import { st } from "../st";
import { sig } from "../sig";

export const List = () => {
  const { users } = st.use.user();

  useEffect(() => {
    void sig.user.getUsers().then((data) => {
      st.do.user().setUsers(data.users);
    });
  }, []);

  return (
    <Container>
      <ListContainer items={users} renderItem={(user) => <Unit.UserCard user={user} />} emptyText="No users found" />
    </Container>
  );
};
```

#### Zone Component (`[ModuleName].Zone.tsx`)

```tsx
import { Zone } from "@util/ui";

import * as View from "./User.View";
import * as Template from "./User.Template";
import { dict } from "../dict";

export const User = () => (
  <Zone title={dict.user.user_list}>
    <Zone.Section title={dict.user.add_user}>
      <Template.General />
    </Zone.Section>
    <Zone.Section>
      <View.List />
    </Zone.Section>
  </Zone>
);
```

#### Client Exports (`index.tsx`)

```tsx
import { Signal } from "@akanjs/ui";
import { FaUser } from "react-icons/fa";

import * as Template from "./User.Template";
import * as Unit from "./User.Unit";
import * as Util from "./User.Util";
import * as View from "./User.View";
import * as Zone from "./User.Zone";

export const User = {
  Menu: {
    User: {
      key: "user",
      label: "Users",
      icon: <FaUser />,
      render: () => <Zone.User />,
    },
  },
  Template,
  Unit,
  Util,
  View,
  Zone,
};
```

## How to Use Database Modules in Nest.js Server

### 1. Register Module in Server Bootstrap

In your server bootstrap file:

```typescript
import { createNestApp } from "@akanjs/server";

====== outdated, ned to be rewrited ======
```

### 2. Using Services in Controllers or Other Services

```typescript
import { Controller, Get } from "@nestjs/common";
import { UserService } from "./user/user.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly userService: UserService) {}

  @Get("users")
  async getUsers() {
    return this.userService.getUsers({});
  }
}
```

## How to Use Components, Stores, and Signals in Client Side

### 1. Using Components in Pages

```tsx
import { User } from "@shared/lib/user";

export default function UserPage() {
  return (
    <main>
      <User.Zone.User />
    </main>
  );
}
```

### 2. Using Stores for State Management

```tsx
import { st } from "@shared/client";

const UserComponent = () => {
  const { users, selectedUser } = st.use.user();
  const { selectUser, setUsers } = st.do.user();

  // Use the store state and actions
  return (
    <div>
      {users.map((user) => (
        <div key={user.id} onClick={() => selectUser(user)} className={selectedUser?.id === user.id ? "selected" : ""}>
          {user.email}
        </div>
      ))}
    </div>
  );
};
```

### 3. Using Signals for API Calls

```tsx
import { useEffect, useState } from "react";
import { sig } from "@shared/client";

const UserData = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    sig.user
      .getUsers()
      .then((data) => {
        st.do.user().setUsers(data.users);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return <User.View.List />;
};
```

### 4. Integrating with Menu System

```tsx
import { AppLayout } from "@util/ui";
import { User } from "@shared/lib/user";
import { Admin } from "@shared/lib/admin";

export const Layout = () => (
  <AppLayout
    pageMenus={[
      {
        key: "users",
        title: "User Management",
        menus: User.Menu,
      },
      {
        key: "admin",
        title: "Administration",
        menus: Admin.Menu,
      },
    ]}
  />
);
```

## Best Practices

1. **Naming Conventions**

   - Use PascalCase for classes and components (e.g., `UserService`, `User.Unit.tsx`)
   - Use camelCase for files (e.g., `user.service.ts`, `user.document.ts`)

2. **Security**

   - Use `@Field.Secret` for sensitive data like passwords
   - Apply proper permission guards to queries and mutations (`@Query.Admin`, `@Mutation.Public`)
   - Validate input data using the `validate` option in `@Field.Prop`

3. **Code Organization**

   - Keep business logic in service files
   - Use signals for API calls only, not for business logic
   - Define reusable utility methods in document models

4. **Performance**

   - Use dataloader pattern (`@Loader.ByField`) for efficient database access
   - Create proper indexes in the middleware
   - Use projections to limit returned fields when appropriate

5. **Testing**

   - Create signal tests for each API endpoint
   - Mock services for unit testing signals
   - Use integration tests for testing complex workflows

6. **UI Components**

   - Follow the separation between Template, Unit, View, and Zone components
   - Make components reusable across different parts of the application
   - Use dictionary files for all UI text to support internationalization

7. **Real-time Features**
   - Use GraphQL subscriptions for real-time updates
   - Use WebSockets for bidirectional communication
   - Use Bull queues for background processing

## Data Flow in Database Modules

1. **User Interaction** → User interacts with a component (e.g., submits a form)
2. **Store Action** → Action in store is triggered (e.g., `st.do.user().signin()`)
3. **Signal Call** → Signal method is called (e.g., `sig.user.signin()`)
4. **GraphQL Request** → GraphQL request is sent to the server
5. **Resolver** → NestJS resolver (generated from Signal) handles the request
6. **Service** → Service method processes the business logic
7. **Database** → Database operations are performed
8. **Response** → Result is returned through the GraphQL API
9. **Store Update** → Client state is updated based on the response
10. **UI Update** → Components re-render with the updated state
