# 🛠️ Akan.js Util Library

An official akanjs library providing comprehensive utility functions for web development.

## ✨ Feature of library

The `akanjs/util` library is a comprehensive collection of utilities divided into four main categories:

### 📱 **Common Utilities** (`/common`)

Essential utility functions for data manipulation and validation:

- **🔢 Number & String Formatting**
  - `formatNumber()` - Format numbers with locale-specific thousand separators
  - `formatPhone()` - Format phone numbers with proper delimiters
  - `pad()` - Add padding to strings or numbers
  - `shortenUnit()` - Convert large numbers to human-readable units (K, M, B)

- **✅ Validation Functions**
  - `validate.email()` - Email format validation
  - `validate.phone()` - Phone number format validation
  - `validate.ageLimit()` - Age limit verification
  - `isEmail()` - Email address validation
  - `isPhoneNumber()` - Phone number validation
  - `isIpAddress()` - IP address validation

- **🎲 Random Generation**
  - `randomCode()` - Generate random codes
  - `randomNumber()` - Generate random numbers within range
  - `randomString()` - Generate random strings
  - `weightedPick()` - Pick items based on weighted probability

- **🔄 Array & Data Manipulation**
  - `shuffle()` - Shuffle array elements
  - `trueShuffle()` - True random shuffle implementation
  - `hashColor()` - Generate consistent colors from strings
  - `replaceStart()` - Replace text from the beginning of strings

### 🖥️ **Server-side APIs** (`/server`)

Backend integration utilities for NestJS applications:

- **🔐 Security & Authentication**
  - `aesEncrypt()` / `aesDecrypt()` - AES encryption/decryption
  - `jwtSign()` / `jwtVerify()` - JWT token handling
  - `EmailApi` - Email service with SMTP support and HTML templates

- **☁️ Cloud Services Integration**
  - `PushNotificationServer` - FCM push notification transport (send/topic subscribe only)
  - `CloudflareApi` - Cloudflare service integration
  - `StorageApi` - Storage operations (S3, IPFS, Local)
  - `IpfsApi` - IPFS distributed storage

- **📡 Communication APIs**
  - `DiscordApi` - Discord bot and webhook integration
  - `PurpleApi` - Purple service integration
  - `crawler` - Web scraping utilities

- **🖼️ Media Processing**
  - `getImageAbstract()` - Extract image metadata and abstracts
  - `fileManager` - File upload, download, and management utilities

### 🎨 **UI Components** (`/ui`)

React components for modern web applications:

- **🎯 Interactive Elements**
  - `Button` - Smart button with loading/success states
  - `Modal` - Customizable modal dialogs
  - `Dropdown` - Dropdown menus and selects
  - `Menu` - Navigation and context menus
  - `Tab` - Tabbed interfaces

- **📊 Data Display**
  - `Table` - Feature-rich data tables
  - `Chart` - Chart and graph components
  - `Avatar` - User avatar with fallback support
  - `Empty` - Empty state indicators
  - `Loading` - Loading indicators and skeletons

- **📱 Mobile-First Components**
  - `BottomSheet` - Mobile bottom sheet modals
  - `SwipeCard` - Swipeable card interfaces
  - `InfiniteScroll` - Infinite scrolling lists
  - `KeyboardAvoiding` - Keyboard-aware layouts

- **🗺️ Maps & Media**
  - `MapView` - Interactive map components
  - `Image` - Optimized image component
  - `QRCode` - QR code generation and scanning
  - `PdfViewer` - PDF document viewer

- **📝 Forms & Input**
  - `Input` - Enhanced input fields
  - `CodeInput` - Code/PIN input fields
  - `DatePicker` - Date and time selection
  - `Upload` - File upload with drag & drop
  - `CropImage` - Image cropping interface

- **🎮 Advanced Features**
  - `DndKit` - Drag and drop functionality
  - `Lottie` - Lottie animation player
  - `Portal` - React portal utilities
  - `Signal` - State management signals

### 🔧 **Core Library** (`/lib`)

Essential library functions and constants:

- **📦 Core Exports**
  - `cnst` - Application constants and configuration
  - `fetch` - Enhanced fetch utilities with error handling
  - `dict` - Dictionary and localization utilities

- **🗃️ Data Models** (`/__scalar`)
  - `accessLog` - Access logging documents
  - `accessStat` - Access statistics models
  - `accessToken` - Authentication token models
  - `coordinate` - Geographical coordinate handling
  - `searchResult` - Search result data structures

- **⚙️ Internal Services**
  - `_localFile` - Local file management
  - `_search` - Search functionality
  - `_security` - Security utilities
  - `_util` - Core utility functions

## 🚀 Quick Start

### Prerequisites

- bun 1.3+

### Installation

1. **Create your workspace**

```bash
byb install -g akanjs --latest
akan create-workspace
```

2. **Install the util library**

```bash
akan install-library util
```

3. **Update the library**

```bash
akan pull-library util
```

## 📖 Usage Examples

### Common Utilities

```typescript
import { formatNumber, validate, randomString } from "@libs/util/common";

// Format numbers
formatNumber("1234567.89"); // "1,234,567.89"

// Validate data
validate.email("user@example.com"); // true
validate.phone("010-1234-5678"); // true

// Generate random data
randomString(8); // "aB3xY9mK"
```

### Server-side APIs

```typescript
import { EmailApi, PushNotificationServer, aesEncrypt } from "@libs/util/server";

// Email service
const emailApi = new EmailApi({
  address: "smtp.gmail.com",
  service: "gmail",
  auth: { user: "your-email", pass: "your-password" },
});

await emailApi.sendMail({
  to: "recipient@example.com",
  subject: "Hello",
  html: "<h1>Welcome!</h1>",
});

// Encryption
const encrypted = aesEncrypt("sensitive data", "secret-key");
```

### UI Components

```typescript
import { Button, Modal } from "akanjs/ui";
import { Avatar } from "@libs/util/ui";

function MyComponent() {
  return (
    <div>
      <Avatar src="/user.jpg" className="w-12 h-12" />
      <Button
        onClick={async () => {
          // Your async operation
          return "Success!";
        }}
      >
        Click me
      </Button>
    </div>
  );
}
```

## 🏗️ Architecture

The library follows a modular architecture:

```
libs/util/
├── common/          # Pure utility functions
├── nest/           # Server-side integrations
├── ui/             # React components
├── lib/            # Core library functions
└── env/            # Environment configurations
```

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
- [`akanjs/client`](../../../pkgs/akanjs/client) - Client-side utilities

---

<p align="center">
  <strong>Built with ❤️ by the Akan.js team</strong>
</p>
