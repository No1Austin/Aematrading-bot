const BASE = `${
  (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "")
}/api/crypto/bot`;

export async function getDedicatedAlpacaOverview() {
  const response = await fetch(`${BASE}/alpaca/overview`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  const type = response.headers.get("content-type") || "";

  if (!type.includes("application/json")) {
    throw new Error(
      `API routing error: ${response.status} ${response.url}`
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Alpaca account unavailable");
  }

  return data;
}