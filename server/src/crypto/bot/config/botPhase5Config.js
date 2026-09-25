export const BOT_PHASE5_CONFIG = Object.freeze({
  persistence: {
    ledgerPath: process.env.AEMA_BOT_LEDGER_PATH || "./data/aema-bot-paper-ledger.json",
  },
  consistency: {
    intervalMs: 60_000,
    weakenedRatio: 0.78,
    strengthenedRatio: 1.12,
    invalidatedRatio: 0.55,
    directionFlipExit: true,
    reduceFraction: 0.35,
    addFraction: 0.25,
    maximumAddsPerPosition: 2,
    minimumMinutesBetweenAdds: 10,
    maximumPositionNotionalPercent: 35,
  },
});
export default BOT_PHASE5_CONFIG;
