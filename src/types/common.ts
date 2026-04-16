/**
 * Standard backend response envelope.
 * Every backend endpoint wraps its data in this structure.
 */
export interface ApiResponse<T = unknown> {
  status: "success" | "error";
  code: string;
  message: string;
  data: T;
  request_id: string;
}

/**
 * Backend validation error entry.
 */
export interface FieldError {
  field: string;
  message: string;
  code: string;
}

/**
 * Backend error data shape.
 */
export interface ErrorData {
  errors?: FieldError[];
  [key: string]: unknown;
}
