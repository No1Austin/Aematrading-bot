function scoreClass(score) {
  if (score >= 80) return "score-good";
  if (score >= 60) return "score-mid";
  return "score-low";
}

export default function ScoreCard({
  symbol,
  score,
  direction,
  price,
  change,
}) {
  const autoEligible = score >= 80;

  return (
    <section className="panel score-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Current setup</p>
          <h2>{symbol}</h2>
        </div>

        <div className={`trade-badge ${direction === "SHORT" ? "short" : "long"}`}>
          {direction}
        </div>
      </div>

      <div className="score-card-body">
        <div className={`score-ring ${scoreClass(score)}`}>
          <span className="score-number">{score}</span>
          <span className="score-denominator">/100</span>
        </div>

        <div className="price-block">
          <span>Reference price</span>
          <strong>${Number(price).toFixed(2)}</strong>
          <small className={change >= 0 ? "positive" : "negative"}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </small>
        </div>
      </div>

      <div className={`authority-banner ${autoEligible ? "auto" : "manual"}`}>
        <strong>
          {autoEligible ? "AUTONOMOUSLY ELIGIBLE" : "HUMAN AUTHORIZATION REQUIRED"}
        </strong>
        <span>
          {autoEligible
            ? "Score is inside the engine's 80–100 autonomous execution band."
            : "Score is below 80. The bot cannot enter without a human override."}
        </span>
      </div>
    </section>
  );
}
