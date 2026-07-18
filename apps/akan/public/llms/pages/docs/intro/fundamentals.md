# Fundamentals

- Source: /docs/intro/fundamentals
- Mirror: /llms/pages/docs/intro/fundamentals.md
- Section: docs
- Category: Introduction
- Priority: P0

## Headings

- Write once, deploy everywhere (#write-once-deploy-everywhere)
- Make Developer a Businessman (#make-dev-a-businessman)
- Collab cohesively (#collab-devs-cohesive)
- Who should use? (#who-should-use)

## Content

Fundamentals

Write once, deploy everywhere

Why do we need to create multiple separate projects to implement a single business?

Isn't it confusing and inefficient to describe the same business intent separately for backend, frontend, app, database, and deployment? Can't one definition flow through every surface?

Akan.js is a full-stack TypeScript framework where business definitions become the source of truth for web, app-oriented client surfaces, server runtime, data contracts, and deployment artifacts.

Write business definitions once: pages, domain modules, signals, services, stores, and UI.

Akan Runtime

Pages

File-routed web and app-oriented client surfaces.

Server

Services, signals, API traffic, realtime traffic, and background work.

Data

One convention-driven workspace produces runtime surfaces, data contracts, generated artifacts, and deployable packages.

With one type-safe business definition, Akan conventions carry your intent across pages, API contracts, services, stores, schemas, and runtime surfaces.

With this, you spend less time wrestling with platform glue and more time designing the product your customers experience. The same clarity also gives agents a predictable structure to extend.

Akan.js smooths over the following background technologies so your application can grow as one extensible system.

Web/Mobile

Testing

Deployment

Make Developer a Businessman

Akan.js helps you minimize technical plumbing and focus on expressing business logic.

Akan.js also provides built-in application features and installable libraries so proven business patterns can be reused instead of rewritten.

This is especially important in the age of agentic coding. Agents write better code when business intent has one obvious place and conventions decide where the rest should go.

Workspace (monorepo)

Akan.js is monorepo-native. A single organization can develop multiple apps and shared libraries in one repository, and app execution, production builds, library development, and package management all happen from the workspace root.

Akan Workspace

appA imports libA

appB imports libA and libB

appC imports libB

code amount

App(apps):

A deployable product surface. An app owns its pages, runtime entry, app configuration, assets, and app-specific domain code.

Common library(libs):

Reusable business and utility modules shared by multiple apps. Authentication, files, payments, notifications, chat, admin features, and domain modules can live here and be reused safely.

Application list

Individual application

Library list

Shared library

Utility library

Other specific libraries

When you run `akan create-workspace`, shared and util libraries are installed by default. These libraries are common libraries that can be used by all apps.

You can use common libraries in your created application (e.g. myapp). For example, you can use the shared library to provide admin page and file upload tool.

80:20 rule

A healthy workspace maintains a structure where 80% of the code is shared between apps, and 20% is specific to each app.

However, you don't have to force yourself to follow the rule. Just maintain the workspace with your heart, and the ratio will naturally be adjusted as you maintain it.

Workspace file structure

Apps and libraries share a predictable shape so pages, domain modules, assets, and runtime entries are easy to find.

An app runs through main.ts with AkanApp, while user-facing routes are declared under page/. Domain modules live under lib/ and can be shared from apps or libs.

Application or library code

Individual application or library

File-routed pages (apps)

Domain modules

Assets files

UI code (modularized)

App configuration (apps)

Akan runtime entry (apps)

You do not need to understand every file rule at first. Start by knowing whether you are changing a user-facing page, a business domain module, a reusable UI component, or the app runtime configuration.

Because the same conventions are repeated across the workspace, people and agents can navigate unfamiliar code without guessing the architecture from scratch.

Application or Library Anatomy

server

client

shared

Interface

Data and service

UI and state

Scalar modules

Service utilities

UI and webkit

App routes

Runtime entry

Pure shared logic

Static assets

By following file rules, an application can remain extensible and reusable as it grows. The important question is not which framework layer to fight with, but which business intent you are expressing and where that intent belongs.

For example, in password-based login, the form belongs near the page or UI component, password rules belong near the shared domain definition, and persistence or security behavior belongs in the service layer of the domain module.

Collab cohesively

Akan.js provides strict file rules so people and agents can implement features in the same shape.

This lets developers collaborate seamlessly, lets teammates take over work without a long ramp-up, and gives coding agents fewer architectural choices to guess.

The most common tasks in a workspace are 1) writing pages delivered to users and 2) writing domain modules that express business concepts. Akan gives both tasks clear conventions.

Page file convention - File-based routing

File-routed pages

Page folder

Layout component

Page component

Another page

Dynamic segment

Domain module file convention

A domain module represents one business concept: user management, orders, payments, projects, and so on. Akan keeps the business abstract, data shape, service behavior, API contract, state, and UI for that concept aligned in one predictable folder.

Feature module

Business intent

Types and schemas

Translations

Document

Business logic

API endpoints

State management

Form UI

Overview UI

Utility UI

Detail view UI

Integration UI

A domain acts like a living organism. Start with abstract.md for business intent, then keep the schema definition in constant.ts, behavior in service.ts, public contract in signal.ts, and integration UI in Zone.tsx close together. This reduces frontend-backend drift, business logic regressions, and the number of places an agent must inspect before making a change.

Who should use?

Akan is suitable for developers and teams who want to create product-level value quickly and deliver it to customers.

Live products must be maintained continuously. Akan.js provides an environment where one developer can operate multiple projects, multiple developers can collaborate as one body, and agents can contribute within the same conventions.

A framework always has trade-offs. If it is simple, it can be hard to advance. If it allows every style, collaboration becomes harder. Akan chooses convention, business focus, and product delivery.

What we focus on

✅ Abstract interfaces for representing business intent

✅ Continuous stable reflection and update of the latest trends in technology for product-level quality

✅ Consistent workflows and best practices through strict, unified rules

✅ Agent-friendly codebases where intent has one obvious place

What we not focus on

❌ Representing unnecessary technical details unrelated to business

❌ Unstable technical reflection and unnecessary optimization

❌ Allowing many equivalent ways to express the same work

Work backward

Programming is to create business value by efficiently connecting our lives and customers' lives. Define the problem, create a product-level solution quickly through Akan.js, and easily deliver it to customers!

## Code Examples

### Code

```bash
├── apps/                   # ${l.trans({ en: "Application list", ko: "애플리케이션 목록" })}
│   └── appA/               # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
│   └── appB/               # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
└── libs/                   # ${l.trans({ en: "Library list", ko: "라이브러리 목록" })}
    ├── shared/             # ${l.trans({ en: "Shared library", ko: "공통 라이브러리" })}
    ├── util/               # ${l.trans({ en: "Utility library", ko: "유틸리티 라이브러리" })}
    └── [other libs]/       # ${l.trans({ en: "Other specific libraries", ko: "기타 특화 라이브러리" })}
```

### Code

```bash
└── {apps,libs}/            # ${l.trans({ en: "Application or library code", ko: "애플리케이션 또는 라이브러리 코드" })}
    └── {appA,libA}/        # ${l.trans({ en: "Individual application or library", ko: "개별 애플리케이션 또는 라이브러리" })}
        ├── page/           # ${l.trans({ en: "File-routed pages (apps)", ko: "파일 라우팅 page (앱)" })}
        ├── lib/            # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
        ├── public/         # ${l.trans({ en: "Assets files", ko: "애셋 파일" })}
        ├── ui/             # ${l.trans({ en: "UI code (modularized)", ko: "UI 코드 (모듈화 O)" })}
        ├── akan.config.ts  # ${l.trans({ en: "App configuration (apps)", ko: "앱 설정 (앱)" })}
        └── main.ts         # ${l.trans({ en: "Akan runtime entry (apps)", ko: "Akan runtime entry (앱)" })}
```

### Code

```bash
└── apps/               # ${l.trans({ en: "Application list", ko: "애플리케이션 목록" })}
    └── appA/           # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
        └── page/       # ${l.trans({ en: "File-routed pages", ko: "파일 라우팅 page" })}
            ├── pageA/  # ${l.trans({ en: "Page folder", ko: "페이지 폴더" })}
            │   ├── _layout.tsx    # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
            │   └── _index.tsx       # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}
            └── pageB/             # ${l.trans({ en: "Another page", ko: "다른 페이지" })}
                ├── _layout.tsx    # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
                ├── _index.tsx       # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}
                └── [param]/       # ${l.trans({ en: "Dynamic segment", ko: "동적 세그먼트" })}
                    ├── _layout.tsx # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
                    └── _index.tsx  # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}
```

### Code

```bash
└── {apps,libs}/          # ${l.trans({ en: "Application or library code", ko: "애플리케이션 또는 라이브러리 코드" })}
    └── {appA,libA}/      # ${l.trans({ en: "Individual application or library", ko: "개별 애플리케이션 또는 라이브러리" })}
        └── lib/          # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
            └── moduleA/  # ${l.trans({ en: "Feature module", ko: "기능 모듈" })}
                ├── moduleA.abstract.md   # ${l.trans({ en: "Business intent", ko: "비즈니스 의도" })}
                ├── moduleA.constant.ts   # ${l.trans({ en: "Types and schemas", ko: "타입과 스키마" })}
                ├── moduleA.dictionary.ts # ${l.trans({ en: "Translations", ko: "번역" })}
                ├── moduleA.document.ts   # ${l.trans({ en: "Document", ko: "문서" })}
                ├── moduleA.service.ts    # ${l.trans({ en: "Business logic", ko: "비즈니스 로직" })}
                ├── moduleA.signal.ts     # ${l.trans({ en: "API endpoints", ko: "API 엔드포인트" })}
                ├── moduleA.store.ts      # ${l.trans({ en: "State management", ko: "상태 관리" })}
                ├── moduleA.Template.tsx  # ${l.trans({ en: "Form UI", ko: "수정/생성 UI" })}
                ├── moduleA.Unit.tsx      # ${l.trans({ en: "Overview UI", ko: "개요 UI" })}
                ├── moduleA.Util.tsx      # ${l.trans({ en: "Utility UI", ko: "유틸리티 UI" })}
                ├── moduleA.View.tsx      # ${l.trans({ en: "Detail view UI", ko: "상세 뷰 UI" })}
                └── moduleA.Zone.tsx      # ${l.trans({ en: "Integration UI", ko: "통합 UI" })}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

