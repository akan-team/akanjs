Shared UI Library Analysis

Library Overview

The shared UI library in the akansoft project is a comprehensive React component collection designed for building data-driven
applications. It provides a complete toolkit with consistent patterns, extensive customization options, and deep integration with the
application's store system.

Key Characteristics

- Store-Centric Architecture: Deep integration with standardized store slices and naming conventions
- Type-Safe Components: Extensive TypeScript generic usage for compile-time safety
- Internationalization Ready: Built-in multi-language support throughout all components
- Responsive Design: Mobile-first approach with adaptive breakpoints
- Performance Optimized: Memoization, lazy loading, and efficient re-rendering
- Accessibility Compliant: Proper ARIA attributes and keyboard navigation
- Extensible Architecture: Plugin systems and customizable renderers
- Unidirectional Data Flow: Predictable state management patterns

Component Categories

1. Field Components (Field.tsx)

Field.tsx is a core form component library for the akansoft project, providing more than 25 specialized input fields.

## Basic Structure and Common Features

### Label Component

\`\`\`typescript
interface LabelProps {
className?: string;
label: string;
desc?: string;
unit?: string;
nullable?: boolean;
mode?: "view" | "edit";
}
\`\`\`

- Purpose: Consistent label display for all fields
- Features:
  - Help tooltip support (desc)
  - Unit display (unit)
  - Optional field display (nullable)
  - Required indicator is commented out (design decision)

## Text Input Components

### 1. Field.Text

\`\`\`typescript
interface TextProps {
label?: string;
desc?: string;
value: string | null;
onChange: (value: string) => void;
placeholder?: string;
nullable?: boolean;
disabled?: boolean;
minlength?: number; // Default: nullable ? 0 : 2
maxlength?: number; // Default: 200
transform?: (value: string) => string;
validate?: (text: string) => boolean | string;
cache?: boolean; // Form caching support
onPressEnter?: () => void;
inputStyleType?: "bordered" | "borderless" | "underline";
}
\`\`\`
Key features:

- Real-time transformation (transform)
- Automatic cache key generation: \${label}-\${desc}-text
- Length validation and custom validation
- Various input styles supported

### 2. Field.TextArea

\`\`\`typescript
interface TextAreaProps {
// Same basic props as Text +
rows?: number; // Default: 3
maxlength?: number; // Default: 1000
}
\`\`\`
Key features:

- Multi-line text input
- Adjustable height (rows)
- Longer maximum length than Text

### 3. Field.Price (to be deprecated)

\`\`\`typescript
interface PriceProps {
// Similar to Text but specialized for prices
maxlength?: number; // Default: 80
placeholder?: string; // Default: "~ \${l('base.priceUnit')}"
}
\`\`\`
Key features:

- Automatic removal of commas and spaces
- Automatic price unit placeholder
- Marked as "delete" in comments - legacy component

## List Management Components

### 4. Field.List

\`\`\`typescript
interface ListProps<Item> {
label?: string;
value: Item[];
onChange: (value: Item[]) => void;
onAdd: () => void;
renderItem: (item: Item, idx: number) => ReactNode;
}
\`\`\`
Key features:

- Generic type supporting all item types
- Custom rendering for each item
- Automatic delete button addition
- Automatic divider insertion

### 5. Field.TextList

\`\`\`typescript
interface TextListProps {
value: string[];
onChange: (value: string[]) => void;
minlength?: number; // Minimum array length, Default: 0
maxlength?: number; // Maximum array length, Default: 50
minTextlength?: number; // Minimum individual text length, Default: 2
maxTextlength?: number; // Maximum individual text length, Default: 200
transform?: (value: string) => string;
validate?: (text: string) => boolean | string;
cache?: boolean;
}
\`\`\`
Key features:

- Drag and drop for order changes
- Individual text input validation
- Cache key: \${label}-\${desc}-textList-[\${idx}]
- Conditional "New" button display based on maximum length limit

### 6. Field.Tags

\`\`\`typescript
interface TagsProps {
value: string[];
onChange: (value: string[]) => void;
minlength?: number; // Default: 0
maxlength?: number; // Default: 50  
 minTextlength?: number; // Default: 2
maxTextlength?: number; // Default: 10 (tags are shorter)
transform?: (value: string) => string;
validate?: (text: string) => boolean | string;
}
\`\`\`
Key features:

- Tag style UI (includes # prefix)
- Inline editing mode
- Creates additional input field when clicked
- Cancel editing with ESC key
- Complete tag addition with Enter/Blur

## Numeric Input Components

### 7. Field.Number

\`\`\`typescript
interface NumberProps {
value: number | null;
onChange: (value: number) => void;
min?: number;
max?: number;
unit?: string;
transform?: (value: number) => number;
validate?: (text: number) => boolean | string;
formatter?: (value: string) => string; // Display format
parser?: (value: string) => string; // Parsing format
cache?: boolean;
}
\`\`\`
Key features:

- Automatic number validation and min/max checks
- Customizable display format with formatter/parser
- Unit display support
- Cache key: \${label}-\${desc}-number

### 8. Field.DoubleNumber

\`\`\`typescript
interface DoubleNumberProps {
value: [number, number] | null;
onChange: (value: [number, number]) => void;
min?: [number, number] | null;
max?: [number, number] | null;
separator?: ReactNode | string; // Separator between inputs
}
\`\`\`
Key features:

- Range input (start-end values)
- Independent min/max validation for each
- Custom separator (e.g., "~", "-")
- Cache keys: \${label}-\${desc}-number-[0], \${label}-\${desc}-number-[1]

## Selection Components

### 9. Field.Switch

\`\`\`typescript
interface SwitchProps {
value: boolean;
onChange: (value: boolean) => void;
onDesc?: string; // Description when true
offDesc?: string; // Description when false
disabled?: boolean;
}
\`\`\`
Key features:

- DaisyUI toggle style
- State-specific description text
- Uses toggle-accent class

### 10. Field.ToggleSelect

\`\`\`typescript
interface ToggleSelectProps<I> {
items: { label: string; value: I }[] | readonly I[] | I[] | Enum<I>;
value: I | null;
onChange: (value: I) => void;
model?: string; // Model name for internationalization
field?: string; // Field name for internationalization
validate?: (value: I) => boolean | string;
btnClassName?: string;
}
\`\`\`
Key features:

- Button-style single selection
- Direct Enum type support
- Automatic internationalization (l.enum(model, field, item))
- Custom button styling

### 11. Field.MultiToggleSelect

\`\`\`typescript
interface MultiToggleSelectProps<I> {
items: Enum<I> | { label: string; value: I }[] | readonly I[] | I[];
value: I[];
onChange: (value: I[]) => void;
minlength?: number;
maxlength?: number;
validate?: (value: I[]) => boolean | string;
}
\`\`\`
Key features:

- Multiple selection button UI
- Minimum/maximum selection limit
- Array length validation

## Relational Data Selection Components

### 12. Field.Parent & Field.ParentId

\`\`\`typescript
interface ParentProps<T, State, Input, Full, Light, Sort, QueryArgs> {
sliceName: string; // Target slice name
value: Light | null; // Parent returns object
onChange: (value?: Light | null) => void;
initArgs?: any[]; // Initialization arguments
sortOption?: (a: Light, b: Light) => number;
renderOption: (model: Light) => ReactNode; // Option renderer
renderSelected?: (value: Light) => ReactNode; // Selected item renderer
onSearch?: (text: string) => void; // Search handler
}

interface ParentIdProps extends ParentProps {
value: string | null; // ParentId returns only ID
onChange: (id?: string | null, model?: Light | null) => void;
}
\`\`\`
Key features:

- Dynamic store slice integration
- Automatic naming convention: \${modelName}List, init\${ModelName}, etc.
- Searchable dropdown
- Lazy loading (data fetched on onOpen)
- Parent: returns full object, ParentId: returns only ID

### 13. Field.Children & Field.ChildrenId

\`\`\`typescript
interface ChildrenProps extends ParentProps {
value: Light[]; // Multiple selection
onChange: (value?: Light[] | null) => void;
}

interface ChildrenIdProps extends ChildrenProps {
value: string[]; // ID array
onChange: (value: string[]) => void;
}
\`\`\`
Key features:

- Multiple relationship selection
- Same store integration logic as Parent
- Automatic initialization (useEffect)

## Date/Time Components

### 14. Field.Date

\`\`\`typescript
interface DateProps<Nullable extends boolean> {
value: Nullable extends true ? Dayjs | null : Dayjs;
onChange: (value: Dayjs) => void;
min?: Dayjs;
max?: Dayjs;
showTime?: boolean; // datetime-local vs date
nullable?: boolean;
}
\`\`\`
Key features:

- Uses Dayjs objects
- Conditional nullable type (using TypeScript generics)
- Automatic format change based on showTime
- Uses HTML5 date/datetime-local inputs
- Includes comment about DaisyUI max value bug

### 15. Field.DateRange

\`\`\`typescript
interface DateRangeProps<Nullable extends boolean> {
from: Nullable extends true ? Dayjs | null : Dayjs;
to: Nullable extends true ? Dayjs | null : Dayjs;
onChangeFrom: (value: Dayjs) => void;
onChangeTo: (value: Dayjs) => void;
onChange?: (from: Dayjs, to: Dayjs) => void; // Optional unified handler
showTime?: boolean;
}
\`\`\`
Key features:

- Individual management of start/end dates
- Optional unified change handler
- Automatic "From"/"To" label display
- Responsive layout (vertical on mobile)

## File Upload Components

### 16. Field.Img

\`\`\`typescript
interface ImageProps {
sliceName: string; // Determines file upload API
value: cnst.File | null;
onChange: (file: cnst.File | null) => void;
styleType?: "circle" | "square"; // Default: "circle"
aspectRatio?: number[]; // Aspect ratio restriction
render?: (file: cnst.File) => ReactNode;
disabled?: boolean;
}
\`\`\`
Key features:

- Dynamic upload API: add\${capitalize(sliceName)}Files
- Upload status polling (1-second interval)
- Aspect ratio restriction support
- Circular/square preview

### 17. Field.Imgs

\`\`\`typescript
interface ImagesProps {
sliceName: string;
value: cnst.File[];
onChange: (files: cnst.File[]) => void;
minlength?: number; // Default: 1
maxlength?: number; // Default: 30
render?: (file: cnst.File) => ReactNode;
}
\`\`\`
Key features:

- Multiple image upload
- Batch polling of upload status
- Minimum/maximum file count limit
- Fixed square style

### 18. Field.File & Field.Files

\`\`\`typescript
interface FileProps {
sliceName: string;
value: cnst.File | null; // File is single
onChange: (file: cnst.File | null) => void;
render?: (file: cnst.File) => ReactNode;
}

interface FilesProps {
sliceName: string;
value: cnst.File[]; // Files is multiple
onChange: (files: cnst.File[]) => void;
minlength?: number; // Default: 1
maxlength?: number; // Default: 30
}
\`\`\`
Key features:

- Support for all file types (beyond images)
- Same upload logic as Img/Imgs
- Custom file renderer support

## Rich Text Editor

### 19. Field.Slate

\`\`\`typescript
interface SlateProps {
sliceName: string; // Determines file upload API
valuePath: string; // Store path
onChange: (value: unknown) => void;
addFile: (file: cnst.File | cnst.File[], options?) => void;
placeholder?: string;
disabled?: boolean;
editorHeight?: string;
}
\`\`\`
Key features:

- Slate.js-based rich text editor
- File drag and drop support
- Dynamic store path access
- Adjustable height

### 20. Field.Yoopta

\`\`\`typescript
interface YooptaProps {
value: JSON;
onChange: (value: JSON) => void;
readonly?: boolean;
}
\`\`\`
Key features:

- Yoopta editor integration
- JSON data format
- Read-only mode support

## Authentication and Contact Components

### 21. Field.Email

\`\`\`typescript
interface EmailProps {
value: string | null;
onChange: (value: string) => void;
placeholder?: string; // Default: "example@email.com"
minlength?: number; // Default: nullable ? 0 : 2
maxlength?: number; // Default: 80
inputStyleType?: "bordered" | "borderless" | "underline";
cache?: boolean;
}
\`\`\`
Key features:

- Automatic email format validation
- Uses Input.Email component
- Cache key: \${label}-\${desc}-email

### 22. Field.Phone

\`\`\`typescript
interface PhoneProps {
value: string | null;
onChange: (value: string) => void;
maxlength?: number; // Default: 13
transform?: (value: string) => string; // Default: formatPhone
cache?: boolean;
}
\`\`\`
Key features:

- Automatic phone number formatting (formatPhone)
- isPhoneNumber validation
- Cache key: \${label}-\${desc}-phone

### 23. Field.Password

\`\`\`typescript
interface PasswordProps {
value: string | null;
onChange: (value: string) => void;
confirmValue?: string | null; // Confirmation input
onChangeConfirm?: (value: string) => void;
showConfirm?: boolean; // Show confirmation input
minlength?: number; // Default: nullable ? 0 : 8
maxlength?: number; // Default: 20
cache?: boolean;
}
\`\`\`
Key features:

- Optional password confirmation input
- Automatic match validation
- Secure input (masking)
- Cache key: \${label}-\${desc}-password

## Geographic Location Components

### 24. Field.Coordinate

\`\`\`typescript
interface CoordinateProps {
coordinate: cnst.util.Coordinate | null;
onChange: (coordinate: cnst.util.Coordinate) => void;
mapKey: string; // Google Maps API key
mapClassName?: string;
disabled?: boolean;
}
\`\`\`
Key features:

- Google Maps integration
- Coordinate selection by clicking
- Automatic marker display (AiTwotoneEnvironment icon)
- Default zoom level 3

### 25. Field.Postcode

\`\`\`typescript
interface PostcodeProps {
kakaoKey: string; // Kakao API key
address: string | null;
onChange: ({
address: string;
addressEn: string;
zipcode: string;
coordinate: cnst.util.Coordinate;
}) => void;
}
\`\`\`
Key features:

- Daum postcode service (react-daum-postcode)
- Coordinate conversion using Kakao Maps API
- Simultaneous Korean/English address provision
- Modal address search

## Common Patterns and Features

### 1. Caching System

Most input components support form data persistence with the cache prop:
cacheKey={cache ? \`\${label}-\${desc}-\${componentType}\` : undefined}

### 2. Validation System

All components support multi-layer validation:

- Basic validation (length, type, format)
- Custom validation functions
- Internationalized error messages

### 3. Internationalization

- Labels, placeholders, error messages all use l() function
- Automatic translation for Enum types
- Multi-language error message templates

### 4. Store Integration

Relational components automatically connect to the store through naming conventions:
\`\`\`javascript
const names = {
model: modelName,
modelList: \`\${modelName}List\`,
initModel: \`init\${ModelName}\`,
};
\`\`\`

### 5. Type Safety

- Type safety ensured with TypeScript generics
- Conditional types for handling nullable properties
- Strict props interface definitions

This comprehensive field library provides a consistent user experience and developer convenience, designed to make complex form compositions simple and safe. 2. Data Components (/Data/)

Purpose: Complete data visualization and management interfaces

ListContainer

- type?: "card" | "list" - Display mode selection
- columns?: DataColumn<any>[] - Column configuration
- tools?: DataTool[] - Toolbar actions
- renderDashboard?: (props) => ReactNode - Dashboard customization
- renderItem?: (props) => ReactNode - Item renderer

CardList

- sliceName: string - Store slice identifier
- columns: DataColumn<any>[] - Data column definitions
- actions?: DataAction<Light>[] - Item actions
- renderItem: (args) => ReactNode - Card renderer
- renderLoading?: () => ReactNode - Loading state

Dashboard

- summary: { [key: string]: any } - Statistics data
- queryMap: { [key: string]: any } - Filter mappings
- columns?: string[] - Clickable statistics
- hidePresents?: boolean - Display control

3. Load Components (/Load/)

Purpose: Data loading and state management with SSR/CSR support

Page

- loader: () => Promise<Return> - Data fetching function
- render: (data: Return) => ReactNode - Content renderer
- loading?: () => ReactNode - Loading state

Edit

- edit: ClientEdit<T, Full> | Partial<Full> - Edit data
- type?: "modal" | "form" | "empty" - Display mode
- sliceName: string - Store slice
- onSubmit?: string | ((model: Full) => void) - Submit handler

Units

- init: ClientInit<T, L> - Initial data
- filter?: (item: L, idx: number) => boolean - Item filtering
- sort?: (a: L, b: L) => number - Sorting function
- renderItem?: (item: L, idx: number) => ReactNode - Item renderer
- pagination?: boolean - Pagination control

4. Model Components (/Model/)

Purpose: CRUD operations with modal and inline editing

EditModal

- sliceName: string - Store slice identifier
- id?: string - Model ID for editing
- renderTitle?: ((model: Full) => ReactNode) | string - Title customization
- onSubmit?: string | ((model: Full) => void) - Submit handler
- onCancel?: string | ((form?: any) => any) - Cancel handler

ViewModal

- id: string - Model identifier
- renderView: (model: any) => ReactNode - View content renderer
- renderAction?: (model: any) => ReactNode - Action buttons

NewWrapper

- sliceName: string - Store slice
- partial?: Partial<Full> - Default values
- modal?: string | null - Modal type

5. System Components (/System/)

Purpose: Application-level providers and system utilities

Provider (CSR)

- fonts: ReactFont[] - Font configurations
- gaTrackingId?: string - Analytics tracking
- layoutStyle?: "mobile" | "web" - Layout mode

Provider (SSR)

- fonts?: NextFont[] - Next.js font configurations

SelectLanguage

- languages?: string[] - Available languages

6. Only Components (/Only/)

Purpose: Conditional rendering based on user state and device

Admin

- roles?: cnst.AdminRole[] - Required admin roles

User

- roles?: cnst.UserRole[] - Required user roles

Show

- show?: boolean | cnst.util.Responsive[] - Show conditions

Mobile/Web

- No props - Device-based rendering

7. Editor Components (/Editor/)

Purpose: Rich text editing capabilities

Slate

- addFilesGql: (fileList: FileList, id?: string) => Promise<File[]> - File upload
- addFile: (file: cnst.File | cnst.File[], options?) => void - File management
- onChange: (value: unknown) => void - Content change handler
- defaultValue?: unknown - Initial content
- placeholder?: string - Placeholder text
- disabled?: boolean - Read-only mode

SlateContent

- content: unknown - Slate content to display

8. Property Component (Property.tsx)

Purpose: Metadata-driven property editing

- prop: string - Property name
- renderTemplate?: (form: any) => ReactNode - Custom edit renderer
- renderView?: (model: any) => ReactNode - Custom view renderer
- modelPath?: string - Model path in store

Integration Patterns

Store Integration

- Components use standardized naming conventions for store slices
- Automatic state management through slice integration
- Consistent error handling and loading states

Validation System

- Built-in validation for all field types
- Custom validation function support
- Internationalized error messages

File Management

- Integrated file upload system
- Progress tracking and status management
- Multiple file type support with preview

Responsive Behavior

- Mobile-first design approach
- Adaptive layouts based on screen size
- Touch-friendly interactions

This comprehensive UI library provides everything needed to build sophisticated data management interfaces with consistent user
experience and maintainable code architecture.
