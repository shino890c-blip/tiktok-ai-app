/** Base application error. `retryable` tells the TaskManager whether a retry is safe. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", false);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, "VALIDATION_ERROR", true, metadata);
  }
}

/** Input to a task is invalid — retrying the same input can never succeed. */
export class InvalidInputError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, "INVALID_INPUT", false, metadata);
  }
}

export class RetryableError extends AppError {
  constructor(message: string, code = "RETRYABLE", metadata: Record<string, unknown> = {}) {
    super(message, code, true, metadata);
  }
}

export class NonRetryableError extends AppError {
  constructor(message: string, code = "NON_RETRYABLE", metadata: Record<string, unknown> = {}) {
    super(message, code, false, metadata);
  }
}

export class ArtifactMissingError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, "ARTIFACT_MISSING", true, metadata);
  }
}

/** Database failures halt processing (see Worker) and raise a CRITICAL notification. */
export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "DATABASE_ERROR", false, { cause: cause instanceof Error ? cause.message : String(cause) });
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, "TIMEOUT", true, metadata);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message: string) {
    super(message, "QUOTA_EXCEEDED", false);
  }
}

/** Publishing ended in an unknown state (e.g. upload may or may not exist). Never auto-retried. */
export class PublishUnknownStateError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, "PUBLISH_UNKNOWN_STATE", false, metadata);
  }
}

export class ExternalApiError extends AppError {
  constructor(
    message: string,
    public readonly status: number | undefined,
    retryable: boolean,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "EXTERNAL_API_ERROR", retryable, { status, ...metadata });
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof AppError) return err.retryable;
  return true;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function serializeError(err: unknown): { name: string; message: string; code?: string; retryable: boolean } {
  if (err instanceof AppError) {
    return { name: err.name, message: err.message, code: err.code, retryable: err.retryable };
  }
  if (err instanceof Error) return { name: err.name, message: err.message, retryable: true };
  return { name: "Error", message: String(err), retryable: true };
}
