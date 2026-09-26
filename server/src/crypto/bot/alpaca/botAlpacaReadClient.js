import axios from "axios";

const BASE = "https://paper-api.alpaca.markets";
function headers() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error("ALPACA_PAPER_CREDENTIALS_MISSING");
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, Accept: "application/json" };
}
export async function alpacaPaperGet(endpoint, params = {}) {
  if (typeof endpoint !== "string" || !/^\/v2\/(account|assets|positions|orders)(?:[/?]|$)/.test(endpoint)) {
    throw new Error("ALPACA_READ_ENDPOINT_NOT_ALLOWED");
  }
  const response = await axios.get(`${BASE}${endpoint}`, { headers: headers(), params, timeout: 15000 });
  return response.data;
}
