const ClientId = {
  "description": "Client ID",
  "maxLength": 32,
  "minLength": 20,
  "pattern": "^[A-Z0-9]+$",
  "type": "string",
  "title": "client_id",
  "x-readme-ref-name": "client_id",
  "examples": [
    "AKSF5FVOKXYKG4ATGCJQBA"
  ]
} as const;
export default ClientId
