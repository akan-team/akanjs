# `akanjs/webkit/RouteLevelBoundary.tsx`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class RouteLevelBoundary extends Component<RouteLevelBoundaryProps, RouteLevelBoundaryState> {
    state: RouteLevelBoundaryState;
    static getDerivedStateFromError(error: unknown): Partial<RouteLevelBoundaryState>;
    static getDerivedStateFromProps(props: RouteLevelBoundaryProps, state: RouteLevelBoundaryState): Partial<RouteLevelBoundaryState> | null;
    render(): Iterable<ReactNode> | Promise<Iterable<ReactNode> | bigint | boolean | import("react").ReactElement<unknown, import("react").JSXElementConstructor<any> | string> | import("react").ReactPortal | null | number | string | undefined> | bigint | boolean | import("react").JSX.Element | null | number | string | undefined;
}
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface RouteLevelBoundaryProps {
    children?: ReactNode;
}

interface RouteLevelBoundaryState {
    children?: ReactNode;
    failure: null | {
        error: unknown;
    };
}
```
