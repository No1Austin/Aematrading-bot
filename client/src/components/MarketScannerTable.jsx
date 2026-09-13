export default function MarketScannerTable({
  rows,
  onSelect,
  selectedSymbol,
}) {
  return (
    <section className="panel scanner-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Autonomous discovery</p>
          <h2>Market Scanner</h2>
        </div>
        <span className="muted-chip">{rows.length} candidates</span>
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
            {rows.map((row) => {
              const auto = row.score >= 80;
              const selected = row.symbol === selectedSymbol;

              return (
                <tr
                  className={selected ? "selected-row" : ""}
                  key={row.symbol}
                  onClick={() => onSelect?.(row)}
                >
                  <td>
                    <strong>{row.symbol}</strong>
                    <span>{row.name}</span>
                  </td>
                  <td>
                    <span className={`trade-badge small ${row.direction === "SHORT" ? "short" : "long"}`}>
                      {row.direction}
                    </span>
                  </td>
                  <td>
                    <strong>{row.score}</strong>
                  </td>
                  <td>${row.price.toFixed(2)}</td>
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
