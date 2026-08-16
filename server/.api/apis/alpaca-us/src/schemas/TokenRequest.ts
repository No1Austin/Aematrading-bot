import ClientId from './ClientId.js';

const TokenRequest = {
  "properties": {
    "client_assertion": {
      "description": "Client assertion JWT (if using private_key_jwt)",
      "maxLength": 16384,
      "type": "string"
    },
    "client_assertion_type": {
      "description": "Client assertion type (if using private_key_jwt)",
      "enum": [
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
      ],
      "type": "string"
    },
    "client_id": ClientId,
    "client_secret": {
      "description": "Client secret (if using client_secret)",
      "maxLength": 128,
      "type": "string",
      "examples": [
        "MFRGGZDFMZTWQYLCMNSGKZTHNBQWEY3EMVTGO2DBMJRWIZLGM5UGCYTDMRSWMZ3I"
      ]
    },
    "grant_type": {
      "description": "Grant type",
      "enum": [
        "client_credentials",
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "refresh_token"
      ],
      "type": "string"
    }
  },
  "required": [
    "grant_type"
  ],
  "type": "object",
  "title": "token_request",
  "x-readme-ref-name": "token_request",
  "$schema": "https://json-schema.org/draft/2020-12/schema#"
} as const;
export default TokenRequest
