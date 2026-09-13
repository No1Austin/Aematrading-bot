// client/src/components/EngineStatusBadge.jsx

export default function EngineStatusBadge({
  status,
  direction,
}) {
  const text =
    String(
      status ??
      direction ??
      "UNKNOWN",
    ).toUpperCase();

  let tone =
    "neutral";

  if (
    text.includes("BULL") ||
    text === "LONG" ||
    text.includes("COMPLETE")
  ) {
    tone =
      "bullish";
  } else if (
    text.includes("BEAR") ||
    text === "SHORT"
  ) {
    tone =
      "bearish";
  } else if (
    text.includes("BLOCK") ||
    text.includes("ERROR")
  ) {
    tone =
      "blocked";
  } else if (
    text.includes("INSUFFICIENT") ||
    text.includes("WAIT") ||
    text.includes("UNKNOWN")
  ) {
    tone =
      "insufficient";
  }

  return (
    <span
      className={`engine-status-badge ${tone}`}
    >
      {text.replaceAll("_", " ")}
    </span>
  );
}
