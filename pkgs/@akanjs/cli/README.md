# ⚡ Akan.js CLI

The official command-line interface for the Akan.js ecosystem, providing powerful development tools for creating, managing, and deploying modern web applications with ease.

## 🚀 Get Started

### Prerequisites

- Node.js >=23.x
- pnpm >=10.x
- docker
- (temporary) access permission to akan-team github organization

### How to create your project

```bash
npm install -g @akanjs/cli --latest
# or if you want to update, run below
# npm update -g @akanjs/cli --latest

akan create-workspace
# workspace name?
# application name?
```

### How to start your project

```bash
cd <workspace-name> && akan start <app-name> --open
```

you can navigate to default webpage

- home: http://localhost:4200

### Recipes

```bash
# set llm model
akan set-llm

# create module
akan create-module

# create scalar
akan create-scalar
```

## ✨ Features

The `@akanjs/cli` is a comprehensive development toolkit that streamlines the entire application lifecycle:

### 🏗️ **Workspace Management** (`workspace`)

Complete workspace and project management:

- **🚀 Project Initialization**
  - `create-workspace` - Create new Akan.js workspace with organization setup
  - `generate-mongo` - Generate MongoDB configuration and setup
  - `lint` / `lint-all` - Code linting with auto-fix capabilities

### 📱 **Application Lifecycle** (`application`)

Full-stack application development and deployment:

- **🔧 Application Management**

  - `create-application` - Scaffold new applications with templates
  - `remove-application` - Clean application removal
  - `sync-application` - Synchronize application dependencies

- **🏗️ Build System**

  - `build` - Complete application build
  - `build-backend` - Server-side build optimization
  - `build-frontend` - Client-side build with Next.js
  - `build-csr` - Client-side rendering build
  - `build-ios` - iOS native app compilation
  - `build-android` - Android native app compilation

- **🚀 Development Server**

  - `start` - Full-stack development server
  - `start-backend` - GraphQL backend server
  - `start-frontend` - Next.js frontend server with Turbo support
  - `start-csr` - Client-side rendering server
  - `start-ios` - iOS simulator with live reload
  - `start-android` - Android emulator with live reload

- **📦 Release Management**

  - `release-ios` - iOS App Store deployment
  - `release-android` - Google Play deployment
  - `release-source` - Source code release with versioning

- **🗄️ Database Operations**
  - `dump-database` - Database backup across environments
  - `restore-database` - Database restoration with environment selection
  - `pull-database` - Pull remote database locally
  - `dbup` / `dbdown` - Local database container management

### 📚 **Library Management** (`library`)

Modular library system for code reusability:

- **📦 Library Operations**

  - `create-library` - Create new shared libraries
  - `remove-library` - Clean library removal
  - `sync-library` - Synchronize library dependencies
  - `install-library` - Install existing libraries into workspace

- **🔄 Version Control Integration**
  - `push-library` - Push library changes to remote repository
  - `pull-library` - Pull latest library updates

### 🧩 **Module Development** (`module`)

AI-powered module generation and management:

- **🤖 Smart Module Creation**

  - `create-module` - Generate modules with AI assistance
  - `create-scalar` - Create scalar data models
  - `remove-module` - Module cleanup with dependency checks

- **🎨 Component Generation**
  - `create-view` - Generate React view components
  - `create-unit` - Create reusable unit components
  - `create-template` - Generate component templates

### 📄 **Page Generation** (`page`)

Dynamic page scaffolding:

- **📝 Page Management**
  - `create-page` - Generate Next.js pages with routing

### ☁️ **Cloud Integration** (`cloud`)

Seamless cloud services and AI integration:

- **🔐 Authentication**

  - `login` / `logout` - Cloud service authentication
  - User session and credential management

- **🤖 AI Development Assistant**

  - `set-llm` / `reset-llm` - Configure AI language models
  - `ask` - Interactive AI development assistance

- **🚀 Deployment**
  - `deploy-akan` - Deploy to Akan.js cloud infrastructure
  - `update` - Update CLI and cloud integrations

### 📦 **Package Operations** (`package`)

NPM package management and publishing:

- **🔧 Package Lifecycle**
  - Package building and optimization
  - NPM publishing with versioning
  - Dependency management

## 📖 Usage Examples

### Workspace Management

```bash
# Create new workspace
akan create-workspace "acme-corp" --app "web-app" --dir "./projects"

# Setup MongoDB for development
akan generate-mongo

# Lint entire workspace
akan lint-all --fix
```

### Application Development

```bash
# Create new application
akan create-application "mobile-app" --start

# Start full development environment
akan start web-app --open

# Build for production
akan build web-app

# Start backend only
akan start-backend web-app --open  # Opens GraphQL playground

# Build and start mobile app
akan build-ios mobile-app
akan start-ios mobile-app --open --release
```

### Library Management

```bash
# Create shared library
akan create-library "ui-components"

# Install existing library
akan install-library "util"

# Update library from remote
akan pull-library "shared" --branch main

# Push library changes (development)
akan push-library "ui-components" --branch feature/new-buttons
```

### AI-Powered Module Creation

```bash
# Create module with AI assistance
akan create-module "user-profile" \
  --description "User profile management with avatar upload" \
  --schema-description "User entity with profile fields and file relationships" \
  --ai

# Create scalar data model
akan create-scalar "address" \
  --description "Address information for users" \
  --schema-description "Street, city, country, postal code fields"

# Generate view components
akan create-view  # Interactive selection
akan create-unit  # Interactive selection
```

### Cloud & AI Integration

```bash
# Setup cloud authentication
akan login

# Configure AI assistant
akan set-llm

# Get AI development help
akan ask "How do I implement user authentication with JWT?"

# Deploy to cloud
akan deploy-akan
```

### Database Operations

```bash
# Backup production database
akan dump-database web-app --environment main

# Restore from staging to development
akan restore-database web-app --source develop --target debug

# Pull remote database locally
akan pull-database web-app --env debug --dump

# Start local database
akan dbup
```

## 🤖 AI-Powered Development

The CLI integrates advanced AI capabilities:

- **🧠 Smart Code Generation** - AI analyzes requirements and generates optimized code
- **📋 Schema Intelligence** - Automatic database schema generation from descriptions
- **🔍 Context-Aware Assistance** - AI understands your project structure for better suggestions
- **⚡ Rapid Prototyping** - Generate complete modules with business logic in seconds

## 🛠️ Advanced Features

- **🔄 Hot Reload** - Instant development feedback across all platforms
- **📱 Cross-Platform** - Build web, iOS, and Android from single codebase
- **🎯 TypeScript First** - Full TypeScript support with strict type checking
- **🌐 GraphQL Integration** - Built-in GraphQL server and client generation
- **🔐 Security Built-in** - JWT authentication, RBAC, and security best practices
- **📊 Performance Monitoring** - Built-in performance tracking and optimization
- **🧪 Testing Framework** - Integrated Jest and Playwright testing
- **📦 Micro-frontends** - Support for modular frontend architecture

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing CLI feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is part of the Akan.js ecosystem. See the main repository for license information.

## 🔗 Related Packages

- [`@akanjs/devkit`](../devkit) - Development toolkit and command infrastructure
- [`@akanjs/base`](../base) - Core foundation
- [`@akanjs/common`](../common) - Shared utilities
- [`@akanjs/nest`](../nest) - NestJS integrations
- [`@akanjs/next`](../next) - Next.js utilities

---

<p align="center">
  <strong>Built with ❤️ by the Akan.js team</strong>
</p>
