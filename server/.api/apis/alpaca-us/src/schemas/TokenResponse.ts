const TokenResponse = {
  "properties": {
    "access_token": {
      "description": "Access token",
      "type": "string"
    },
    "expires_in": {
      "description": "Time in seconds until the token expires",
      "type": "integer",
      "examples": [
        900
      ]
    },
    "refresh_token": {
      "description": "Refresh token",
      "type": "string"
    },
    "token_type": {
      "description": "Type of the token (e.g., Bearer)\n\n`Bearer`",
      "enum": [
        "Bearer"
      ],
      "type": "string"
    }
  },
  "required": [
    "access_token",
    "expires_in",
    "token_type"
  ],
  "type": "object",
  "title": "token_response",
  "x-readme-ref-name": "token_response",
  "$schema": "https://json-schema.org/draft/2020-12/schema#"
} as const;
export default TokenResponse
