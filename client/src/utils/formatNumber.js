export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number.toFixed(decimals)
    : "N/A";
}