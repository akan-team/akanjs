# `akanjs/common`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class AbortSignals {
    static join(signals: (AbortSignal | null | undefined)[]): {
        signal?: AbortSignal;
        dispose: () => void;
    };
    static race<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T>;
    static reasonOf(signal: AbortSignal): unknown;
    static isTimeout(signal: AbortSignal): boolean;
    static isAbort(error: unknown): boolean;
    static isAbortOf(error: unknown, callArgs: unknown[]): boolean;
}

export interface AkanChangeMap extends AkanGraph {
    since: string;
    summary: {
        [change in AkanGraphChange]: number;
    };
    unmapped: AkanChangedFile[];
}

export interface AkanChangedFile {
    file: string;
    change: AkanGraphChange;
}

export interface AkanGraph {
    version: 1;
    nodes: AkanGraphNode[];
    edges: AkanGraphEdge[];
}

export type AkanGraphChange = "added" | "changed" | "removed";

export interface AkanGraphEdge {
    from: string;
    to: string;
    kind: AkanGraphEdgeKind;
    label: null | string;
    count: number;
    at: AkanGraphLocation | null;
    change?: Exclude<AkanGraphChange, "changed">;
}

export type AkanGraphEdgeKind = "binds" | "calls" | "fetches" | "field" | "guard" | "plugs" | "uses" | "wraps";

export interface AkanGraphField {
    name: string;
    type: null | string;
    array: boolean;
    optional: boolean;
    ref: null | string;
    declaredIn: string;
    at: AkanGraphLocation;
    digest?: string;
    change?: AkanGraphChange;
}

export interface AkanGraphLocation {
    file: string;
    line: number;
    column: number;
}

export interface AkanGraphNode {
    id: string;
    kind: AkanGraphNodeKind;
    name: string;
    label: string;
    owner: null | string;
    module: null | string;
    detail: string[];
    at: AkanGraphLocation | null;
    fields?: AkanGraphField[];
    values?: string[];
    doc?: string;
    digest?: string;
    sources?: string[];
    change?: AkanGraphChange;
}

export type AkanGraphNodeKind = "action" | "adaptor" | "component" | "endpoint" | "enum" | "guard" | "internal" | "layout" | "method" | "model" | "query" | "route" | "scalar" | "slice";

export type AkanHmrPhase = "react-refresh" | "refresh-import" | null;

export interface AkanI18nConfig {
    defaultLocale: string;
    locales: string[];
    localePrefix?: AkanLocalePrefix;
}

export interface AkanI18nConfigInput {
    defaultLocale?: string;
    locales?: readonly string[];
    localePrefix?: AkanLocalePrefix;
}

export type AkanLocalePrefix = (typeof akanLocalePrefixes)[number];

export type Align = "center" | "left" | "right";

export declare class AppHosts {
    static declare(hosts: Iterable<string>): void;
    static reset(): void;
    static allows(host: string, extra?: Iterable<string>): boolean;
    static isRebindSafe(host: string): boolean;
    static nameOf(host: string): null | string;
}

export declare class Backoff {
    static delay(attempt: number, { min, max, jitter }?: BackoffPolicy): number;
}

export interface BackoffPolicy {
    min?: number;
    max?: number;
    jitter?: number;
}

export interface CodeAgentAnswer {
    keys?: string[];
    text?: string;
}

export type CodeAgentApprovalPolicy = "all" | "commands" | "never" | "writes";

export interface CodeAgentApprovalRequest {
    approvalId: string;
    toolCallId: string;
    name: string;
    summary: string;
    policy: CodeAgentApprovalPolicy;
}

export type CodeAgentBuiltinTool = "bash" | "edit" | "find" | "grep" | "ls" | "read" | "write";

export declare class CodeAgentClient {
    constructor(transport: CodeAgentTransport);
    get lastSeq(): number;
    resetSeq(): void;
    on(listener: (event: CodeAgentEvent) => void): () => boolean;
    send(command: CodeAgentCommand): Promise<unknown>;
    close(): Promise<void>;
    push(chunk: string): void;
}

export type CodeAgentCommand = {
    type: "abort";
} | {
    type: "answer";
    questionId: string;
    answer: CodeAgentAnswer;
} | {
    type: "approve";
    approvalId: string;
    approved: boolean;
} | {
    type: "compact";
    instructions?: string;
} | {
    type: "fork";
    entryId: string;
} | {
    type: "get_state";
    sinceSeq?: number;
} | {
    type: "new_session";
} | {
    type: "prompt";
    message: string;
    images?: CodeAgentImage[];
    deliverAs?: "followUp" | "steer";
} | {
    type: "set_auto_compact";
    percent?: number;
} | {
    type: "set_model";
    provider: string;
    modelId: string;
} | {
    type: "shutdown";
};

export type CodeAgentCommandType = CodeAgentCommand["type"];

export type CodeAgentEffort = "high" | "low" | "max" | "medium" | "minimal" | "off" | "xhigh";

export type CodeAgentEvent = CodeAgentEventBody & {
    seq: number;
};

export type CodeAgentEventBody = {
    type: "approval";
    request: CodeAgentApprovalRequest;
} | {
    type: "approval_resolved";
    approvalId: string;
    approved: boolean;
} | {
    type: "compaction";
    phase: "end" | "start";
    reason: "manual" | "overflow" | "threshold";
    error?: string;
    aborted?: boolean;
} | {
    type: "context";
    used: number;
    max: number | undefined;
} | {
    type: "error";
    message: string;
    fatal: boolean;
} | {
    type: "host";
    kind: string;
    id?: string;
    persist?: boolean;
    payload: unknown;
} | {
    type: "idle";
} | {
    type: "message";
    turnId: string;
    role: "assistant" | "user";
    text: string;
} | {
    type: "notice";
    level: "error" | "info" | "warning";
    message: string;
} | {
    type: "question";
    question: CodeAgentQuestion;
} | {
    type: "question_resolved";
    questionId: string;
    answer: CodeAgentAnswer;
    rendered: string;
} | {
    type: "question_skipped";
    question: CodeAgentQuestion;
    reason: "no-host";
} | {
    type: "queue";
    steering: string[];
    followUp: string[];
} | {
    type: "retry";
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    message: string;
} | {
    type: "session";
    info: CodeAgentSessionInfo;
} | {
    type: "subagent";
    agents: CodeAgentSubagent[];
} | {
    type: "text_delta";
    turnId: string;
    text: string;
} | {
    type: "thinking_delta";
    turnId: string;
    text: string;
} | {
    type: "tool_end";
    turnId: string;
    tool: CodeAgentToolSummary;
    outcome: CodeAgentToolOutcome;
    output: string;
    truncated: boolean;
} | {
    type: "tool_progress";
    turnId: string;
    toolCallId: string;
    text: string;
} | {
    type: "tool_start";
    turnId: string;
    tool: CodeAgentToolSummary;
} | {
    type: "turn_end";
    turnId: string;
    stopReason: CodeAgentStopReason;
} | {
    type: "turn_start";
    turnId: string;
};

export type CodeAgentEventType = CodeAgentEventBody["type"];

export type CodeAgentFrame = ({
    type: "event";
} & {
    event: CodeAgentEvent;
}) | CodeAgentReply;

export type CodeAgentImage = {
    data: string;
    mime: string;
} | {
    path: string;
};

export type CodeAgentInteractionMode = "await" | "suspend";

export type CodeAgentMcpAuthState = "authorized" | "none" | "required";

export interface CodeAgentMcpServerRef {
    name: string;
    transport: "http" | "stdio";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    headers?: Record<string, string>;
    oauth?: {
        clientId?: string;
        clientSecret?: string;
        scope?: string;
    };
}

export interface CodeAgentMcpStatus {
    name: string;
    transport: "http" | "stdio";
    target: string;
    tools: string[];
    error?: string;
    auth?: CodeAgentMcpAuthState;
}

export interface CodeAgentModelInfo {
    id: string;
    name: string;
    contextWindow?: number;
    current: boolean;
}

export type CodeAgentPresetName = keyof typeof codeAgentPresets;

export interface CodeAgentProfile {
    name: string;
    tools: {
        builtin: CodeAgentBuiltinTool[];
        akan: boolean;
        mcp: "off" | CodeAgentMcpServerRef[];
        subagent: CodeAgentSubagentBudget | false;
        web: {
            fetch: boolean;
            search: boolean;
        };
    };
    approval: CodeAgentApprovalPolicy;
    paths: {
        root: string;
        allow?: string[];
        deny?: string[];
    };
    session: {
        store: "file" | "memory" | "remote";
        crossSession: boolean;
    };
    interaction: {
        question: CodeAgentInteractionMode;
        approval: CodeAgentInteractionMode;
    };
    network: {
        allowHosts?: string[];
        askOutside?: string[];
        proxyBaseUrl?: string;
    };
    ui: {
        canPrompt: boolean;
    };
    limits: {
        turnMs: number;
        toolOutputBytes: number;
        contextTokens: number;
        feedback: number;
    };
    context: {
        projectFiles: boolean;
        skills: boolean;
    };
}

export interface CodeAgentProviderInfo {
    id: string;
    name: string;
    authorized: boolean;
    models: CodeAgentModelInfo[];
}

export interface CodeAgentQuestion {
    questionId: string;
    prompt: string;
    kind: "confirm" | "select" | "text";
    options?: CodeAgentQuestionOption[];
    multiSelect?: boolean;
    freeText?: boolean;
}

export interface CodeAgentQuestionOption {
    key: string;
    label: string;
    detail?: string;
    recommended?: boolean;
}

export interface CodeAgentReply {
    type: "reply";
    id: string;
    ok: boolean;
    error?: string;
    data?: unknown;
}

export interface CodeAgentRequest {
    id: string;
    command: CodeAgentCommand;
}

export interface CodeAgentSessionInfo {
    sessionId: string;
    cwd: string;
    profile: string;
    model: undefined | {
        provider: string;
        id: string;
        name: string;
    };
    tools: string[];
    contextTokens: number | undefined;
    effort: CodeAgentEffort | undefined;
    autoCompactAt: number | undefined;
    name: string | undefined;
    interaction: {
        question: CodeAgentInteractionMode;
        approval: CodeAgentInteractionMode;
    };
}

export interface CodeAgentStartOptions {
    cwd: string;
    profile: CodeAgentProfile;
    model?: {
        provider: string;
        id: string;
    };
    sessionId?: string;
}

export interface CodeAgentState {
    info: CodeAgentSessionInfo;
    streaming: boolean;
    frames?: CodeAgentEvent[];
    replayFrom: number;
}

export type CodeAgentStopReason = "aborted" | "awaiting" | "done" | "error" | "maxTurns" | "truncated";

export interface CodeAgentSubagent {
    id: string;
    kind: string;
    description: string;
    startedAt: number;
    tokens: number;
}

export interface CodeAgentSubagentBudget {
    maxDepth: number;
    maxConcurrent: number;
    budget: number;
}

export type CodeAgentToolOp = "delete" | "execute" | "list" | "other" | "read" | "search" | "write";

export type CodeAgentToolOutcome = "blocked" | "error" | "ok";

export interface CodeAgentToolSummary {
    toolCallId: string;
    name: string;
    op: CodeAgentToolOp;
    path?: string;
    title: string;
}

export interface CodeAgentTransport {
    send(line: string): Promise<void> | void;
    onLine(handler: (line: string) => void): void;
    close?(): Promise<void> | void;
}

export declare class CodeTranscript {
    get parts(): readonly CodeTranscriptPart[];
    get info(): CodeAgentSessionInfo | undefined;
    get headline(): string;
    get context(): undefined | {
        used: number;
        max: number | undefined;
    };
    get streaming(): boolean;
    get compacting(): boolean;
    get question(): CodeAgentQuestion | undefined;
    get approval(): CodeAgentApprovalRequest | undefined;
    get stopReason(): CodeAgentStopReason | undefined;
    get queue(): {
        steering: number;
        followUp: number;
    };
    get subagents(): CodeAgentSubagent[];
    get revision(): number;
    clear(): void;
    echo(text: string, images?: number): void;
    note(level: "error" | "info" | "warning", text: string): void;
    apply(event: CodeAgentEvent): void;
}

export type CodeTranscriptPart = {
    kind: "approval";
    id: string;
    request: CodeAgentApprovalRequest;
    approved?: boolean;
} | {
    kind: "assistant";
    id: string;
    text: string;
    streaming: boolean;
    truncated: boolean;
} | {
    kind: "host";
    id: string;
    hostKind: string;
    text: string;
} | {
    kind: "notice";
    id: string;
    level: "error" | "info" | "warning";
    text: string;
} | {
    kind: "question";
    id: string;
    question: CodeAgentQuestion;
    rendered?: string;
} | {
    kind: "thinking";
    id: string;
    text: string;
} | {
    kind: "tool";
    id: string;
    tool: CodeAgentToolSummary;
    outcome?: CodeAgentToolOutcome;
    output?: string;
    progress?: string;
} | {
    kind: "user";
    id: string;
    text: string;
    images?: number;
};

export interface CookieEntry {
    name: string;
    value: string;
}

export declare class CookieJar {
    private constructor();
    static parse(header: null | string | undefined): CookieJar;
    all(name: string): string[];
    read(name: string): CookieRead;
    has(name: string): boolean;
    names(): string[];
    entries(): CookieEntry[];
    readJson(name: string): unknown;
    toMap(): Map<string, CookieEntry>;
    without(drop: (name: string) => boolean): CookieJar;
    toHeader(): string;
}

export interface CookieRead {
    value?: string;
    count: number;
}

export declare const DEFAULT_AKAN_I18N: AkanI18nConfig;

export type DynamicRecord<Value = unknown> = {
    [key: string]: Value;
};

export declare class EventStream {
    static readonly defaultKeepAliveMs = 15000;
    constructor(onCancel: () => void, { keepAliveMs, keepAliveChunk }?: EventStreamOptions);
    get open(): boolean;
    response(headers?: {
        [key: string]: string;
    }): Response;
    write(message: object, id?: number | string): void;
    comment(text: string): void;
    retry(ms: number): void;
    close(): void;
}

export interface EventStreamOptions {
    keepAliveMs?: number;
    keepAliveChunk?: string;
}

export interface FetchPolicy<_Returns = unknown> {
    cache?: boolean | number;
    crystalize?: boolean;
    origin?: string;
    onError?: (error: string) => void;
    token?: string;
    partial?: string[];
    timeout?: false | number;
    signal?: AbortSignal;
    onResync?: () => void;
    retry?: RetryPolicy | false;
    idempotencyKey?: string;
    duringRender?: boolean;
    keepsReads?: boolean;
}

export interface FileUploadCapability {
    refName: string;
    endpointKey: string;
    prefix?: string;
}

export interface FrameworkChannel {
    name: string;
    label: string;
    at: AkanGraphLocation;
    messages: FrameworkMessage[];
}

export interface FrameworkClass {
    name: string;
    members: number;
    at: AkanGraphLocation;
}

export interface FrameworkFacet {
    id: string;
    name: string;
    packageName: string;
    layer: number;
    files: number;
    classes: FrameworkClass[];
}

export interface FrameworkImport {
    from: string;
    to: string;
    value: number;
    type: number;
    dynamic: number;
    at: AkanGraphLocation;
}

export interface FrameworkMap {
    version: 1;
    packages: FrameworkPackage[];
    facets: FrameworkFacet[];
    imports: FrameworkImport[];
    channels: FrameworkChannel[];
    missing: string[];
    cycles: string[][];
}

export interface FrameworkMessage {
    type: string;
    at: AkanGraphLocation;
    senders: FrameworkSite[];
    handlers: FrameworkSite[];
}

export interface FrameworkPackage {
    name: string;
    root: string;
}

export interface FrameworkSite {
    owner: string;
    count: number;
    at: AkanGraphLocation;
}

export declare class IpLiteral {
    static parse(entry: string): null | string;
}

export declare const LAYOUT_ROUTE_EXPORTS: ReadonlySet<string>;

export declare class LocalePath {
    static omits(locale: string, { defaultLocale, localePrefix }: Omit<LocaleRouting, "locales">): boolean;
    static segmentOf(locale: string, i18n: Omit<LocaleRouting, "locales">): string;
    static split(pathname: string, i18n: LocaleRouting): {
        locale: null | string;
        path: string;
        isPrefixed: boolean;
    };
    static join(locale: string, path: string, i18n: Omit<LocaleRouting, "locales">): string;
}

export type LogAttrValue = boolean | null | number | string;

export interface LogAttrs {
    [key: string]: LogAttrValue;
}

export type LogContextReader = () => LogContextSnapshot | undefined;

export interface LogContextSnapshot {
    traceId: null | string;
    endpoint: null | string;
    origin: null | string;
    flight?: LogFlightRecorder | null;
    debugSev?: null | number;
}

export interface LogFlightRecorder {
    minSev: number;
    capture(record: LogRecord, written: boolean): void;
}

export type LogFormat = (typeof logFormats)[number];

export type LogLevel = (typeof logLevels)[number];

export type LogLevelInput = "log" | LogLevel;

export interface LogRecord {
    at: number;
    elapsedMs: number;
    level: LogLevel | null;
    sev: number;
    name: string;
    context: string;
    message: string;
    stream: "stderr" | "stdout";
    pid: null | number;
    replicaIdx: null | number;
    role: null | string;
    origin: null | string;
    traceId: null | string;
    endpoint: null | string;
    attrs?: LogAttrs;
}

export declare class Logger {
    static level: LogLevel;
    static fileLevel: LogLevel;
    static format: LogFormat;
    static role: null | string;
    static consoleOutput: boolean;
    static contextGate: boolean;
    static readonly startAt: number;
    static setLevel(level: LogLevelInput): void;
    static setFileLevel(level: LogLevelInput): void;
    static addSink(sink: LoggerSink, { minLevel }?: LoggerSinkOptions): () => void;
    static removeSink(sink: LoggerSink): void;
    static isVerbose(): boolean;
    static get isNdjson(): boolean;
    static shouldLog(logLevel: LogLevelInput): boolean;
    static normalizeLevel(level: LogLevelInput): LogLevel;
    static levelAtOrAbove(sev: number): LogLevel;
    static render(record: LogRecord): string;
    static formatAttrs(attrs: LogAttrs): string;
    static isPromoted(record: LogRecord): boolean;
    static inlineData(value: unknown, max?: number): string;
    static isSecretKey(name: string): boolean;
    static redactAttrs(attrs: LogAttrs): LogAttrs;
    static emit({ level, name, message, context, attrs }: LoggerEmitInput): void;
    static replay(records: LogRecord[], { evicted }?: {
        evicted?: number;
    }): void;
    name?: string;
    constructor(name?: string);
    trace(msg: string, context?: string, name?: string): void;
    verbose(msg: string, context?: string, name?: string): void;
    debug(msg: string, context?: string, name?: string): void;
    log(msg: string, context?: string, name?: string): void;
    info(msg: string, context?: string, name?: string): void;
    warn(msg: string, context?: string, name?: string): void;
    error(msg: string, context?: string, name?: string): void;
    raw(msg: string, method?: "console" | "process"): void;
    rawLog(msg: string, method?: "console" | "process"): void;
    static trace(msg: string, context?: string, name?: string): void;
    static verbose(msg: string, context?: string, name?: string): void;
    static debug(msg: string, context?: string, name?: string): void;
    static log(msg: string, context?: string, name?: string): void;
    static info(msg: string, context?: string, name?: string): void;
    static warn(msg: string, context?: string, name?: string): void;
    static error(msg: string, context?: string, name?: string): void;
    static stripAnsi(msg: string): string;
    static rawLog(msg?: string, method?: "console" | "process", outputStream?: "error" | "log"): void;
    static raw(msg?: string, method?: "console" | "process", outputStream?: "error" | "log"): void;
}

export interface LoggerEmitInput {
    level: LogLevel;
    name: string;
    message: string;
    context?: string;
    attrs?: LogAttrs;
}

export type LoggerSink = (entry: LoggerSinkEntry) => Promise<void> | void;

export interface LoggerSinkEntry {
    stream: "stderr" | "stdout";
    level?: LogLevel;
    message: string;
    plainMessage: string;
    record: LogRecord;
}

export interface LoggerSinkOptions {
    minLevel?: LogLevelInput;
}

export type MarkdownBlock = TableBlock | {
    kind: "code";
    lang?: string;
    text: string;
} | {
    kind: "heading";
    level: number;
    text: string;
} | {
    kind: "list";
    items: MarkdownItem[];
} | {
    kind: "para";
    text: string;
} | {
    kind: "quote";
    text: string;
} | {
    kind: "rule";
};

export declare class MarkdownBlocks {
    static of(source: string): MarkdownBlock[];
    constructor(source: string);
}

export interface MarkdownItem {
    depth: number;
    ordered: boolean;
    num: number;
    text: string;
}

export type MarkdownSpan = {
    kind: "code";
    text: string;
} | {
    kind: "del";
    text: string;
} | {
    kind: "em";
    text: string;
} | {
    kind: "link";
    text: string;
    href: string;
} | {
    kind: "plain";
    text: string;
} | {
    kind: "strong";
    text: string;
} | {
    kind: "text";
    text: string;
};

export declare class MarkdownSpans {
    static of(text: string): MarkdownSpan[];
    static isSafeHref(href: string): boolean;
    static plain(text: string): string;
}

export declare class MarkdownTable {
    static at(lines: string[], at: number): null | {
        block: TableBlock;
        next: number;
    };
}

export interface McpExposureEndpoint {
    type: string;
    returns: {
        refName: string;
    };
    args: {
        name: string;
        refName: string;
        type: string;
        arrDepth?: number;
        nullable?: boolean;
    }[];
    guards?: string[];
    fileUpload?: boolean;
    mcp?: boolean;
    agents?: boolean;
}

export interface McpExposureOption {
    refName: string;
    key: string;
    readOnly?: boolean;
    view?: boolean;
}

export declare const PAGE_ROUTE_EXPORTS: ReadonlySet<string>;

export interface ParsedRouteModuleKey {
    key: string;
    kind: RouteModuleKind;
    routeSegments: string[];
    moduleSegments: string[];
    sourceRouteSegments: string[];
    ext: string;
    leaf: string;
    pattern: string;
    isInternalRootLayout: boolean;
}

export type PipelineActionName = keyof typeof pipelineActions;

export interface PipelineDiagnostic {
    severity: "error" | "warning";
    code: string;
    message: string;
    file: null | string;
    path: null | string;
}

export type PipelineMilestone = (typeof pipelineMilestones)[number];

export declare class PipelineNames {
    static isReservedEnv(name: string): boolean;
    static idError(id: string): null | string;
    static secretNameError(name: string): null | string;
    static envNameError(name: string): null | string;
}

export type PipelineOtaPlatform = (typeof pipelineOtaPlatforms)[number];

export declare class PipelinePattern {
    static matches(pattern: readonly string[] | string, value: string): boolean;
    static matchesAny(pattern: readonly string[] | string, values: readonly string[]): boolean;
    static validate(pattern: readonly string[] | string): null | string;
}

export interface PipelinePlan {
    schemaVersion: 1;
    sources: {
        workspace: PipelinePlanSource | null;
        apps: Record<string, PipelinePlanSource>;
    };
    planner: {
        akanVersion: string;
    };
    context: PipelinePlanContext;
    appOrder: string[];
    timeoutSeconds: null | number;
    requiredSecrets: string[];
    phases: PipelinePlanPhase[];
    post: PipelinePlanPost;
}

export type PipelinePlanActionStep = PipelinePlanAppActionStep | PipelinePlanOtaStep;

export interface PipelinePlanAppActionStep extends PipelinePlanActionStepBase {
    action: Exclude<PipelineActionName, "ota">;
    with: {
        app: string;
    };
}

export interface PipelinePlanContext {
    branch: string;
    env: string;
    apps: string[];
    trigger: PipelineTrigger;
    buildNum: number;
    commit: null | string;
}

export interface PipelinePlanOtaStep extends PipelinePlanActionStepBase {
    action: "ota";
    with: {
        app: string;
        targets: string[];
        platforms: PipelineOtaPlatform[];
    };
}

export interface PipelinePlanPhase {
    id: string;
    name: string;
    description: null | string;
    slot: PipelinePlanSlot;
    milestone: PipelineMilestone;
    action: PipelineActionName | null;
    order: "parallel" | "sequential";
    maxParallel: null | number;
    failFast: boolean;
    timeoutSeconds: null | number;
    stages: PipelinePlanStage[];
}

export interface PipelinePlanPost {
    success: PipelinePlanShellStep[];
    failure: PipelinePlanShellStep[];
    canceled: PipelinePlanShellStep[];
    always: PipelinePlanShellStep[];
}

export type PipelinePlanResult = {
    ok: false;
    plan: null;
    diagnostics: PipelineDiagnostic[];
} | {
    ok: true;
    plan: PipelinePlan;
    diagnostics: PipelineDiagnostic[];
};

export interface PipelinePlanRetry {
    attempts: number;
    delaySeconds: number;
}

export declare class PipelinePlanSchema {
    static parseText(text: string): PipelinePlanResult;
    static parseResult(value: unknown): PipelinePlanResult;
    static parse(value: unknown): PipelinePlan;
}

export interface PipelinePlanShellStep extends PipelinePlanStepBase {
    kind: "sh";
    run: string;
    cwd: string;
    env: Record<string, string>;
    secrets: string[];
    skipExitCodes: number[];
}

export type PipelinePlanSlot = (typeof pipelinePlanSlots)[number];

export interface PipelinePlanSource {
    file: string;
    sha256: string;
    declared: boolean;
}

export interface PipelinePlanStage {
    id: string;
    name: string;
    description: null | string;
    app: null | string;
    milestone: PipelineMilestone;
    skip: PipelineSkip | null;
    runtimeWhen: null | {
        changed: string[];
    };
    allowFailure: boolean;
    timeoutSeconds: null | number;
    steps: PipelinePlanStep[];
}

export type PipelinePlanStep = PipelinePlanActionStep | PipelinePlanShellStep;

export interface PipelineSkip {
    reason: string;
}

export type PipelineTrigger = (typeof pipelineTriggers)[number];

export type PipelineValueProblem = {
    kind: "boolean" | "empty" | "list" | "object" | "string";
} | {
    kind: "int" | "range";
    min: number;
    max: number;
} | {
    kind: "length";
    max: number;
} | {
    kind: "missingKey";
    key: string;
} | {
    kind: "oneOf";
    value: unknown;
    options: readonly string[];
} | {
    kind: "unknownKey";
    key: string;
    keys: readonly string[];
};

export declare class PipelineValueReader<Miss extends null> {
    constructor(form: "config" | "plan", miss: (path: string, ...problems: PipelineValueProblem[]) => Miss);
    object(value: unknown, path: string, keys?: readonly string[]): JsonObject | Miss;
    keys(raw: JsonObject, path: string, keys: readonly string[]): boolean;
    list(value: unknown, path: string): Miss | unknown[];
    string(value: unknown, path: string, max?: number, { allowEmpty }?: {
        allowEmpty?: boolean;
    }): Miss | string;
    boolean(value: unknown, path: string): Miss | boolean;
    int(value: unknown, path: string, min: number, max?: number): Miss | number;
    oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): Miss | T;
}

export declare const RESERVED_ROUTE_CONFIG_EXPORTS: ReadonlySet<string>;

export declare const ROOT_LAYOUT_ROUTE_EXPORTS: ReadonlySet<string>;

export declare class RemoteAuthCode {
    static readonly alphabet = "BCDFGHJKLMNPQRSTVWXZ";
    static readonly symbolNum = 8;
    static of(remoteId: string): Promise<string>;
    static loginIdOf(remoteId: string): Promise<string>;
    static normalize(input: string): string;
    static matches(remoteId: string, typed: string): Promise<boolean>;
}

export declare class RequestLocale {
    static resolve({ localeHeader: rawLocaleHeader, pathHeader, pathname }: RequestLocaleInput, { defaultLocale, locales }: AkanI18nConfig): {
        locale: string;
        path: string;
    };
}

export interface RequestLocaleInput {
    localeHeader?: null | string;
    pathHeader?: null | string;
    pathname?: string;
}

export declare class RestClient {
    readonly baseUrl: string;
    readonly headers: Headers;
    readonly timeout: number | undefined;
    constructor(options?: RestClientOptions | string);
    get<Returns>(url: string, options?: RestRequestOptions): Promise<Returns>;
    post<Returns>(url: string, data?: unknown, options?: RestRequestOptions): Promise<Returns>;
    put<Returns>(url: string, data?: unknown, options?: RestRequestOptions): Promise<Returns>;
    delete<Returns>(url: string, options?: RestRequestOptions): Promise<Returns>;
}

export interface RestClientOptions {
    baseUrl?: string;
    headers?: HeadersInit;
    timeout?: number;
}

export interface RestRequestOptions extends Omit<RequestInit, "body" | "headers" | "method"> {
    headers?: HeadersInit;
    timeout?: number;
}

export interface RestartPolicy extends BackoffPolicy {
    maxAttempts?: number;
}

export declare class RestartSchedule {
    constructor({ jitter, ...policy }?: RestartPolicy);
    get attempts(): number;
    get pending(): boolean;
    get exhausted(): boolean;
    next(): number;
    arm(delay: number, run: () => void): void;
    schedule(run: () => void): number;
    cancel(): void;
    reset(): void;
}

export interface RetryPolicy extends BackoffPolicy {
    attempts?: number;
}

export interface RouteLayer<Render> {
    path: string;
    pathSegments: string[];
    isRoot: boolean;
    rootLayouts: Render[];
    renderRootLayouts: Render[];
    renderLayouts: Render[];
    pageRenderRootLayouts: Render[];
    pageRenderLayouts: Render[];
}

export declare class RouteLayering {
    static of<Render>(route: LayeredRoute<Render>, parent: RouteLayer<Render> | null): RouteLayer<Render>;
}

export type RouteModuleKind = "layout" | "overrides" | "page";

export interface SessionCookieDuplicate {
    name: string;
    count: number;
}

export declare class SessionCookies {
    static watch(name: (() => string) | string): void;
    static names(): string[];
    static duplicatesIn(jar: CookieJar): SessionCookieDuplicate[];
    static report(duplicates: readonly SessionCookieDuplicate[], host: string): void;
    static sweepOf(duplicates: readonly SessionCookieDuplicate[], host: string, path: string): string[];
}

export interface SessionRead {
    token?: string;
    duplicate?: {
        name: string;
        count: number;
    };
}

export type SnakeCase<S extends string> = S extends `${infer T}_${infer U}` ? `${Lowercase<T>}_${SnakeCase<U>}` : S;

export type SnakeCaseObj<T> = {
    [K in keyof T as SnakeCase<K & string>]: T[K] extends object ? SnakeCaseObj<T[K]> : T[K];
};

export type SnakeMsg<Msg> = SnakeCaseObj<Msg>;

export interface TableBlock {
    kind: "table";
    aligns: (Align | null)[];
    head: string[];
    rows: string[][];
}

export declare class TrustedProxy {
    static configure(list: null | string | undefined): void;
    static reset(): void;
    static isTrusted(address: null | string | undefined): boolean;
    static clientAddress(headers: Headers, peerAddress: null | string | undefined): null | string;
    static resolve(headers: Headers, peerAddress: null | string | undefined): ResolvedClient;
    static isPrivateAddress(address: string): boolean;
}

export interface TunnelAgentIdentity {
    name: string;
    version: string;
    platform: string;
}

export interface TunnelAttachFrame {
    type: "attach";
    version: number;
    sessionId: string;
}

export interface TunnelAttachedFrame {
    type: "attached";
}

export interface TunnelByeFrame {
    type: "bye";
    reason?: string;
}

export type TunnelCloseCode = (typeof tunnelCloseCode)[keyof typeof tunnelCloseCode];

export type TunnelControlFromAgent = TunnelByeFrame | TunnelHelloFrame | TunnelPingFrame | TunnelPongFrame;

export type TunnelControlFromGateway = TunnelByeFrame | TunnelDemandFrame | TunnelPingFrame | TunnelPongFrame | TunnelReadyFrame;

export type TunnelDataFromAgent = TunnelAttachFrame | TunnelEndFrame | TunnelHeadFrame | TunnelResetFrame;

export type TunnelDataFromGateway = TunnelAttachedFrame | TunnelEndFrame | TunnelOpenFrame | TunnelReleaseFrame | TunnelResetFrame;

export interface TunnelDemandFrame {
    type: "demand";
    idle: number;
}

export interface TunnelEndFrame {
    type: "end";
    streamId: string;
}

export type TunnelFrame = TunnelControlFromAgent | TunnelControlFromGateway | TunnelDataFromAgent | TunnelDataFromGateway;

export interface TunnelHeadFrame {
    type: "head";
    streamId: string;
    status: number;
    statusText?: string;
    headers: TunnelHeaderList;
    body?: boolean;
}

export type TunnelHeaderList = [
    string,
    string
][];

export interface TunnelHelloFrame {
    type: "hello";
    version: number;
    hostnames: string[];
    agent: TunnelAgentIdentity;
}

export interface TunnelOpenFrame {
    type: "open";
    streamId: string;
    kind: TunnelStreamKind;
    hostname: string;
    method?: string;
    path?: string;
    headers?: TunnelHeaderList;
    port?: number;
    body?: boolean;
}

export interface TunnelPingFrame {
    type: "ping";
    at: number;
}

export interface TunnelPongFrame {
    type: "pong";
    at: number;
}

export interface TunnelReadyFrame {
    type: "ready";
    version: number;
    sessionId: string;
    hostnames: string[];
    urls: string[];
    idle: number;
    maxSockets: number;
    heartbeatMs: number;
    expiresAt?: number;
}

export interface TunnelReleaseFrame {
    type: "release";
    streamId: string;
}

export type TunnelResetCode = "canceled" | "internal" | "originRefused" | "originTimeout" | "originUnreachable" | "protocol" | "tooLarge";

export interface TunnelResetFrame {
    type: "reset";
    streamId: string;
    code: TunnelResetCode;
    message?: string;
}

export type TunnelStreamKind = "http" | "tcp" | "websocket";

export type TunnelWsPayloadKind = (typeof tunnelWsPayload)[keyof typeof tunnelWsPayload];

export interface ValidatePageSourceFileOptions {
    filePath?: string;
}

export interface ValidateSubRoutePageKeyOptions {
    appName?: string;
    filePath?: string;
}

export interface WebsocketAuthAckData {
    type: "auth";
    revokedRooms: string[];
}

export interface WebsocketAuthRequest {
    key: string;
    data: [
        null | string
    ];
}

export interface WebsocketBinaryFrame {
    roomId: string;
    payload: Uint8Array;
}

export interface WebsocketHeartbeatAckData {
    type: "pong";
}

export interface WebsocketHeartbeatRequest {
    key: string;
    data: [
    ];
}

export declare const akanLocalePrefixes: readonly [
    "always",
    "as-needed"
];

export declare const applyMixins: (derivedCtor: Cls, constructors: (Cls | undefined)[], avoidKeys?: Set<string>) => Cls<unknown>;

export declare function assertUniqueRoutePatterns(entries: {
    key: string;
    pattern: string;
}[]): void;

export declare const authTokenKey: () => string;

export declare const bearerTokenOf: (authorization: null | string | undefined) => null | string;

export declare const capitalize: (str: string) => string;

export declare const clamp: (value: number, min: number, max: number) => number;

export declare const clientAddressFromHeaders: (headers: Headers, isTrusted?: (address: string) => boolean) => null | string;

export declare const clientPortFromHeaders: (headers: Headers) => null | number;

export declare const codeAgentClip: (text: string, max: number) => string;

export declare const codeAgentDeniedPaths: string[];

export declare const codeAgentEventLabel: (event: CodeAgentEventBody) => string;

export declare const codeAgentEventPersistence: {
    [key in CodeAgentEventType]: "live" | "persist";
};

export declare const codeAgentLabelChars = 200;

export declare const codeAgentOutputChars = 2000;

export declare const codeAgentPresets: {
    readonly local: (root: string) => CodeAgentProfile;
    readonly pod: (root: string) => CodeAgentProfile;
    readonly review: (root: string) => CodeAgentProfile;
    readonly web: (root: string) => CodeAgentProfile;
};

export declare const codeAgentReadOnlyBuiltins: CodeAgentBuiltinTool[];

export declare const codeAgentRenderAnswer: (question: CodeAgentQuestion, answer: CodeAgentAnswer) => string;

export declare const codeAgentSessionName: (text: string, max?: number) => string;

export declare const codeAgentShouldPersist: (event: CodeAgentEventBody) => boolean;

export declare const codeAgentWireVersion = 1;

export declare function compareRouteSpecificity(a: string, b: string): number;

/** @deprecated */
export declare const cookieHeaderHasAuthToken: (cookieHeader: null | string | undefined) => boolean;

export declare const databaseStateNames: (refName: string) => {
    model: string;
    modelLoading: string;
    modelForm: string;
    modelFormLoading: string;
    modelFormUploading: string;
    modelSubmit: string;
    modelViewAt: string;
    modelModal: string;
    modelDraft: string;
    modelOperation: string;
    defaultModel: string;
};

export declare const decodeJwtPayload: <T = unknown>(jwt: string) => T;

export declare const deepObjectify: <T = unknown>(obj: T | null | undefined, option?: DeepObjectifyOption) => T;

export declare const endpointNames: (key: string) => {
    subscribe: string;
    listen: string;
};

export declare const fileUploadContract: {
    readonly fields: {
        readonly files: "files";
        readonly metas: "metas";
        readonly type: "type";
        readonly parentId: "parentId";
    };
    readonly buildMetas: (fileList: FileList | File[]) => {
        lastModifiedAt: string;
        size: number;
    }[];
};

export declare const formSetterNames: (className: string, key: string) => {
    field: string;
    Field: string;
    setFieldOnModel: string;
    addFieldOnModel: string;
    subFieldOnModel: string;
    addOrSubFieldOnModel: string;
    moveFieldOnModel: string;
    uploadFieldOnModel: string;
    postSetField: string;
};

export declare const formatNumber: (numString: string) => string;

export declare const formatPhone: (value: string) => string;

export declare const forwardedHeaders: readonly [
    "x-real-ip",
    "x-forwarded-for",
    "x-forwarded-port",
    "x-forwarded-host",
    "x-forwarded-proto"
];

/** @deprecated */
export declare function getAkanHmrPhase(): AkanHmrPhase;

export declare const getAllPropertyDescriptors: (objRef: Cls) => {
    [key: string]: PropertyDescriptor;
};

export declare const getBasePathFromPathname: (pathname: string, { basePaths, i18n, headerBasePath, }: {
    basePaths: Iterable<string>;
    i18n?: Pick<AkanI18nConfig, "defaultLocale" | "locales">;
    headerBasePath?: null | string;
}) => null | string;

export declare function getPageSourceFileViolation(filePath: string): null | string;

export declare function getRouteExports(kind: "layout" | "page", { rootLayout }?: {
    rootLayout?: boolean | undefined;
}): ReadonlySet<string>;

export declare const hasErrKey: <Key extends string>(error: unknown, keys: readonly Key[]) => error is {
    readonly error: Key;
};

export declare const hostFromRequest: (headers: Headers, url: URL) => string;

export declare const interpolateTranslation: (message: string, data: Record<string, unknown> | undefined) => string;

/** @deprecated */
export declare function isAkanHmrApplying(): boolean;

export declare const isAuthTokenKey: (key: string) => boolean;

export declare const isCodeAgentPresetName: (name: string) => name is CodeAgentPresetName;

export declare const isCodeAgentReply: (frame: CodeAgentFrame) => frame is CodeAgentReply;

export declare const isDayjs: typeof dayjs.isDayjs;

export declare const isEmail: (email?: null | string) => boolean;

export declare const isJsonContentType: (contentType: null | string) => boolean;

export declare const isMcpDescribableArg: (arg: {
    refName: string;
}) => boolean;

export declare const isOwnAuthToken: (jwt: string) => boolean;

export declare const isPhoneNumber: (phone?: null | string) => boolean;

export declare const isQueryEqual: (value1: unknown, value2: unknown) => boolean;

export declare const isRecord: (value: unknown) => value is Record<string, unknown>;

export declare function isRouteSourceFile(filePath: string): boolean;

export declare const isThenable: (value: unknown) => value is PromiseLike<unknown>;

export declare const isValidDate: (d: Date | Dayjs | string) => boolean;

export declare const legacyAuthTokenKey = "jwt";

export declare const logFormats: readonly [
    "text",
    "ndjson",
    "ndjson-only"
];

export declare const logLevels: readonly [
    "trace",
    "verbose",
    "debug",
    "info",
    "warn",
    "error"
];

export declare const logSeverity: {
    readonly trace: 1;
    readonly verbose: 3;
    readonly debug: 5;
    readonly info: 9;
    readonly warn: 13;
    readonly error: 17;
};

export declare const lowerlize: (str: string) => string;

export declare function matchRoutePattern(pattern: string, pathname: string): Record<string, string> | null;

export declare const mcpBaseVerbOf: (refName: string, key: string) => "create" | "get" | "remove" | "update" | null;

export declare const mcpHintsOf: (key: string, endpoint: {
    type: string;
}) => {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
};

export declare const mcpRefusalOf: (endpoint: McpExposureEndpoint, { refName, key, readOnly, view }: McpExposureOption) => null | string;

export declare const mergeVersion: (major: number, minor: number, patch: number) => string;

export declare const modelNames: (refName: string) => {
    getModel: string;
    loadModel: string;
    loadModelMany: string;
    createModel: string;
    createModelMany: string;
    updateModel: string;
    removeModel: string;
    modelModel: string;
    modelLoader: string;
    modelCache: string;
    modelId: string;
    lightModel: string;
    viewModel: string;
    getModelView: string;
    modelView: string;
    editModel: string;
    getModelEdit: string;
    modelEdit: string;
    modelObj: string;
    modelObjList: string;
    modelObjInsight: string;
    addModelFiles: string;
    mergeModel: string;
    createModelInForm: string;
    updateModelInForm: string;
    checkModelSubmitable: string;
    submitModel: string;
    newModel: string;
    setModel: string;
    resetModel: string;
    invalidateModel: string;
    loadModelFormDraft: string;
    restoreModelFormDraft: string;
    discardModelFormDraft: string;
    writeOnModel: string;
    setViewOfModel: string;
    exportCsvOfModel: string;
    exportJsonOfModel: string;
    model: string;
    modelLoading: string;
    modelForm: string;
    modelFormLoading: string;
    modelFormUploading: string;
    modelSubmit: string;
    modelViewAt: string;
    modelModal: string;
    modelDraft: string;
    modelOperation: string;
    defaultModel: string;
};

export declare const moduleNames: (refName: string) => {
    service: string;
    ServiceClass: string;
    SliceClass: string;
    ModelClass: string;
    FilterClass: string;
    SignalClass: string;
    InternalClass: string;
    EndpointClass: string;
};

export declare const normalizeIpAddress: (address: string) => string;

export declare function normalizeRoutePattern(segments: string[]): string;

export declare const objectify: <T extends object>(obj: T, keys?: (keyof T)[]) => Partial<T>;

export declare const originFromRequest: (headers: Headers, url: URL) => string;

export declare function parseAkanI18nEnv(env?: Record<string, string | undefined>): AkanI18nConfig;

export declare const parseBasePaths: (value: Set<string> | null | string | string[] | undefined) => string[];

export declare function parseRouteModuleKey(key: string): ParsedRouteModuleKey;

export declare const parseSearchParams: (search: string) => {
    [key: string]: string | string[];
};

export declare const parseSubRouteHosts: (value: null | string | undefined) => Record<string, string[]>;

export declare const pathGet: (path: (number | string)[] | string, obj: unknown, separator?: string, fallback?: unknown) => unknown;

export declare const pathGetLoose: (path: readonly string[] | string, obj: unknown, separator?: string, fallback?: unknown) => unknown;

export declare const pathSet: <T>(obj: T, path: readonly PathSegment[] | string, value: unknown) => T;

export declare const pipelineActionNames: readonly PipelineActionName[];

export declare const pipelineActions: {
    readonly build: {
        readonly version: 1;
        readonly milestone: "build";
        readonly name: "Build";
    };
    readonly docker: {
        readonly version: 1;
        readonly milestone: "package";
        readonly name: "Docker";
    };
    readonly deploy: {
        readonly version: 1;
        readonly milestone: "deploy";
        readonly name: "Deploy";
    };
    readonly ota: {
        readonly version: 1;
        readonly milestone: "deploy";
        readonly name: "OTA";
    };
};

export declare const pipelineMilestones: readonly [
    "prepare",
    "build",
    "verify",
    "package",
    "deploy",
    "finish"
];

export declare const pipelineOtaPlatforms: readonly [
    "ios",
    "android"
];

export declare const pipelinePlanLimits: {
    readonly phases: 50;
    readonly stages: 400;
    readonly steps: 1000;
    readonly shBytes: number;
    readonly planBytes: number;
    readonly nameChars: 120;
    readonly descriptionChars: 500;
    readonly patternChars: 256;
    readonly retryAttempts: 10;
    readonly retryDelaySeconds: 3600;
};

export declare const pipelinePlanSlots: readonly [
    "before",
    "before-build",
    "build",
    "after-build",
    "docker",
    "after-docker",
    "deploy",
    "after-deploy",
    "ota",
    "after-ota",
    "after"
];

export declare const pipelinePlanVersion = 1;

export declare const pipelineReservedEnv: readonly [
    "CI",
    "AKAN_CI",
    "PATH",
    "HOME",
    "PWD",
    "SHELL",
    "IFS",
    "BASH_ENV",
    "ENV",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH"
];

export declare const pipelineRuntimeEnv: readonly [
    "CI",
    "AKAN_CI",
    "AKAN_CI_BRANCH",
    "AKAN_CI_ENV",
    "AKAN_CI_TRIGGER",
    "AKAN_CI_BUILD_NUM",
    "AKAN_CI_COMMIT",
    "AKAN_CI_APPS",
    "AKAN_CI_APP",
    "AKAN_CI_PHASE",
    "AKAN_CI_STAGE",
    "AKAN_CI_STEP",
    "AKAN_CI_RESULT"
];

export declare const pipelineTriggers: readonly [
    "push",
    "redeploy",
    "initial",
    "rebuild",
    "manual"
];

export declare const plainFieldsOf: (source: object) => Record<string, unknown>;

export declare const queryNames: (queryKey: string) => {
    list: string;
    listIds: string;
    find: string;
    findId: string;
    pick: string;
    pickId: string;
    exists: string;
    count: string;
    insight: string;
    query: string;
    remove: string;
    removeOne: string;
    purge: string;
    update: string;
    updateOne: string;
};

export declare const randomPick: <T = unknown>(arr: T[] | readonly T[]) => T;

export declare const randomPicks: <T>(arr: T[] | readonly T[], count?: number, allowDuplicate?: boolean) => T[];

/** @deprecated */
export declare const readAuthToken: (read: (key: string) => null | string | undefined) => string | undefined;

export declare const readLogContext: () => LogContextSnapshot | undefined;

export declare const readSessionToken: (jar: CookieJar) => SessionRead;

export declare const registerLogContextReader: (reader: LogContextReader | null) => void;

export declare function resolveAkanI18nConfig(input?: AkanI18nConfigInput): AkanI18nConfig;

export declare const resolveFileUploadCapability: (serializedSignal: Record<string, {
    prefix?: string;
    endpoint: Record<string, {
        fileUpload?: boolean;
    }>;
}>) => FileUploadCapability | null;

export declare const resolveSubRouteHosts: ({ subRoutes, basePaths, env, }: {
    subRoutes: Record<string, string[]>;
    basePaths: Iterable<string>;
    env?: null | string;
}) => {
    subRoutes: Record<string, string[]>;
    ignoredBasePaths: string[];
};

export declare const retiredAuthTokenKeys: () => string[];

export declare const round: (value: number, digits?: number) => number;

export declare function routeSegmentToPatternPart(segment: string): string;

export declare function routeSegmentToTreePath(segment: string): string;

export declare const sleep: (ms: number) => Promise<unknown>;

export declare const sliceNames: (refName: string, suffix?: string) => {
    slice: string;
    state: {
        defaultModel: string;
        modelInitList: string;
        modelInsight: string;
        modelList: string;
        modelListLoading: string;
        modelInitAt: string;
        modelStaleAt: string;
        lastPageOfModel: string;
        pageOfModel: string;
        limitOfModel: string;
        hasMoreOfModel: string;
        isCumulativeOfModel: string;
        hasInsightOfModel: string;
        queryArgsOfModel: string;
        sortOfModel: string;
        modelSelection: string;
    };
    action: {
        initModel: string;
        refreshModel: string;
        selectModel: string;
        setPageOfModel: string;
        loadMoreOfModel: string;
        setLimitOfModel: string;
        setQueryArgsOfModel: string;
        setSortOfModel: string;
        applyLiveModel: string;
        watchLiveModel: string;
    };
    endpoint: {
        list: string;
        insight: string;
        live: string;
        subscribeLive: string;
        init: string;
        getInit: string;
        initResult: string;
    };
};

export declare const splitVersion: (version: string) => {
    major: string;
    minor: string;
    patch: string;
};

export declare const stateSetterName: (key: string) => string;

export declare const toError: (reason: unknown) => Error;

export declare const toPathSegments: (path: readonly PathSegment[] | string) => any[];

export declare const trimSlashes: (value: string) => string;

export declare const trimTrailingSlashes: (value: string) => string;

export declare function tryParseRouteModuleKey(key: string): ParsedRouteModuleKey | null;

export declare const tunnelCloseCode: {
    readonly unauthorized: 4001;
    readonly unsupportedVersion: 4002;
    readonly hostnameNotGranted: 4003;
    readonly unknownSession: 4004;
    readonly superseded: 4005;
    readonly streamLimit: 4008;
    readonly goingAway: 4009;
};

export declare const tunnelForwardedHeaders: readonly [
    "x-real-ip",
    "x-forwarded-for",
    "x-forwarded-port",
    "x-forwarded-host",
    "x-forwarded-proto",
    "forwarded"
];

export declare const tunnelHopByHopHeaders: readonly [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade"
];

export declare const tunnelWireContract: {
    readonly version: 1;
    readonly controlPath: "/_tunnel/control";
    readonly dataPath: "/_tunnel/data";
    readonly authScheme: "Bearer";
    readonly defaultIdleSockets: 4;
    readonly defaultMaxSockets: 128;
    readonly defaultHeartbeatMs: 30000;
    readonly chunkBytes: number;
    readonly maxFrameBytes: number;
    readonly stripForwarded: (headers: Headers) => Headers;
    readonly forwardedHeaderNames: readonly [
        "x-real-ip",
        "x-forwarded-for",
        "x-forwarded-port",
        "x-forwarded-host",
        "x-forwarded-proto",
        "forwarded"
    ];
    readonly isHopByHop: (name: string) => boolean;
    readonly headerList: (headers: Headers) => TunnelHeaderList;
    readonly headersOf: (list: TunnelHeaderList) => Headers;
    readonly encodeWsPayload: (kind: TunnelWsPayloadKind, data: Uint8Array) => Uint8Array;
    readonly decodeWsPayload: (frame: Uint8Array) => null | {
        kind: TunnelWsPayloadKind;
        data: Uint8Array;
    };
    readonly parseFrame: (raw: string) => TunnelFrame | null;
};

export declare const tunnelWsPayload: {
    readonly text: 0;
    readonly binary: 1;
    readonly close: 2;
};

export declare function validatePageSourceFile(filePath: string, options?: ValidatePageSourceFileOptions): boolean;

export declare function validateSubRoutePageKey(key: string, basePaths: Iterable<string>, options?: ValidateSubRoutePageKeyOptions): void;

export declare const websocketAuthContract: {
    readonly key: "__auth";
    readonly makeRequest: (jwt: null | string) => WebsocketAuthRequest;
    readonly makeAck: (revokedRooms: string[]) => WebsocketAuthAckData;
    readonly readJwt: (data: unknown) => null | string;
};

export declare const websocketBinaryFrameContract: {
    readonly encode: ({ roomId, payload }: WebsocketBinaryFrame) => Uint8Array;
    readonly decode: (data: ArrayBuffer | Uint8Array) => WebsocketBinaryFrame | null;
};

export declare const websocketCredentialContract: {
    readonly expiredCode: 4401;
    readonly expiredReason: "credential expired";
    readonly expiresAtOf: (jwt: string) => null | number;
};

export declare const websocketHeartbeatContract: {
    readonly key: "__ping";
    readonly intervalMs: 45000;
    readonly silenceMs: number;
    readonly makeRequest: () => WebsocketHeartbeatRequest;
    readonly makeAck: () => WebsocketHeartbeatAckData;
};
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type Cls<T = unknown> = new (...args: never[]) => T;

interface DeepObjectifyOption {
    serializable?: boolean;
    convertDate?: "number" | "string";
}

type JsonObject = Record<string, unknown>;

interface LayeredRoute<Render> {
    path: string;
    renderLayout?: Render;
    isRootLayout?: boolean;
    renderOverrides?: Render;
    pageIncludesOwnLayout?: boolean;
}

type LocaleRouting = Pick<AkanI18nConfig, "defaultLocale" | "localePrefix" | "locales">;

type PathSegment = number | string;

interface PipelinePlanActionStepBase extends PipelinePlanStepBase {
    kind: "action";
    actionVersion: 1;
}

interface PipelinePlanStepBase {
    id: string;
    name: string;
    timeoutSeconds: null | number;
    retry: PipelinePlanRetry | null;
    allowFailure: boolean;
}

interface ResolvedClient {
    address: null | string;
    forwarded: boolean;
}
```
