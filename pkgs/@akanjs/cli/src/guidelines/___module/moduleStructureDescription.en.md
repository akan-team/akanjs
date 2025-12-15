# Module Structure Description

The project follows a modular architecture with clear separation of concerns. Each module in lib/<model>/ represents a domain
entity with a standardized file structure that promotes consistency and maintainability.

## Core Components

### <Model>.View.tsx

- Core Purpose: Presentation-only components that render data
- Execution Context: Works as a server component
- State Management: Does not manage internal state
- Data Handling: Accepts model data as props and displays it according to specific layouts
- Primary Focus: Focuses purely on how data looks to the user
- Model Usage: Only uses the full model
- Interaction Restrictions: No click events or other interaction events
- Interaction Extension: If interaction is needed, wrap with <Model>.Zone.tsx component
- Navigation: Link component can be used for navigation purposes
- Full Model Rendering: Implements complete rendering of the entire model data structure, ensuring all properties and relationships within the model are displayed rather than selecting only partial attributes

### <Model>.Template.tsx

Reusable layout patterns with integrated state management. It works as a client component, These components provide consistent UI patterns and handle data
binding, often using store hooks to access application state.

### <Model>.Unit.tsx

- Single Component Export: Each file exports one Card component for displaying model data
- Server-Side Rendered: React Server Components without "use client" directive
- Type-Safe Props: Uses ModelProps<"modelName", cnst.LightModel> interface
- Optional Navigation: useable Link component for navigation in util/ui
- Tailwind Styling: Universal use of Tailwind CSS with DaisyUI classes
- Model Data Display: Direct access to typed model properties and methods

### <Model>.Zone.tsx

Top-level container components that orchestrate other components. It works as a client component, They compose views, templates, and units into complete UI
sections while managing data flow to child components.

### <Model>.Util.tsx

Specialized components and utility functions specific to a model, It works as a client component, providing both UI components and helper functions for
model-specific functionality.

## Data Management

### <model>.signal.ts

Defines API endpoints with type safety using decorators for GraphQL queries and mutations, creating a type-safe bridge between
frontend and backend.

### <model>.store.ts

Manages client-side state with typed actions and state, handling UI state, form state, and cached data.

### <model>.service.ts

Implements server-side business logic with dependency injection, handling data processing and complex operations.

### <model>.constant.ts

Defines type definitions and model schemas using decorators to structure model fields, validation, and relationships.

### <model>.dictionary.ts

Provides internationalization and label definitions for model properties and operations.

### <model>.document.ts

Defines database schema and model operations with decorators for database interaction.

## Data Flow

The architecture follows a clear data flow pattern:

- Server-side: Document → Service → Signal → API
- Client-side: API → Store → Components (Zone → Template/View/Unit)

This modular structure enables rapid development while maintaining consistency, type safety, and testability throughout the
application.
