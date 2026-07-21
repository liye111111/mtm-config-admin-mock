export class AppError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "AppError"; }
}
export class NotFoundError extends AppError {
  constructor(message: string) { super(message, 404); }
}
