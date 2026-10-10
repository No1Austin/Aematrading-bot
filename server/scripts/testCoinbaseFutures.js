/**
 * AEMA Coinbase International Futures
 * Connectivity Test
 *
 * Public market data only.
 * No authentication.
 * No order execution.
 */

const BASE_URL =
  "https://api.international.coinbase.com/api/v1";

async function testEndpoint(name, path) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    12000
  );

  try {
    const response = await fetch(
      `${BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    const body = await response.text();

    let data;

    try {
      data = JSON.parse(body);
    } catch {
      data = null;
    }

    console.log(`\n[${name}]`);

    console.log("HTTP:", response.status);

    console.log(
      "Response:",
      JSON.stringify(data ?? body.slice(0, 300))
        .slice(0, 1200)
    );

    return {
      name,
      success: response.ok,
      status: response.status,
    };
  } catch (error) {
    console.error(
      `[${name}] FAILED:`,
      error.message
    );

    return {
      name,
      success: false,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log(
    "\nAEMA COINBASE FUTURES CONNECTIVITY TEST"
  );

  console.log("Started:", new Date().toISOString());

  const results = [];

  results.push(
    await testEndpoint(
      "FUTURES INSTRUMENTS",
      "/instruments"
    )
  );

  results.push(
    await testEndpoint(
      "BTC PERPETUAL",
      "/instruments/BTC-PERP"
    )
  );

  results.push(
    await testEndpoint(
      "BTC PERPETUAL QUOTE",
      "/instruments/BTC-PERP/quote"
    )
  );

  console.log("\nTEST SUMMARY");

  console.table(results);

  console.log(
    "\nNo trading operations performed."
  );
}

main().catch(console.error);