export const BOT_PHASE7_CONFIG = Object.freeze({
  portfolio: {
    maximumOpenPositions: 3,
    blockConcurrentSameSymbol: true,
    refillEmptySlotsFromRuntime: true,
  },
  trailing: {
    enabled: true,
    activationR: 1.0,
    atrMultiplier: 1.5,
    structureBufferAtr: 0.25,
    moveToBreakevenAtR: 1.0,
    // The original target becomes a profit-protection milestone, not an automatic exit.
    originalTargetActivatesTrailing: true,
  },
  runtime: {
    printEveryCycle: true,
  },
});
export default BOT_PHASE7_CONFIG;
