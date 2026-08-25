import { z } from "zod";

export class DomainError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function normalizeError(error: unknown): {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
} {
  if (error instanceof DomainError) {
    const result: {
      code: string;
      message: string;
      status: number;
      details?: Record<string, unknown>;
    } = { code: error.code, message: error.message, status: error.status };
    if (error.details !== undefined) {
      result.details = error.details;
    }
    return result;
  }

  if (error instanceof z.ZodError) {
    return {
      code: "INVALID_INPUT",
      message: "Input did not match the required schema.",
      status: 400,
      details: { issues: error.issues }
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "The control plane could not complete the operation.",
    status: 500
  };
}
