This UI kit is an internally developed UI kit within the Akan.js framework.
The libs/util/ui directory contains a comprehensive React component library designed for modern web applications.
This framework provides a complete set of production-ready, reusable UI components with consistent styling, type safety, and advanced functionality.

[Strict caution]

- Every component must be used exactly as described in the documentation.
- Do not add any additional props to the components.
- Must use the written props exactly.
- Only the components explicitly listed in the documentation are available—no additional components exist beyond those specified.

Architecture & Foundation

Core Technologies:

- Built on React 18+ with TypeScript for strict type safety
- Styled based on Tailwind CSS and DaisyUI base for a consistent design system.
- Implements modern React patterns including hooks, context providers, and portals
- Full internationalization (i18n) support for multilingual applications
- Responsive-first design with mobile optimization

Design Principles:

- Composable component architecture with predictable APIs
- Accessibility (a11y) compliance throughout
- Performance optimization with lazy loading and code splitting
- Consistent error handling and validation patterns
- Session storage integration for form state persistence

Component Categories

Core Input Components

Essential form controls with advanced validation and user experience features:

- Button - Async-aware button with automatic loading/success/error states
- Input - Comprehensive input system with real-time validation, multiple variants (Text, Password, Email, Number, Checkbox), and
  session caching
- Select - Advanced dropdown with search, multi-select, and custom rendering
- DatePicker - Date/time selection with range support and custom formatting
- CodeInput - PIN/verification code input with auto-focus management
- Upload - File upload system with drag-drop, progress tracking, image cropping, and multiple file support

Data Display Components

Components for presenting and organizing information:

- Chart - Visualization suite (Bar, Line, Pie, Doughnut) built on Chart.js
- Avatar - User profile images with intelligent fallbacks
- ChatBubble - Chat interface with message grouping and timestamps
- Empty - Customizable empty state displays
- QRCode - QR code generation with click-to-open functionality

Layout & Navigation System

Comprehensive layout framework for application structure:

- Layout - Complete layout system with Header (auto-hide), Sider (collapsible), Navbar (portal-based), BottomTab (with badges),
  and container components
- Modal/Dialog - Composable dialog system with backdrop, animations, and gesture support
- BottomSheet - Mobile-optimized bottom sheet with drag gestures
- Menu - Navigation menus with horizontal/vertical modes and submenu support
- Tab - Tabbed interfaces with lazy loading and scroll management
- ScreenNavigator - Gesture-based screen navigation with spring animations

Interactive Components

Advanced user interaction components:

- Pagination - Smart page navigation with ellipsis and responsive design
- InfiniteScroll - Automatic content loading with intersection observer
- DndKit - Drag and drop functionality with provider pattern
- Radio - Radio button groups with custom styling
- ToggleSelect - Button-based selection with single/multi-select modes
- Share - Native share API with copy fallback

Utility & Feedback Components

Supporting components for enhanced user experience:

- Loading - Comprehensive loading states (Area, Button, Input, Skeleton, Spin, ProgressBar) with animations
- Link - Adaptive navigation links with SSR/CSR compatibility
- MapView - Map integration supporting both Google Maps and Pigeon Maps with markers and overlays
- Image - Optimized image component with blur placeholders and SSR support
- Portal - Teleportation component for rendering outside component tree

Advanced Features

State Management Integration

- Context-driven architecture for complex components
- Signal-based real-time communication components
- Session storage integration for form persistence
- Theme-aware styling with automatic adaptation

Performance Optimizations

- Lazy loading support for heavy components
- Code splitting at component level
- Optimized re-rendering with React.memo patterns
- Intersection Observer for scroll-based interactions

Developer Experience

- Comprehensive TypeScript interfaces for all props
- Consistent naming conventions and API patterns
- Built-in error boundaries and fallback handling
- Extensive JSDoc documentation
- Hot reload support for development

Accessibility & Internationalization

- ARIA attributes and keyboard navigation support
- Screen reader compatibility
- RTL (right-to-left) language support
- Localized date/time formatting
- Color contrast compliance

Usage Patterns

The library follows a consistent component composition pattern where complex components are built from smaller, focused
subcomponents. For example:

- Chart.Bar, Chart.Line for different visualization types
- Dialog.Modal, Dialog.Title, Dialog.Content for composable modals
- Layout.Header, Layout.Sider, Layout.Navbar for layout construction
- Upload.File, Upload.Image, Upload.Images for different upload scenarios

This design enables maximum flexibility while maintaining consistency across the application. Components are designed to work
seamlessly together, sharing common styling patterns, validation systems, and state management approaches.

The library serves as a comprehensive foundation for building modern, accessible, and performant web applications with a focus
on developer productivity and end-user experience.

Avatar

- Displays user profile images with automatic fallback to user icon
- Props: className?: string, icon?: ReactNode, src?: string

Button

- Enhanced button with automatic loading states and error handling
- Props: onClick: (e, {onError}) => Promise<Result>, onSuccess?: (result) => void, className?, children, standard button props

Input

- Comprehensive input system with real-time validation and caching
- Props: value: string, validate: (value) => boolean | string, onChange?, nullable?, inputStyleType?: "bordered" | "borderless"
  | "underline", icon?, cacheKey?
- Variants: Input.TextArea, Input.Password, Input.Email, Input.Number, Input.Checkbox

Select

- Advanced dropdown with search and multi-select capabilities
- Props: value: T | T[], options: {label, value}[], multiple?, searchable?, onChange, onSearch?, renderOption?, renderSelected?

DatePicker

- Date/time picker with range selection support
- Props: value?: Dayjs, onChange, showTime?, format?, disabledDate?
- Variants: DatePicker.RangePicker, DatePicker.TimePicker

CodeInput

- PIN/code input with individual character boxes
- Props: maxNum: number, value: string, onChange, unitStyle?: "box" | "underline", autoComplete?

Display Components

Table

- Feature-rich data table with pagination and responsive design
- Props: columns: Column[], dataSource: any[], loading?, pagination?, onRow?, rowClassName?

Modal

- Dialog modal with backdrop and action buttons
- Props: open: boolean, onCancel, title?, action?, confirmClose?
- Variants: Modal.Window

Image

- Optimized image component with blur placeholder and SSR support
- Props: src?, file?: ProtoFile, abstractData?, alt?, standard Next.js Image props

ChatBubble

- Chat message bubble with avatar and timestamp
- Props: avatar?, hasPrev?, hasNext?, isMe?, name?, at?: Dayjs, children

Empty

- Empty state placeholder with customizable message
- Props: description?, minHeight?, children?

QRCode

- QR code generator with click-to-open functionality
- Props: href: string, className?

Layout Components

BottomSheet

- Only mobile bottom sheet with drag gestures
- Props: open: boolean, onCancel, type: "full" | "half", children

Layout
Layout - Complete layout framework with responsive design

- Layout.Header - Top header with auto-hide functionality
  - Props: className?: string, type?: "static" | "hide", children?: any, height?: number
  - Features: Auto-hide on scroll, fixed positioning
- Layout.Sider - Collapsible sidebar
  - Props: className?: string, bgClassName?: string, children?: any
  - Features: Drawer-based with toggle functionality
- Layout.Navbar - Navigation bar with portal content
  - Props: className?: string, children?: ReactNode, height?:

Menu

- Navigation menu with horizontal/vertical modes and submenu support
- Props: items: MenuItem[], mode?: "horizontal" | "inline", selectedKeys?, onClick?, inlineCollapsed?

Tab

- Tabbed interface system
  - Tab.Provider - Tab context provider
    - Props: className?: string, defaultMenu?: string | null, children?: any
  - Tab.Menu - Tab menu item
    - Props: className?: string, activeClassName?: string, disabledClassName?: string, disabled?: boolean, menu: string, children:
      any, scrollToTop?: boolean, tooltip?: string
  - Tab.Panel - Tab content panel
    - Props: className?: string, menu: string, children?: any, loading?: "eager" | "lazy" | "every"
    - Features: Lazy loading support

ScreenNavigator

- Gesture-based screen navigation
- ScreenNavigator.Provider - Navigation context provider
  - Props: setMenu?: (menu: string) => void, children: ReactNode, menus: string[]
  - Features: Gesture-based navigation, spring animations
- ScreenNavigator.Screen - Individual screen container
  - Props: children: ReactNode, className?: string
- ScreenNavigator.NavbarItem - Navigation bar item
  - Props: menu: string, children: ReactNode, className?: string

Upload

- File upload system with multiple modes
  - Upload
  - Basic file upload with drag & drop
  - Props: onChange?: (fileList: FileList) => void; multiple?: boolean; accept?: string; className?: string; uploadClassName?: string; children: React.ReactNode; disabled?: boolean;
  - Upload.File
    - Single file upload with preview
    - Props: multiple?: boolean; file: ProtoFile | null; render?: (file: ProtoFile) => React.ReactNode; onChange?: (e: File | FileList) => void | Promise<void>; onRemove?: (e: any) => void; children?: React.ReactNode; disabled?: boolean; maxCount?: number; className?: string; uploadClassName?: string; accept?: string;
  - Upload.FileList
    - Multiple files with table view and progress tracking
    - Props: multiple?: boolean; fileList: ProtoFile[]; render?: (file: ProtoFile) => React.ReactNode; onChange?: (e: File | FileList) => void | Promise<void>; onRemove?: (e: any) => void; children?: React.ReactNode; disabled?: boolean; maxCount?: number; className?: string; uploadClassName?: string; accept?: string;
  - Upload.Image
    - Image upload with integrated cropping functionality
    - Props: multiple?: boolean; file: ProtoFile | null; render?: (file: ProtoFile) => React.ReactNode; onChange?: (e: File | FileList) => void | Promise<void>; onRemove?: (e: any) => void; children?: React.ReactNode; disabled?: boolean; maxCount?: number; className?: string; uploadClassName?: string; accept?: string;
  - Upload.Images
    - Multiple image upload with gallery preview
    - Props: multiple?: boolean; fileList: ProtoFile[]; render?: (file: ProtoFile) => React.ReactNode; onChange?: (e: File | FileList) => void | Promise<void>; onRemove?: (e: any) => void; children?: React.ReactNode; disabled?: boolean; maxCount?: number; className?: string; uploadClassName?: string; accept?: string;

DndKit

- Drag and drop functionality built on @dnd-kit
  - DndKit.Provider
    - DnD context provider
    - Props: className?: string + all DndContextProps
  - DndKit.DraggableUnit
    - Draggable item wrapper
    - Props: id: string, children: ReactNode, className?: string, onClick?: () => void | Promise<void>
  - DndKit.DroppableColumn
    - Drop target column
    - Props: id: string, items: T[], className?: string, children: ReactNode, onOver?: (id, items, event) => void, onEnd?: (id,
      item, event) => void

MapView

- Map integration with multiple providers
  - MapView.Map
  - Main map container with theme awareness
  - Props: className?: string, onLoad?: () => void, onClick?: (coordinate) => void, onRightClick?: (coordinate) => void,
    onMouseMove?: (coordinate) => void, children: any
- MapView.Marker
  - Map marker component
  - Props: coordinate: cnst.Coordinate, zIndex?: number, children?: any
- MapView.Google
  - Google Maps implementation
  - Props: id?: string, className?: string, mapKey: string, onClick/onRightClick?: (coordinate) => void, center?:
    cnst.Coordinate, onChangeCenter?: (coordinate) => void, zoom?: number, onChangeZoom?: (zoom) => void, bounds?: {minLat, maxLat,
    minLng, maxLng}, onLoad?: () => void, onMouseMove?: (coordinate, event) => void, options?: google.maps.MapOptions, children: any
- MapView.Pigeon
  - Pigeon Maps implementation (lightweight alternative)
  - Props: id?: string, className?: string, onLoad?: () => void, onClick/onRightClick?: (coordinate) => void, center?:
    cnst.Coordinate, onChangeCenter?: (coordinate) => void, zoom?: number, onChangeZoom?: (zoom) => void, bounds?: {minLat, maxLat,
    minLng, maxLng}, onChangeBounds?: (bounds) => void, mouseEvents?: boolean, onMouseMove?: (coordinate) => void, mapTiler?: (x, y,
    z, dpr) => string, children?: any, zoomControlStyle?: CSSProperties

Pagination

- Page navigation with smart ellipsis and responsive design
- Props: currentPage: number, total: number, onPageSelect, itemsPerPage: number

Radio

- Radio button group with custom styling support
- Props: value, children: ReactElement[], onChange, disabled?

ToggleSelect

- Button-based selection with single/multi-select modes
- Props: items, value, validate, onChange, nullable
- Variants: ToggleSelect.Multi

Share

- Native share API with copy fallback
- Props: title: string, url: string, children

Specialized Component Groups

Chart

- Visualization components built on Chart.js and react-chartjs-2
  - Chart.Bar - Bar chart component
    - Props: data: ChartData<"bar">, options?: ChartOptions<"bar">
    - Features: Responsive layout, legend display, title configuration
  - Chart.Line - Line chart component
    - Props: data: ChartData<"line">, options?: ChartOptions<"line">
    - Features: Line-specific Chart.js configuration with curve interpolation
  - Chart.Pie - Pie chart component
    - Props: data: ChartData<"pie">, options?: ChartOptions<"pie">
    - Features: ArcElement rendering, responsive design
  - Chart.Doughnut - Doughnut chart component
    - Props: data: ChartData<"doughnut">, options?: ChartOptions<"doughnut">
    - Features: Similar to pie but with center cutout

Dialog

- Composable modal dialog system built on Radix UI
- Dialog.Provider - Dialog context provider
  - Props: className?: string, open?: boolean, defaultOpen?: boolean, children?: any
- Dialog.Modal - Main modal container
  - Props: className?: string, bodyClassName?: string, confirmClose?: boolean, children?: any, onCancel?: () => void
  - Features: Drag gestures, spring animations, responsive design, close confirmation
- Dialog.Title - Modal title component
  - Props: children?: ReactNode
- Dialog.Content - Modal content area
  - Props: className?: string, children?: ReactNode
- Dialog.Action - Modal action buttons container
  - Props: children?: ReactNode
- Dialog.Trigger - Modal trigger element

  - Props: className?: string, children?: any

    Link

    - Adaptive navigation system
      - Link
        - Main adaptive link (auto-switches between CSR/Next.js based on render mode)
        - Link.Back - Back navigation link
          - Props: className?: string, children?: any
          - Features: Browser history integration
        - Link.Close - Window close link
          - Props: Similar to Back but closes window
        - Link.CsrLink & Link.NextLink - Environment-specific implementations with active state support

Loading

- Loading states for different UI elements
  - Loading.Area - Full-screen loading overlay with animated dots
  - Loading.Button - Button loading skeleton
    - Props: className?: string, active?: boolean, style?: CSSProperties
  - Loading.Input - Input loading skeleton
  - Loading.Skeleton - Multi-line content skeleton with pulse animation
  - Loading.Spin - Custom loading spinner
    - Props: indicator?: ReactNode, isCenter?: boolean
  - Loading.ProgressBar - Animated progress bar
    - Props: className?: string, value: number, max: number
    - Features: React Spring animations

Key Framework Features

- TypeScript support with strict typing
- Responsive design with mobile-first approach
- Internationalization (i18n) integration
- Session storage caching for form inputs
- Accessibility compliance
- Consistent DaisyUI/Tailwind CSS styling
- Modern React patterns (hooks, context, providers)
- Error handling and validation systems
