# `akanjs/client/native`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class AkanNativeError extends Error {
    readonly code: ErrorCode;
    readonly data?: unknown;
    readonly retryable: boolean;
    constructor(code: ErrorCode, message: string, options?: AkanNativeErrorOptions);
    static fromBody(body: BridgeErrorBody | undefined, cause?: unknown): AkanNativeError;
    static from(error: unknown): AkanNativeError;
    toBody(): BridgeErrorBody;
}

export interface AuthSessionApi {
    start(args: {
        url: string;
        callbackScheme: string;
        ephemeral?: boolean;
    }): Promise<{
        url: string;
    }>;
}

export interface Contact {
    id: string;
    name: null | string;
    phones: ContactPhone[];
}

export interface DeviceInfo {
    platform: Platform;
    model: string;
    manufacturer: string;
    osName: string;
    osVersion: string;
    isVirtual: boolean;
    webViewVersion: null | string;
}

export interface DirectoryFile extends PickedFile {
    path: string;
}

export interface IapProduct {
    id: string;
    type: IapProductType;
    title: string;
    description: string;
    displayPrice: string;
    price: number;
    currency: string;
    subscriptionPeriod?: IapPeriod;
    subscriptionGroupId?: string;
    introOfferEligible?: boolean;
    offers: IapOffer[];
}

export interface IapTransaction {
    id: string;
    productId: string;
    state: IapTransactionState;
    purchaseDate: number;
    quantity: number;
    originalId?: string;
    expirationDate?: number;
    revocationDate?: number;
    autoRenewing?: boolean;
    acknowledged?: boolean;
    accountId?: string;
    environment?: string;
    verified?: boolean;
    verification: IapVerification;
}

export interface LiveValue<T> {
    get(): T;
    set(value: T): void;
    subscribe(onChange: () => void): () => void;
}

export interface NativePushToken {
    token: string;
    provider: PushProvider;
    platform: "android" | "ios";
}

export interface Photo extends FileRef {
    width?: number;
    height?: number;
}

export interface PickDirectoryOptions {
    limit?: number;
    forServer?: boolean;
}

export interface PickDirectoryResult {
    name: null | string;
    files: DirectoryFile[];
    truncated: boolean;
    grant?: string;
}

export interface PickFilesOptions {
    types?: string[];
    multiple?: boolean;
    forServer?: boolean;
}

export interface PickedFile extends FileRef {
    name: string;
    grant?: string;
}

export type Plugin<Api, Events = Record<never, never>> = PluginMethods<Api> & PluginHandle<Api, Events>;

export interface Position {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: null | number;
    altitudeAccuracy: null | number;
    heading: null | number;
    speed: null | number;
    timestamp: number;
}

export interface PushAction {
    actionId: string;
    message: PushMessage;
}

export interface PushMessage {
    id?: string;
    title?: string;
    body?: string;
    data: Record<string, unknown>;
}

export type PushPermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

export interface SaveFileOptions {
    name: string;
    data?: string;
    encoding?: "base64" | "utf8";
    url?: string;
    mime?: string;
    forServer?: boolean;
}

export interface SaveFileResult {
    saved: boolean;
    name?: string;
    grant?: string;
}

export interface UpdateCheck {
    available: boolean;
    bundle: null | string;
    version: null | string;
    sequence: null | number;
    downloadSize: null | number;
}

export interface UpdateProgress {
    received: number;
    total: number;
}

export interface UpdateState {
    bundle: null | string;
    sequence: number;
    pending: null | string;
    trial: boolean;
    rolledBack: null | string;
    channel: string;
    nativeApi: null | string;
}

export interface VolumeState {
    level: null | number;
    muted: boolean;
    settable: boolean;
}

export declare const app: import("akanjs/client/native.ts").Plugin<AppApi, AppEvents>;

export declare const appState: import("akanjs/client/native.ts").Plugin<AppStateApi, AppStateEvents>;

export declare const authSession: import("akanjs/client/native.ts").Plugin<AuthSessionApi, Record<never, never>>;

export declare const browser: import("akanjs/client/native.ts").Plugin<BrowserApi, BrowserEvents>;

export declare function createLiveValue<T>(initial: T, start?: (set: (value: T) => void) => (() => void) | void, equals?: (a: T, b: T) => boolean): LiveValue<T>;

export declare function definePlugin<Api extends object, Events extends object = Record<never, never>>(id: string, options: PluginOptions<Api, Events>): Plugin<Api, Events>;

export declare function defineWebPlugin<Api, Events = Record<never, never>>(impl: WebPlugin<Api, Events>): WebPlugin<Api, Events>;

export declare const desktopPlatform: () => "linux" | "macos" | "windows" | null;

export declare const device: import("akanjs/client/native.ts").Plugin<DeviceApi, Record<never, never>>;

export declare const dialog: import("akanjs/client/native.ts").Plugin<DialogApi, Record<never, never>>;

export declare function fileBlob(file: FileRef | string, options?: FileReadOptions): Promise<Blob>;

export declare const filePicker: FilePicker;

export declare const haptics: import("akanjs/client/native.ts").Plugin<HapticsApi, Record<never, never>>;

export declare function isAkanNativeError(error: unknown, code?: ErrorCode): error is AkanNativeError;

export declare const isNativeApp: () => boolean;

export declare const isNativeShell: () => boolean;

export declare const keyboard: import("akanjs/client/native.ts").Plugin<KeyboardApi, KeyboardEvents>;

export declare const loadCamera: () => Promise<typeof import("@akanjs/native/plugins/camera")>;

export declare const loadContacts: () => Promise<typeof import("@akanjs/native/plugins/contacts")>;

export declare const loadGeolocation: () => Promise<typeof import("@akanjs/native/plugins/geolocation")>;

export declare const loadIap: () => Promise<typeof import("@akanjs/native/plugins/iap")>;

export declare function markReady(): Promise<void>;

export declare const nativePlatform: () => "android" | "ios" | null;

export declare const openExternalUrl: (url: string) => Promise<void>;

export declare const opener: import("akanjs/client/native.ts").Plugin<OpenerApi, Record<never, never>>;

export declare const preferences: import("akanjs/client/native.ts").Plugin<PreferencesApi, Record<never, never>>;

export declare const push: import("akanjs/client/native.ts").Plugin<PushApi, PushEvents>;

export declare function releaseFile(file: FileRef | string): Promise<boolean>;

export declare const secureStorage: import("akanjs/client/native.ts").Plugin<SecureStorageApi, Record<never, never>>;

export declare function shallowEqual<T extends object>(a: T, b: T): boolean;

export declare const updates: import("akanjs/client/native.ts").Plugin<UpdatesApi, UpdatesEvents>;

export declare function useLiveValue<T>(value: LiveValue<T>): T;

export declare function usePluginEvent<Events, E extends keyof Events & string>(plugin: PluginHandle<any, Events>, event: E, handler: (data: Events[E]) => void): void;

export declare function useUpdateState(): {
    state: UpdateState | null;
    refresh: () => Promise<void>;
};

export declare const volume: import("akanjs/client/native.ts").Plugin<VolumeApi, VolumeEvents>;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface ActionSheetOption {
    title: string;
    style?: ActionSheetOptionStyle;
}

type ActionSheetOptionStyle = "cancel" | "default" | "destructive";

interface ActionSheetOptions {
    title?: string;
    message?: string;
    options: ActionSheetOption[];
}

interface ActionSheetResult {
    index: number;
    cancelled: boolean;
}

interface AkanNativeErrorOptions {
    cause?: unknown;
    data?: unknown;
    retryable?: boolean;
    name?: string;
}

interface AlertOptions {
    title?: string;
    message: string;
    buttonTitle?: string;
}

interface AppApi {
    getInfo(): Promise<AppInfoResult>;
    getLaunchUrl(): Promise<{
        url: null | string;
    }>;
    exit(): Promise<void>;
    relaunch(): Promise<void>;
    minimize(): Promise<void>;
    answerBeforeQuit(args: {
        id: number;
        allow?: boolean;
    }): Promise<void>;
    setBackEnabled(args: {
        enabled: boolean;
    }): Promise<void>;
}

interface AppEvents {
    urlOpen: {
        url: string;
    };
    backButton: {
        canGoBack: boolean;
    };
    beforeQuit: {
        id: number;
        reason: QuitReason;
    };
    backProgress: {
        phase: BackProgressPhase;
        progress: number;
        swipeEdge: "left" | "right";
    };
    serverState: {
        state: "gaveUp" | "restarting" | "starting" | "stopped" | "up";
    };
}

interface AppInfoResult {
    id: string;
    name: string;
    version: string;
    build: number;
}

interface AppStateApi {
    getState(): Promise<{
        state: AppStateValue;
    }>;
}

interface AppStateEvents {
    change: {
        state: AppStateValue;
    };
    memoryWarning: {
        level: MemoryWarningLevel;
    };
}

type AppStateValue = "active" | "background" | "inactive";

type BackProgressPhase = "cancelled" | "progressed" | "started";

interface BatteryInfo {
    level: null | number;
    charging: boolean | null;
}

interface BridgeErrorBody {
    code: ErrorCode;
    message: string;
    data?: unknown;
    retryable?: boolean;
}

interface BrowserApi {
    open(args: {
        url: string;
        toolbarColor?: string;
    }): Promise<void>;
    close(): Promise<void>;
}

interface BrowserEvents {
    finished: Record<string, never>;
}

interface CallOptions {
    signal?: AbortSignal;
}

interface CameraApi {
    takePhoto(options?: TakePhotoOptions): Promise<Photo>;
    pickImages(options?: PickImagesOptions): Promise<{
        photos: Photo[];
    }>;
    saveToGallery(args: {
        url: string;
    }): Promise<void>;
    checkPermission(): Promise<{
        camera: PermissionState;
    }>;
    requestPermission(): Promise<{
        camera: PermissionState;
    }>;
}

interface ConfirmOptions {
    title?: string;
    message: string;
    okButtonTitle?: string;
    cancelButtonTitle?: string;
}

interface ConfirmResult {
    value: boolean;
}

interface ContactPhone {
    number: string;
    label: null | string;
}

interface ContactsApi {
    checkPermission(): Promise<{
        contacts: PermissionState;
    }>;
    requestPermission(): Promise<{
        contacts: PermissionState;
    }>;
    getContacts(options?: GetContactsOptions): Promise<{
        contacts: Contact[];
    }>;
}

interface DeviceApi {
    getInfo(): Promise<DeviceInfo>;
    getId(): Promise<{
        identifier: string;
    }>;
    getLanguage(): Promise<{
        tag: string;
        code: string;
    }>;
    getBattery(): Promise<BatteryInfo>;
}

interface DialogApi {
    alert(options: AlertOptions): Promise<void>;
    confirm(options: ConfirmOptions): Promise<ConfirmResult>;
    prompt(options: PromptOptions): Promise<PromptResult>;
    actionSheet(options: ActionSheetOptions): Promise<ActionSheetResult>;
}

declare const ERROR_CODES: readonly [
    "UNSUPPORTED",
    "PERMISSION_DENIED",
    "CANCELLED",
    "TIMEOUT",
    "INVALID_ARGS",
    "NOT_FOUND",
    "NOT_ALLOWED",
    "INTERNAL"
];

type Emit<T> = (data: T) => void;

type ErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

type FilePicker = Plugin<FilePickerApi>;

interface FilePickerApi {
    pickFiles(options?: PickFilesOptions): Promise<{
        files: PickedFile[];
    }>;
    saveFile(options: SaveFileOptions): Promise<SaveFileResult>;
    pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult>;
}

interface FileReadOptions {
    chunkSize?: number;
    signal?: AbortSignal;
}

interface FileRef {
    url: string;
    mime: string;
    size: number;
}

interface GeolocationApi {
    getCurrentPosition(options?: PositionOptions): Promise<Position>;
    checkPermission(): Promise<LocationPermission>;
    requestPermission(): Promise<LocationPermission>;
}

interface GeolocationError {
    code: ErrorCode;
    message: string;
}

interface GeolocationEvents {
    position: Position;
    highAccuracyPosition: Position;
    error: GeolocationError;
}

interface GeolocationState {
    position: Position | null;
    error: AkanNativeError | null;
}

interface GetContactsOptions {
    projection?: {
        name?: boolean;
        phones?: boolean;
    };
}

interface HapticsApi {
    impact(options?: {
        style?: ImpactStyle;
    }): Promise<void>;
    notification(options?: {
        type?: NotificationType;
    }): Promise<void>;
    selection(): Promise<void>;
    vibrate(options?: {
        duration?: number;
    }): Promise<void>;
}

interface IapApi {
    canMakePayments(): Promise<{
        value: boolean;
    }>;
    getProducts(args: IapGetProductsArgs): Promise<IapGetProductsResult>;
    purchase(args: IapPurchaseArgs): Promise<IapPurchaseResult>;
    finish(args: IapFinishArgs): Promise<void>;
    getUnfinished(): Promise<IapTransactionsResult>;
    getEntitlements(): Promise<IapTransactionsResult>;
    restore(): Promise<IapTransactionsResult>;
    manageSubscriptions(args: {
        productId?: string;
    }): Promise<void>;
}

interface IapEvents {
    transaction: IapTransaction;
}

interface IapFinishArgs {
    transactionId: string;
    consume?: boolean;
}

interface IapGetProductsArgs {
    ids: string[];
    type?: "inapp" | "subs";
}

interface IapGetProductsResult {
    products: IapProduct[];
    invalidIds: string[];
}

interface IapOffer {
    kind: IapOfferKind;
    token?: string;
    id?: string;
    basePlanId?: string;
    tags?: string[];
    phases: IapPricingPhase[];
}

type IapOfferKind = "base" | "introductory" | "oneTime" | "promotional" | "winBack";

type IapPaymentMode = "freeTrial" | "payAsYouGo" | "payUpFront" | "recurring";

interface IapPeriod {
    unit: IapPeriodUnit;
    value: number;
}

type IapPeriodUnit = "day" | "month" | "week" | "year";

interface IapPricingPhase {
    displayPrice: string;
    price: number;
    currency: string;
    period?: IapPeriod;
    cycles: number;
    mode: IapPaymentMode;
}

type IapProductType = "consumable" | "nonConsumable" | "nonRenewingSubscription" | "oneTime" | "subscription";

interface IapPromotionalOffer {
    offerId: string;
    jws: string;
}

interface IapPurchaseArgs {
    productId: string;
    offerToken?: string;
    promotionalOffer?: IapPromotionalOffer;
    accountId?: string;
    quantity?: number;
}

interface IapPurchaseResult {
    status: IapPurchaseStatus;
    transaction?: IapTransaction;
}

type IapPurchaseStatus = "pending" | "purchased";

type IapTransactionState = "pending" | "purchased" | "revoked";

interface IapTransactionsResult {
    transactions: IapTransaction[];
}

interface IapVerification {
    jws?: string;
    transactionId?: string;
    originalTransactionId?: string;
    appReceipt?: string;
    purchaseToken?: string;
    orderId?: string;
    packageName?: string;
    originalJson?: string;
    signature?: string;
}

type ImpactStyle = "heavy" | "light" | "medium" | "rigid" | "soft";

type Implementation = "native" | "none" | "web";

interface KeyboardApi {
    getState(): Promise<KeyboardState>;
    hide(): Promise<void>;
    setResizeMode(args: {
        mode: KeyboardResizeMode;
    }): Promise<void>;
}

interface KeyboardEvents {
    change: KeyboardState;
    willShow: KeyboardTransition;
    didShow: KeyboardTransition;
    willHide: KeyboardTransition;
    didHide: KeyboardTransition;
}

type KeyboardResizeMode = "none" | "resize";

interface KeyboardState {
    visible: boolean;
    height: number;
}

interface KeyboardTransition {
    height: number;
    duration: number;
}

interface ListenOptions {
    signal?: AbortSignal;
    once?: boolean;
}

interface LocationPermission {
    location: PermissionState;
    precise: boolean | null;
}

type MemoryWarningLevel = "critical" | "moderate";

type NotificationType = "error" | "success" | "warning";

interface OpenerApi {
    openUrl(args: {
        url: string;
    }): Promise<void>;
    canOpenUrl(args: {
        url: string;
    }): Promise<{
        value: boolean;
    }>;
    openSettings(): Promise<void>;
}

// ../../../../../pkgs/@akanjs/native/plugins/camera/src/index
type PermissionState = "denied" | "granted" | "prompt";

// ../../../../../pkgs/@akanjs/native/plugins/contacts/src/index
type PermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

// ../../../../../pkgs/@akanjs/native/plugins/geolocation/src/index
type PermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

interface PickImagesOptions {
    limit?: number;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
}

type Platform = "android" | "ios" | "linux" | "macos" | "web" | "windows";

interface PluginHandle<Api, Events> {
    readonly id: string;
    readonly methods: readonly (keyof Api & string)[];
    readonly events: readonly (keyof Events & string)[];
    implementation(method: keyof Api & string): Implementation;
    isSupported(method: keyof Api & string): boolean;
    isAllowed(method: keyof Api & string): boolean;
    eventImplementation(event: keyof Events & string): Implementation;
    listen<E extends keyof Events & string>(event: E, listener: (data: Events[E]) => void, options?: ListenOptions): Unsubscribe;
}

type PluginMethods<Api> = {
    [K in keyof Api]: Api[K] & WithOptions<Api[K]>;
};

interface PluginOptions<Api, Events> {
    methods: readonly (keyof Api & string)[];
    events?: readonly (keyof Events & string)[];
    web?: WebPlugin<Api, Events>;
}

interface PositionOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
}

interface PreferencesApi {
    get(args: {
        key: string;
    }): Promise<{
        value: null | string;
    }>;
    set(args: {
        key: string;
        value: string;
    }): Promise<void>;
    remove(args: {
        key: string;
    }): Promise<void>;
    keys(): Promise<{
        keys: string[];
    }>;
    clear(): Promise<void>;
}

interface PromptOptions extends ConfirmOptions {
    inputPlaceholder?: string;
    inputText?: string;
}

interface PromptResult {
    value: string;
    cancelled: boolean;
}

interface PushApi {
    checkPermission(): Promise<{
        display: PushPermissionState;
    }>;
    requestPermission(): Promise<{
        display: PushPermissionState;
    }>;
    register(): Promise<PushToken>;
    unregister(): Promise<void>;
    setForegroundPresentation(args: PushPresentation): Promise<void>;
}

interface PushEvents {
    token: PushToken;
    received: PushMessage;
    action: PushAction;
}

interface PushPresentation {
    banner?: boolean;
    list?: boolean;
    sound?: boolean;
    badge?: boolean;
    except?: PushPresentationExcept;
}

interface PushPresentationExcept {
    key: string;
    values: string[];
}

type PushProvider = "apns" | "fcm";

type QuitReason = "lastWindowClosed" | "session" | "user";

interface SecureStorageApi {
    get(args: {
        key: string;
    }): Promise<{
        value: null | string;
    }>;
    set(args: {
        key: string;
        value: string;
    }): Promise<void>;
    remove(args: {
        key: string;
    }): Promise<void>;
    keys(): Promise<{
        keys: string[];
    }>;
    clear(): Promise<void>;
}

interface TakePhotoOptions {
    source?: "camera" | "library";
    direction?: "front" | "rear";
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
}

type Unsubscribe = () => void;

interface UpdatesApi {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateCheck>;
    download(): Promise<{
        bundle: string;
    }>;
    apply(): Promise<void>;
    notifyReady(): Promise<void>;
    reset(): Promise<void>;
    setChannel(args: {
        channel: null | string;
    }): Promise<void>;
}

interface UpdatesEvents {
    progress: UpdateProgress;
}

interface UseCamera {
    supported: boolean;
    photo: Photo | null;
    pending: boolean;
    error: AkanNativeError | null;
    takePhoto(options?: TakePhotoOptions): Promise<Photo | null>;
}

interface VolumeApi {
    getVolume(): Promise<VolumeState>;
    setVolume(args: {
        level: number;
    }): Promise<VolumeState>;
    setMuted(args: {
        muted: boolean;
    }): Promise<VolumeState>;
}

interface VolumeEvents {
    change: VolumeState;
}

interface WatchOptions {
    enableHighAccuracy?: boolean;
    onError?: (error: AkanNativeError) => void;
}

interface WebPlugin<Api, Events> {
    methods: {
        [K in keyof Api]?: Api[K];
    };
    events?: {
        [E in keyof Events]?: (emit: Emit<Events[E]>) => Unsubscribe;
    };
}

type WithOptions<F> = F extends (...args: infer P) => infer R ? (...args: P extends [
] ? [
    args: undefined,
    options: CallOptions
] : [
    ...P,
    options: CallOptions
]) => R : never;

declare const camera: import("akanjs/client/native.ts").Plugin<CameraApi, Record<never, never>>;

declare const contacts: import("akanjs/client/native.ts").Plugin<ContactsApi, Record<never, never>>;

declare const geolocation: import("akanjs/client/native.ts").Plugin<GeolocationApi, GeolocationEvents>;

declare const iap: import("akanjs/client/native.ts").Plugin<IapApi, IapEvents>;

declare function useCamera(): UseCamera;

declare function useGeolocation(options?: {
    enableHighAccuracy?: boolean;
}): GeolocationState;

declare function useIapTransaction(handler: (transaction: IapTransaction) => void): void;

declare function watchPosition(onPosition: (position: Position) => void, options?: WatchOptions): () => void;
```
