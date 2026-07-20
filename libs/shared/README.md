# 🤝 Akan.js Shared Library

An official akanjs library providing comprehensive shared utilities, components, and business logic for modern web applications.

## ✨ Feature of library

The `akanjs/shared` library is a comprehensive collection of shared utilities divided into five main categories:


### 🖥️ **Server-side Utilities** (`/server`)

Backend integration utilities for NestJS applications:

- **🔐 Authentication & Security**
  - `decodeJwt()` - JWT token decoding and verification
  - `hashPassword()` - Secure password hashing with bcrypt
  - `isPasswordMatch()` - Password verification against hashes
  - `webFile` - Web standard File implementation

### 🌐 **Client-side Utilities** (`/client`)

Frontend utilities for Next.js and React applications:

- **📁 File Operations**
  - `addFileUntilActive()` - File upload with completion tracking
  - `downloadFile()` - File download from URLs
  - `downloadData()` - Data export in JSON/CSV formats

- **📝 Rich Text Processing**
  - `extractTextFromSlateJson()` - Extract plain text from Slate.js content

- **📱 Push Notifications**
  - `notification/` - App-level push notification example domain built on `usePushNotification()`

### 🎨 **UI Component Library** (`/ui`)

Comprehensive React component collection for admin interfaces:

- **📋 Form Components**
  - `Field` - Complete form field components (Text, Number, Email, Phone, Password, Date, File, Select, Textarea, etc.)
  - `Property` - Dynamic property rendering for model editing and viewing

- **📊 Data Management**
  - `Data.CardList` - Card-based data display
  - `Data.Dashboard` - Dashboard layout components
  - `Data.TableList` - Feature-rich data tables
  - `Data.Pagination` - Pagination controls
  - `Data.QueryMaker` - Dynamic query builder

- **✏️ Rich Text Editing**
  - `Editor.Slate` - Slate.js rich text editor
  - `Editor.Yoopta` - Yoopta editor integration
  - Advanced text formatting and block elements

- **🔄 Data Loading**
  - `Load.Edit` - Data editing interfaces
  - `Load.View` - Data viewing components
  - `Load.Pagination` - Paginated data loading

- **🏛️ Model Operations**
  - `Model.Edit` - Entity editing modals
  - `Model.View` - Entity viewing interfaces
  - `Model.New` - Entity creation forms
  - `Model.Remove` - Entity deletion confirmations

- **👥 Conditional Rendering**
  - `Only.Admin` - Admin-only content
  - `Only.Dev` - Development-only components
  - `Only.Mobile` - Mobile-specific UI
  - `Only.Web` - Web-specific UI

- **⚙️ System Components**
  - `System.CSR` - Client-side rendering providers
  - `System.SSR` - Server-side rendering utilities
  - `System.ThemeToggle` - Theme switching controls
  - `System.SelectLanguage` - Language selection
  - `System/Messages` - Toast notifications

### 🏢 **Core Business Logic** (`/lib`)

Complete business modules and application logic:

- **👤 User Management**
  - `user/` - User registration, authentication, profile management
  - `admin/` - Admin user management with role-based access control
  - User restrictions and access control systems

- **📁 File Management**
  - `file/` - File upload, progress tracking, and management
  - Support for multiple file types and storage backends
  - File metadata and serving capabilities

- **🔔 Communication**
  - `notification/` - Push notification system with Firebase integration
  - `banner/` - Banner and announcement management
  - Multi-channel notification delivery

- **⚙️ Configuration**
  - `setting/` - Application settings and preferences
  - `summary/` - Data summary and analytics
  - Global configuration management

- **🗃️ Data Models** (`/__scalar`)
  - `encourageInfo` - User encouragement data
  - `fileMeta` - File metadata structures
  - `externalLink` - External link management
  - `leaveInfo` - User leave/departure information
  - `notiInfo` - Notification metadata
  - `restrictInfo` - User restriction data
  - `serviceReview` - Service review and feedback

- **🔧 Core Infrastructure**
  - `cnst` - Application constants and configuration
  - `dict` - Internationalization and dictionary management
  - `fetch` - GraphQL fetch utilities and API endpoints
  - `st` - State management with Zustand stores
  - `usePage` - Page context with i18n support

## 🚀 Quick Start

### Prerequisites

- Bun.js 1.3+

### Installation

1. **Create your workspace**

```bash
bun install -g @akanjs/cli --latest
akan create-workspace
```

2. **Install the shared library**

```bash
akan install-library shared
```

3. **Update the library**

```bash
akan pull-library shared
```

## 📖 Usage Examples

### Authentication & Security

```typescript
import { hashPassword, isPasswordMatch, decodeJwt } from "@libs/shared/server";

// Password hashing
const hashedPassword = await hashPassword("userPassword123");

// Password verification
const isValid = await isPasswordMatch("userPassword123", hashedPassword);

// JWT decoding
const decoded = decodeJwt("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");
```

### File Operations

```typescript
import { downloadFile, addFileUntilActive } from "@libs/shared/client";

// Download files
await downloadFile("https://example.com/file.pdf", "document.pdf");

// Upload with progress tracking
await addFileUntilActive(fileList, {
  onProgress: (progress) => console.log(`Upload: ${progress}%`),
  onComplete: (files) => console.log("Upload complete", files),
});
```


### UI Components

```typescript
import { Field, Property } from '@shared/ui';
import { Model } from '@shared/ui';

function UserEditForm() {
  return (
    <div>
      <Field
        type="email"
        label="Email Address"
        value={email}
        onChange={setEmail}
        required
      />

      <Field
        type="phone"
        label="Phone Number"
        value={phone}
        onChange={setPhone}
      />

      <Model.Edit
        model="user"
        data={userData}
        onSave={handleSave}
      />
    </div>
  );
}
```

### Business Logic Integration

```typescript
import { userService, fileService } from "@libs/shared/lib";

// User operations
const user = await userService.findById("user-id");
await userService.updateProfile(user.id, { name: "New Name" });

// File operations
const uploadedFile = await fileService.upload(file);
const fileUrl = fileService.getUrl(uploadedFile.id);
```

## 🏗️ Architecture

The library follows a modular architecture:

```
libs/shared/
├── base/            # Core type definitions
├── nest/            # Server-side utilities
├── next/            # Client-side utilities
├── ui/              # React component library
├── lib/             # Business logic modules
└── env/             # Environment configurations
```

## 🎯 Key Features

- **🔐 Complete Authentication System** - User/admin auth with multiple verification methods
- **📁 Advanced File Management** - Upload, progress tracking, and serving capabilities
- **✏️ Rich Text Editing** - Slate.js and Yoopta editor integration
- **🔔 Notification System** - Firebase Cloud Messaging integration
- **🏛️ Admin Interface** - Comprehensive admin panel components
- **📊 Data Management** - CRUD operations, pagination, search, and export
- **🌍 Internationalization** - Multi-language support with dictionary system
- **🔄 State Management** - Zustand-based stores with reactive signals
- **📝 Advanced Forms** - Extensive form components with validation
- **🛡️ Security Features** - Password hashing, JWT handling, user restrictions

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is part of the Akan.js ecosystem. See the main repository for license information.

## 🔗 Related Libraries

- [`akanjs/base`](../../../pkgs/akanjs/base) - Core foundation
- [`akanjs/util`](../util) - Utility functions

---

<p align="center">
  <strong>Built with ❤️ by the Akan.js team</strong>
</p>
