const ErrorResponseField = {
  "properties": {
    "name": {
      "description": "Name of the request field",
      "type": "string"
    }
  },
  "required": [
    "name"
  ],
  "type": "object",
  "title": "error_response_field",
  "x-readme-ref-name": "error_response_field"
} as const;
export default ErrorResponseField
