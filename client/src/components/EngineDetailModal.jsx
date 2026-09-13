// client/src/components/EngineDetailModal.jsx

import {
  X,
} from "lucide-react";

import EngineStatusBadge from "./EngineStatusBadge.jsx";

function DetailRow({
  label,
  value,
}) {
  return (
    <div className="engine-detail-row">
      <span>{label}</span>
      <strong>
        {value ?? "—"}
      </strong>
    </div>
  );
}

export default function EngineDetailModal({
  engine,
  onClose,
}) {
  if (!engine) {
    return null;
  }

  return (
    <div
      className="engine-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="engine-modal"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="engine-modal-header">
          <div>
            <p className="eyebrow">
              Engine breakdown
            </p>

            <h2>
              {engine.name}
            </h2>

            <EngineStatusBadge
              status={engine.status}
              direction={engine.direction}
            />
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="engine-modal-score">
          <div>
            <span>
              Current score
            </span>

            <strong>
              {engine.percent === null
                ? "—"
                : `${engine.percent}%`}
            </strong>
          </div>

          <div>
            <span>
              Contribution
            </span>

            <strong>
              {engine.score !== null &&
              engine.maximum !== null
                ? `${Number(
                    engine.score,
                  ).toFixed(
                    2,
                  )} / ${engine.maximum}`
                : "Unavailable"}
            </strong>
          </div>

          <div>
            <span>
              Direction
            </span>

            <strong>
              {engine.direction ??
                "UNKNOWN"}
            </strong>
          </div>
        </div>

        <section className="engine-modal-section">
          <h3>
            Score breakdown
          </h3>

          <div className="engine-detail-grid">
            {(engine.breakdown ?? []).map(
              (
                item,
              ) => (
                <DetailRow
                  key={item.label}
                  label={item.label}
                  value={item.value}
                />
              ),
            )}
          </div>
        </section>

        <section className="engine-modal-section">
          <h3>
            Evidence
          </h3>

          {(engine.evidence ?? []).length >
          0 ? (
            <div className="engine-evidence-list">
              {engine.evidence.map(
                (
                  item,
                  index,
                ) => (
                  <div
                    className="engine-evidence-item"
                    key={`${index}-${item}`}
                  >
                    <span className="status-dot online" />
                    <p>
                      {item}
                    </p>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="engine-modal-muted">
              No evidence available yet.
            </p>
          )}
        </section>

        <section className="engine-modal-section">
          <h3>
            Warnings
          </h3>

          {(engine.warnings ?? []).length >
          0 ? (
            <div className="engine-warning-list">
              {engine.warnings.map(
                (
                  warning,
                  index,
                ) => (
                  <div
                    className="engine-warning-item"
                    key={`${index}-${warning}`}
                  >
                    {warning}
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="engine-modal-muted">
              No warnings.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
