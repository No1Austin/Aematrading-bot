import type { FromSchema } from '@readme/api-core/types';
import type * as schemas from './schemas.js';

export type ClientId = FromSchema<typeof schemas.ClientId>;
export type ErrorCode = FromSchema<typeof schemas.ErrorCode>;
export type ErrorResponse = FromSchema<typeof schemas.ErrorResponse>;
export type ErrorResponseField = FromSchema<typeof schemas.ErrorResponseField>;
export type TokenRequest = FromSchema<typeof schemas.TokenRequest>;
export type TokenResponse = FromSchema<typeof schemas.TokenResponse>;
