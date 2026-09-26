function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPrice(value) {
  const price = finiteOrNull(value);
  return price === null ? "N/A" : `$${price.toFixed(2)}`;
}

function formatScore(value) {
  const score = finiteOrNull(value);
  return score === null ? "N/A" : score.toFixed(Number.isInteger(score) ? 0 : 2);
}

export default function MarketScannerTable({
  rows = [],
  onSelect,
  selectedSymbol,
}) {
  const candidates = Array.isArray(rows) ? rows : [];

  return (
    <section className="panel scanner-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Autonomous discovery</p>
          <h2>Market Scanner</h2>
        </div>
        <span className="muted-chip">{candidates.length} candidates</span>
      </div>

      <div className="table-wrap">
        <table className="scanner-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Direction</th>
              <th>Score</th>
              <th>Price</th>
              <th>Authority</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((row, index) => {
              if (!row || typeof row !== "object") return null;
              const score = finiteOrNull(row.score);
              const auto = score !== null && score >= 80;
              const selected = row.symbol === selectedSymbol;
              const direction = String(row.direction ?? "").toUpperCase();
              const directionLabel = direction === "LONG" ? "BULL" : direction === "SHORT" ? "BEAR" : direction || "N/A";
              const directionClass = direction === "SHORT" || direction === "BEAR" ? "short" : direction === "LONG" || direction === "BULL" ? "long" : "neutral";

              return (
                <tr
                  className={selected ? "selected-row" : ""}
                  key={row.symbol ?? `candidate-${index}`}
                  onClick={() => onSelect?.(row)}
                >
                  <td>
                    <strong>{row.symbol ?? "N/A"}</strong>
                    <span>{row.name ?? ""}</span>
                  </td>
                  <td>
                    <span className={`trade-badge small ${directionClass}`}>
                      {directionLabel}
                    </span>
                  </td>
                  <td><strong>{formatScore(row.score)}</strong></td>
                  <td>{formatPrice(row.price)}</td>
                  <td>
                    <span className={`authority-chip ${auto ? "auto" : "manual"}`}>
                      {auto ? "AUTO" : "HUMAN ONLY"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
