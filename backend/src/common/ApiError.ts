export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, details?: unknown, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(
    message = 'You do not have permission to perform this action',
    code = 'FORBIDDEN',
  ) {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Requested resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message: string, details?: unknown, code = 'CONFLICT') {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(
    message: string,
    details?: unknown,
    code = 'BUSINESS_RULE_VIOLATION',
  ) {
    return new ApiError(422, code, message, details);
  }

  static tooManyRequests(
    message = 'Too many requests, please try again later',
    code = 'RATE_LIMITED',
  ) {
    return new ApiError(429, code, message);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new ApiError(500, code, message);
  }
}
