/**
 * utils/AppError.ts — Custom Application Error Class
 *
 * Extends the native Error with structured fields and automatic logging.
 *
 * Fields:
 *   statusCode    — HTTP status to send in the response (default 500)
 *   status        — "fail" for 4xx errors, "error" for 5xx errors.
 *                   Follows the JSend convention used by many REST APIs.
 *   isOperational — true for expected errors (bad input, not found, auth fail).
 *                   false would indicate a programmer bug. Useful for a global
 *                   error handler that decides whether to restart the process.
 *
 * Every instantiation automatically calls logError(), which prints a
 * structured block to stderr with the type, status code, message, and full
 * stack trace — no need to manually log at the throw site.
 *
 * Usage:
 *   throw new AppError("User not found", 404);
 *   throw new AppError("Unauthorized", 401);
 */

export class AppError extends Error {
  public readonly status: string;

  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
  ) {
    super(message);

    // Use the class name ("AppError") instead of the generic "Error"
    this.name = this.constructor.name;

    // "fail" for client errors (4xx), "error" for server errors (5xx)
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    // Restore the prototype chain so `instanceof AppError` works correctly
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture a clean stack trace that starts at the throw site, not here
    Error.captureStackTrace(this, this.constructor);

    // Log immediately on construction — no need to log at every throw site
    this.logError();
  }

  /**
   * Prints a structured error block to stderr.
   * Called automatically in the constructor.
   */
  private logError() {
    console.error(`--- 🚨 Error Identified ---`);
    console.error(`Type: ${this.name}`);
    console.error(`Status: ${this.statusCode} (${this.status})`);
    console.error(`Message: ${this.message}`);
    console.error(`---------------------------\n`);
  }
}
