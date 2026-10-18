// An `Exception` travels to the caller with its message intact, so it may say nothing the caller may not know; a
// plain `Error` is generalized to a 500 by `SignalFailure`. User-facing domain rules throw a dictionary `Err`.
// Deletion caution: naming this type breaks the `.d.ts` cycle of `static X = class extends Exception` (TS7056).
export interface StatusException {
  new (message?: string, details?: unknown): Exception;
}

export class Exception extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.data !== undefined ? { data: this.data } : {}),
    };
  }
  static BadRequest: StatusException = class BadRequestException extends Exception {
    constructor(message = "Bad Request", details?: unknown) {
      super(400, message, details);
    }
  };
  static Unauthorized: StatusException = class UnauthorizedException extends Exception {
    constructor(message = "Unauthorized", details?: unknown) {
      super(401, message, details);
    }
  };
  static Forbidden: StatusException = class ForbiddenException extends Exception {
    constructor(message = "Forbidden", details?: unknown) {
      super(403, message, details);
    }
  };
  static NotFound: StatusException = class NotFoundException extends Exception {
    constructor(message = "Not Found", details?: unknown) {
      super(404, message, details);
    }
  };
  static Conflict: StatusException = class ConflictException extends Exception {
    constructor(message = "Conflict", details?: unknown) {
      super(409, message, details);
    }
  };
  static UnsupportedMediaType: StatusException = class UnsupportedMediaTypeException extends Exception {
    constructor(message = "Unsupported Media Type", details?: unknown) {
      super(415, message, details);
    }
  };
  static Error: StatusException = class InternalServerErrorException extends Exception {
    constructor(message = "Internal Server Error", details?: unknown) {
      super(500, message, details);
    }
  };
}

/**
 * Forwarded to the caller instead of generalized: an `Exception`, a dictionary `Err`, a `NoDocumentError`, or a restored
 * remote one.
 */
export interface ExceptionLike {
  statusCode: number;
  toJSON: () => object;
}

export const isExceptionLike = (error: unknown): error is ExceptionLike =>
  error instanceof Exception ||
  (error instanceof Error &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    typeof (error as { toJSON?: unknown }).toJSON === "function");
