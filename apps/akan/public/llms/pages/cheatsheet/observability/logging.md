# Logging

- Source: /cheatsheet/observability/logging
- Mirror: /llms/pages/cheatsheet/observability/logging.md
- Section: cheatsheet
- Category: Observability
- Priority: P2

## Headings

- Runtime Logging (#logging-overview)
- Using Logger (#using-logger)
- Log Levels (#log-levels)
- File Logging & Rotation (#file-logging)
- Reading Logs (#reading-logs)
- Operational Checklist (#operational-checklist)

## Content

Logging

Runtime Logging

Akan uses Logger for structured runtime output and AkanApp stores gateway and child process logs as files. Terminal logging stays concise for development, while file logging keeps richer records for later inspection.

Logger API

Use named loggers in services, adaptors, scripts, and runtime code.

Terminal level

Controls what is printed to stdout and stderr.

File level

Controls what Logger output is written to log files. Defaults to trace.

Using Logger

Create a Logger with a component or service name, then write logs at the level that matches the intent. Add context when the same logger handles several jobs.

Use trace or debug for detailed diagnosis, info/log for normal lifecycle events, warn for recoverable issues, and error when an operation failed or needs attention.

Log Levels

Terminal output and file output are intentionally separated. A production server can keep the terminal at info or warn while still writing trace-level Logger records to files.

Terminal

Controlled by AKAN_PUBLIC_LOG_LEVEL. Lower-priority messages are not printed to stdout/stderr.

Files

Controlled by AKAN_LOG_FILE_LEVEL. Defaults to trace so structured Logger messages are preserved even when the terminal is quiet.

File Logging & Rotation

When AkanApp starts, it writes file logs under the app runtime directory by default. Gateway logs and child process logs are separated, and each process key rotates independently by local date and file size.

The file name format is appName-environment-operationMode-YYYY-MM-DD-processKey-sequence.log. If the date changes, sequence starts again at 0001 for that date. If an app restarts, Akan continues from the next available sequence instead of overwriting old files.

Reading Logs

Start with the gateway log when the app cannot accept traffic, then inspect the child log that handled the request or background job. Child files include stdout and stderr prefixes.

Direct console.log calls from child servers are captured through stdout/stderr pipes. Direct console.log calls from the gateway process are not part of Logger sink capture, so prefer Logger in runtime code.

Operational Checklist

Keep terminal logs readable

Use AKAN_PUBLIC_LOG_LEVEL=info or warn in production and increase it temporarily during live debugging.

Preserve file detail

Keep AKAN_LOG_FILE_LEVEL=trace unless log volume or sensitive fields require a narrower level.

Plan disk usage

AKAN_LOG_MAX_SIZE_MB and AKAN_LOG_MAX_FILES are applied per process key, so replicas multiply the maximum disk usage.

Avoid secrets

Do not log tokens, passwords, database URLs, or private payloads. File logs are designed to last longer than terminal output.

## Code Examples

### Service logging

```ts
import { Logger } from "akanjs/common";

export class BillingService {
  readonly logger = new Logger("BillingService");

  async syncInvoice(invoiceId: string) {
    this.logger.debug(`sync start invoiceId=${invoiceId}`, "invoice-sync");

    try {
      await this.pushInvoice(invoiceId);
      this.logger.info(`sync complete invoiceId=${invoiceId}`, "invoice-sync");
    } catch (error) {
      this.logger.error(
        `sync failed invoiceId=${invoiceId} message=${error instanceof Error ? error.message : String(error)}`,
        "invoice-sync",
      );
      throw error;
    }
  }
}
```

### .env

```bash
# Terminal output
AKAN_PUBLIC_LOG_LEVEL=info

# File output for structured Logger messages
AKAN_LOG_FILE_LEVEL=trace

# Turn file logging off when needed
AKAN_LOG_TO_FILE=0
```

### Default log files

```bash
local/apps/myapp/runtime/logs/
  myapp-local-local-2026-05-25-gateway-0001.log
  myapp-local-local-2026-05-25-0-all-0001.log
  myapp-local-local-2026-05-25-1-federation-0001.log
```

### Rotation configuration

```bash
# Override the log directory
AKAN_LOG_DIR=/var/log/akan

# Create the next sequence file after this size
AKAN_LOG_MAX_SIZE_MB=50

# Keep this many files per process key
AKAN_LOG_MAX_FILES=100
```

### Local lookup

```bash
# List current log files
ls -lh local/apps/myapp/runtime/logs

# Follow gateway logs
tail -f local/apps/myapp/runtime/logs/*-gateway-*.log

# Follow a child process log
tail -f local/apps/myapp/runtime/logs/*-0-all-*.log

# Search errors
rg "ERROR|Unhandled|Failed" local/apps/myapp/runtime/logs
```

### Server lookup

```bash
# When AKAN_LOG_DIR is configured
ls -lh /var/log/akan
tail -f /var/log/akan/*-gateway-*.log
rg "invoice-sync|ERROR" /var/log/akan
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

