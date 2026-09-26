export const BOT_EXECUTION_MODES = Object.freeze({
  INTERNAL_PAPER: "INTERNAL_PAPER",
  ALPACA_PAPER: "ALPACA_PAPER",
});

export function getBotExecutionMode() {
  const mode = (
    process.env.AEMA_BOT_EXECUTION_MODE ||
    BOT_EXECUTION_MODES.INTERNAL_PAPER
  ).trim().toUpperCase();

  if (!Object.values(BOT_EXECUTION_MODES).includes(mode)) {
    throw new Error("INVALID_BOT_EXECUTION_MODE");
  }
  return mode;
}

export function assertInternalPaperMode() {
  const mode = getBotExecutionMode();
  if (mode !== BOT_EXECUTION_MODES.INTERNAL_PAPER) {
    throw new Error(
      "ALPACA_EXECUTION_NOT_ENABLED: Dedicated Alpaca execution and position management are required."
    );
  }
  return mode;
}

export default getBotExecutionMode;
