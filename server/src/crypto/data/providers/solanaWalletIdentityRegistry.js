/**
 * AEMA — Solana Wallet / Protocol Identity Registry
 *
 * Conservative rule:
 * - A wallet/account owned by a KNOWN protocol program is infrastructure.
 * - Unknown program-owned accounts are only suspected, never auto-excluded.
 * - Ordinary System Program-owned wallets remain eligible.
 *
 * Research only.
 */

export const SOLANA_PROGRAMS = Object.freeze({
  SYSTEM: "11111111111111111111111111111111",
  TOKEN_LEGACY: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  TOKEN_2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  PUMP_AMM: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
});

const KNOWN_PROTOCOL_OWNERS = new Map([
  [SOLANA_PROGRAMS.PUMP_AMM, {
    protocol: "PUMPSWAP",
    role: "AMM_PROTOCOL_ACCOUNT",
    confidence: 100,
  }],
]);

export function classifySolanaAccountIdentity(account) {
  if (!account) {
    return {
      classification: "UNKNOWN",
      infrastructure: null,
      excludeFromWalletFlow: false,
      confidence: 0,
      reasons: ["ACCOUNT_INFO_UNAVAILABLE"],
    };
  }

  const owner = account.ownerProgram ?? null;

  if (owner === SOLANA_PROGRAMS.SYSTEM) {
    return {
      classification: "USER_OR_SYSTEM_ACCOUNT",
      infrastructure: false,
      excludeFromWalletFlow: false,
      confidence: 90,
      reasons: ["SYSTEM_PROGRAM_OWNED"],
    };
  }

  const known = KNOWN_PROTOCOL_OWNERS.get(owner);
  if (known) {
    return {
      classification: known.role,
      protocol: known.protocol,
      infrastructure: true,
      excludeFromWalletFlow: true,
      confidence: known.confidence,
      reasons: [`KNOWN_PROTOCOL_OWNER:${known.protocol}`, `OWNER_PROGRAM:${owner}`],
    };
  }

  if (account.executable === true) {
    return {
      classification: "EXECUTABLE_PROGRAM",
      infrastructure: true,
      excludeFromWalletFlow: true,
      confidence: 100,
      reasons: ["ACCOUNT_IS_EXECUTABLE", `OWNER_PROGRAM:${owner ?? "UNKNOWN"}`],
    };
  }

  if (owner && owner !== SOLANA_PROGRAMS.SYSTEM) {
    return {
      classification: "PROGRAM_OWNED_ACCOUNT_UNVERIFIED",
      infrastructure: null,
      excludeFromWalletFlow: false,
      confidence: 40,
      reasons: [`NON_SYSTEM_OWNER:${owner}`],
    };
  }

  return {
    classification: "UNKNOWN",
    infrastructure: null,
    excludeFromWalletFlow: false,
    confidence: 20,
    reasons: [],
  };
}

export default {
  SOLANA_PROGRAMS,
  classifySolanaAccountIdentity,
};
