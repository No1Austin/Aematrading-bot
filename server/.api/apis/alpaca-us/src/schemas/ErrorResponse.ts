import ErrorCode from './ErrorCode.js';
import ErrorResponseField from './ErrorResponseField.js';

const ErrorResponse = {
  "properties": {
    "error": ErrorCode,
    "fields": {
      "description": "List of invalid request fields, if any",
      "items": ErrorResponseField,
      "type": "array"
    }
  },
  "required": [
    "error"
  ],
  "type": "object",
  "title": "error_response",
  "x-readme-ref-name": "error_response",
  "$schema": "https://json-schema.org/draft/2020-12/schema#"
} as const;
export default ErrorResponse
