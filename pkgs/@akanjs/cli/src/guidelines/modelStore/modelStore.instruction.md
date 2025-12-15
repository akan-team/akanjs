# Model Store Implementation Guide

## Purpose and Role of model.store.ts

The `model.store.ts` file is a crucial component in the Akan.js framework that serves as the state management layer connecting your UI components with GraphQL operations. Built on Zustand, model stores provide:

1. **Centralized State Management**: Single source of truth for model data
2. **GraphQL Integration**: Automatic CRUD operations with backend services
3. **Form Handling**: Comprehensive form state, validation, and submission
4. **Reactive UI Updates**: Optimized re-rendering through selectors
5. **Business Logic**: Centralized place for domain-specific operations
6. **Sliced Data Access**: Contextual data lists with pagination, filtering, and sorting

## Store Architecture Overview

Model stores follow a consistent architecture pattern:

```
┌─────────────────┐     ┌─────────────────┐    ┌─────────────────┐
│  model.store.ts │ ←── │    fetch.ts     │ ←─ │  model.signal.ts│
│  (Zustand)      │     │  (GraphQL API)  │    │  (Backend API)  │
└────────┬────────┘     └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│    st.ts        │ ──→ │   Components    │
│(Store Registry) │     │   (React/UI)    │
└─────────────────┘     └─────────────────┘
```

## Basic Store Implementation

### Store Structure

```typescript
import { stateOf, Store } from "@akanjs/store";
import * as cnst from "../cnst";
import { fetch } from "../sig";

export class ProductStore extends stateOf(fetch.productGql, {
  // Custom state properties
  featuredProducts: [] as cnst.LightProduct[],
  viewMode: "grid" as "grid" | "list",
}) {
  // Custom actions
  async featureProduct(id: string) {
    const product = await fetch.featureProduct(id);
    this.set({
      featuredProducts: [...this.get().featuredProducts, product],
    });
  }
}
```

### Core Components

1. **`@Store` Decorator**: Registers the store class with metadata
2. **`stateOf` Function**: Creates the base store with generated state and actions
3. **Custom State**: Additional state properties specific to your model
4. **Custom Actions**: Business logic methods for model operations

## State Management

### Base State (Automatically Generated)

Each store automatically creates the following state properties:

```typescript
// Standard state properties
{
  model: null,               // Current active model instance
  modelList: [],             // Main list of models
  modelForm: {},             // Form state for create/update
  modelLoading: false,       // Loading state for current model
  modelListLoading: false,   // Loading state for model list
  modelFormLoading: false,   // Loading state for form submission
  modelTotal: 0,             // Total count of models
  modelPage: 1,              // Current page number
  modelLimit: 20,            // Items per page
  modelSort: "createdAt",    // Current sort field
  modelQuery: {},            // Query arguments for filtering
}
```

### Custom State

Add custom state properties in the second parameter of `stateOf`:

```typescript
extends stateOf(fetch.productGql, {
  // UI state
  productViewMode: "grid" as "grid" | "list",
  selectedProductIds: [] as string[],

  // Business state
  featuredProducts: [] as cnst.LightProduct[],
  productAnalytics: null as ProductAnalytics | null,

  // Complex state
  productCategoryMap: new Map<string, cnst.ProductCategory[]>(),
})
```

### Accessing State

In your store actions, use these methods to access state:

```typescript
// Get the entire state
const state = this.get();

// Get specific properties
const { productList, selectedProductIds } = this.pick("productList", "selectedProductIds");

// Set state (triggers UI updates)
this.set({ productViewMode: "list" });
```

## Store Actions

### Core Actions (Automatically Generated)

Each store comes with standard CRUD operations:

```typescript
// Core model actions
st.do.createModel(); // Create a new model
st.do.updateModel(); // Update an existing model
st.do.removeModel(); // Delete a model
st.do.getModel(); // Get a single model by ID
st.do.listModel(); // Get a list of models

// Initialization
st.do.initModel(); // Initialize the store
st.do.refreshModel(); // Refresh data

// Pagination/Sorting
st.do.setPageOfModel(); // Change page number
st.do.setLimitOfModel(); // Change items per page
st.do.setSortOfModel(); // Change sort field
st.do.setQueryArgsOfModel(); // Set filter query arguments

// Form management
st.do.setFieldOnModel(); // Set a form field
st.do.addFieldOnModel(); // Add to an array field
st.do.submitModel(); // Submit the form
st.do.checkModelSubmitable(); // Check form validity
```

### Custom Actions

Define custom business logic by adding methods to your store class:

```typescript
// Basic custom action
async archiveProduct(id: string) {
  const product = await fetch.archiveProduct(id);
  this.setProduct(product);
}

// Action with loading state
async generateProductReport(id: string) {
  this.set({ productReportLoading: true });
  try {
    const report = await fetch.generateProductReport(id);
    this.set({ productReport: report });
  } finally {
    this.set({ productReportLoading: false });
  }
}

// Action with notification
@Toast({ root: "product" })
async bulkUpdatePrices(percentage: number) {
  const { selectedProductIds } = this.pick("selectedProductIds");
  await fetch.updatePrices(selectedProductIds, percentage);
  this.refreshProductList();
}
```

## Using Slices for List Operations

Slices are specialized query operations for retrieving contextual lists of data.

### Slice Definition

Slices are defined in your GraphQL fetch operations:

```typescript
// In fetch.ts
export const productGql = {
  // Basic operations
  product: (id: string) => [id],
  productList: () => [],

  // Slice operations (contextual lists)
  productListByCategory: (categoryId: string) => [categoryId],
  productListByVendor: (vendorId: string) => [vendorId],
};
```

### Slice State

Each slice automatically creates these state properties:

```typescript
{
  productListByCategory: [],               // Slice data
  productListByCategoryLoading: false,     // Loading state
  productListByCategoryTotal: 0,           // Total count
  productListByCategoryPage: 1,            // Current page
  productListByCategoryLimit: 20,          // Items per page
  productListByCategorySort: "createdAt",  // Sort field
  productListByCategoryQuery: {},          // Query args
}
```

### Using Slice State in Components

```typescript
const ProductCategoryPage = ({ categoryId }) => {
  // Initialize slice when component mounts
  useEffect(() => {
    st.do.initProductListByCategory(categoryId);
  }, [categoryId]);

  // Access slice state
  const products = st.use.productListByCategory();
  const loading = st.use.productListByCategoryLoading();
  const total = st.use.productListByCategoryTotal();

  // Pagination control
  const handlePageChange = (page: number) => {
    st.do.setPageOfProductListByCategory(page);
  };

  // Rendering
  return (
    <div>
      {loading ? (
        <Spinner />
      ) : (
        <ProductGrid products={products} />
      )}

      <Pagination
        total={total}
        onChange={handlePageChange}
      />
    </div>
  );
};
```

### Slice Actions

Each slice gets these automatically generated actions:

```typescript
// Initialize slice
st.do.initProductListByCategory(categoryId);

// Refresh slice data
st.do.refreshProductListByCategory(categoryId);

// Pagination/Sorting
st.do.setPageOfProductListByCategory(2);
st.do.setLimitOfProductListByCategory(50);
st.do.setSortOfProductListByCategory("price");

// Filtering
st.do.setQueryArgsOfProductListByCategory({
  minPrice: 100,
  inStock: true,
});
```

## Form Management

Stores provide comprehensive form handling capabilities.

### Form State Handling

```typescript
// Form initialization
useEffect(() => {
  if (productId) {
    st.do.getProduct(productId);
  } else {
    st.do.initProduct(); // Create empty form
  }
}, [productId]);

// Access form state
const productForm = st.use.productForm();
const loading = st.use.productFormLoading();
const submitable = st.use.productSubmitable();

// Form component
return (
  <Form onSubmit={st.do.submitProduct}>
    <Input
      value={productForm.name}
      onChange={(value) => st.do.setNameOnProduct(value)}
    />

    <Select
      value={productForm.category}
      onChange={(value) => st.do.setCategoryOnProduct(value)}
      options={categories}
    />

    <FileUpload
      files={productForm.images || []}
      onAdd={(files) => st.do.addImagesOnProduct(files)}
      onRemove={(index) => st.do.removeImagesOnProduct(index)}
    />

    <Button
      type="submit"
      disabled={!submitable || loading}
    >
      Save Product
    </Button>
  </Form>
);
```

### Form Submission

```typescript
// Basic submission
st.do.submitProduct();

// With callbacks
st.do.submitProduct({
  onSuccess: (product) => {
    router.push(`/products/${product.id}`);
  },
  onError: (error) => {
    console.error("Failed to save product:", error);
  },
});

// With validation
useEffect(() => {
  st.do.checkProductSubmitable();
}, [st.sel((s) => s.productForm)]);
```

## Advanced Store Patterns

### Store Composition

For complex applications, compose multiple stores:

```typescript
// In store.ts
export class RootStore extends MixStore(ProductStore, CategoryStore, VendorStore, CartStore) {}

export const storeRoot = rootStoreOf(RootStore);
```

### Cross-Store Operations

Access other stores from within a store:

```typescript
async addToCart(productId: string, quantity: number) {
  const product = await fetch.getProduct(productId);

  // Access another store
  (this as unknown as RootStore).do.addItemToCart({
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity
  });
}
```

### Optimistic Updates

Update UI before API operations complete:

```typescript
async toggleProductFavorite(id: string) {
  const { productList } = this.pick("productList");

  // Find product in list
  const index = productList.findIndex(p => p.id === id);
  if (index === -1) return;

  // Clone the list
  const newList = [...productList];

  // Optimistically update
  newList[index] = {
    ...newList[index],
    isFavorite: !newList[index].isFavorite
  };

  // Update UI immediately
  this.set({ productList: newList });

  // Perform actual API call
  try {
    await fetch.toggleProductFavorite(id);
  } catch (error) {
    // Revert on error
    this.refreshProductList();
    throw error;
  }
}
```

### Real-time Updates

Connect stores with GraphQL subscriptions:

```typescript
initProductChat(productId: string) {
  this.set({ productChatLoading: true });

  // Set up subscription
  fetch.subscribeToProductChat(productId, (message) => {
    const { productChatMessages } = this.pick("productChatMessages");
    this.set({
      productChatMessages: [...productChatMessages, message]
    });
  });

  this.set({ productChatLoading: false });
}
```

## Best Practices

1. **Naming Conventions**:

   - Use `modelList{Context}` for slice names (e.g., `productListByCategory`)
   - Use camelCase for state properties
   - Use action verbs for method names

2. **State Management**:

   - Keep UI state (loading, selected items) in the store
   - Use `this.pick()` for accessing multiple properties
   - Create new references for objects/arrays when updating

3. **Performance**:

   - Use selective subscriptions in components:
     ```typescript
     // Subscribe to specific state properties
     const name = st.use.product((s) => s.name);
     ```
   - Initialize slices only when needed
   - Clean up subscriptions when components unmount

4. **Error Handling**:

   - Use the `@Toast` decorator for user notifications
   - Always reset loading states in finally blocks
   - Implement retry logic for critical operations

5. **Testing**:

   - Mock stores with initial state for unit tests

     ```typescript
     const testStore = makeStore(
       {
         productList: [mockProduct1, mockProduct2],
       },
       ProductStore
     );

     await testStore.do.submitProduct();
     expect(testStore.get().product).toEqual(expectedProduct);
     ```

## Complete Example

```typescript
import { stateOf, Store, Toast } from "@akanjs/store";
import * as cnst from "../cnst";
import { fetch } from "../sig";
import { msg } from "../msg";

export class ProductStore extends stateOf(fetch.productGql, {
  // UI State
  productViewMode: "grid" as "grid" | "list",
  selectedProductIds: [] as string[],
  productFilterDrawerOpen: false,

  // Business State
  featuredProducts: [] as cnst.LightProduct[],
  relatedProductMap: new Map<string, cnst.LightProduct[]>(),

  // Reports
  productAnalytics: null as ProductAnalytics | null,
  productReportLoading: false,
}) {
  // Selection Management
  selectProduct(id: string) {
    const { selectedProductIds } = this.pick("selectedProductIds");
    this.set({
      selectedProductIds: [...selectedProductIds, id],
    });
  }

  deselectProduct(id: string) {
    const { selectedProductIds } = this.pick("selectedProductIds");
    this.set({
      selectedProductIds: selectedProductIds.filter((pid) => pid !== id),
    });
  }

  clearSelectedProducts() {
    this.set({ selectedProductIds: [] });
  }

  // Business Operations
  @Toast({ root: "product" })
  async featureProduct(id: string) {
    const product = await fetch.featureProduct(id);
    const { featuredProducts } = this.pick("featuredProducts");

    this.set({
      featuredProducts: [...featuredProducts, product],
    });
  }

  @Toast({ root: "product" })
  async bulkUpdatePrices(percentage: number) {
    const { selectedProductIds } = this.pick("selectedProductIds");

    if (selectedProductIds.length === 0) {
      msg.error("product.noProductsSelectedError");
      return;
    }

    await fetch.updatePrices(selectedProductIds, percentage);
    this.refreshProductList();
    this.clearSelectedProducts();
  }

  // Analytics
  async loadProductAnalytics(id: string) {
    this.set({ productReportLoading: true });

    try {
      const analytics = await fetch.getProductAnalytics(id);
      this.set({ productAnalytics: analytics });
    } catch (error) {
      msg.error("product.analyticsLoadError");
      this.set({ productAnalytics: null });
    } finally {
      this.set({ productReportLoading: false });
    }
  }

  // Related Products
  async loadRelatedProducts(id: string) {
    const { relatedProductMap } = this.pick("relatedProductMap");

    // Check cache
    if (relatedProductMap.has(id)) return;

    const relatedProducts = await fetch.getRelatedProducts(id);

    // Update map immutably
    const newMap = new Map(relatedProductMap);
    newMap.set(id, relatedProducts);

    this.set({ relatedProductMap: newMap });
  }
}
```

## File Structure Convention

Store files should follow this pattern:
`{apps,libs}/*/lib/{feature}/{feature}.store.ts`

Examples:

- `apps/commerce/lib/products/product.store.ts`
- `libs/shared/lib/auth/auth.store.ts`
