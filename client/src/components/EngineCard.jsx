// client/src/components/EngineCard.jsx

import {
  GripVertical,
  MoreVertical,
} from "lucide-react";

import EngineStatusBadge from "./EngineStatusBadge.jsx";

function clamp(
  value,
  min,
  max,
) {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}

export default function EngineCard({
  engine,
  onOpen,
  draggable = true,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  const score =
    Number.isFinite(
      Number(
        engine.score,
      ),
    )
      ? Number(
          engine.score,
        )
      : null;

  const maximum =
    Number.isFinite(
      Number(
        engine.maximum,
      ),
    )
      ? Number(
          engine.maximum,
        )
      : null;

  const ratio =
    score !== null &&
    maximum !== null &&
    maximum > 0
      ? clamp(
          score / maximum,
          0,
          1,
        )
      : 0;

  const percent =
    engine.percent ??
    (
      score !== null &&
      maximum !== null &&
      maximum > 0
        ? Math.round(
            ratio * 100,
          )
        : null
    );

  return (
    <article
      className="engine-card"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => onOpen?.(engine)}
    >
      <div className="engine-card-header">
        <div className="engine-card-title-wrap">
          <div className="engine-icon-box">
            {engine.icon}
          </div>

          <div>
            <h3>
              {engine.name}
            </h3>

            <EngineStatusBadge
              status={engine.status}
              direction={engine.direction}
            />
          </div>
        </div>

        <div className="engine-card-actions">
          <GripVertical
            className="drag-handle"
            size={17}
          />

          <MoreVertical
            size={16}
          />
        </div>
      </div>

      <div className="engine-score-wrap">
        <div
          className="engine-gauge"
          style={{
            "--engine-progress":
              `${percent ?? 0}%`,
          }}
        >
          <div className="engine-gauge-inner">
            <strong>
              {percent === null
                ? "—"
                : `${percent}%`}
            </strong>

            <span>
              {score !== null &&
              maximum !== null
                ? `${score.toFixed(2)} / ${maximum}`
                : "No score"}
            </span>
          </div>
        </div>
      </div>

      <div className="engine-mini-chart">
        {(engine.sparkline ?? []).map(
          (
            value,
            index,
          ) => (
            <span
              key={`${engine.id}-${index}`}
              style={{
                height:
                  `${Math.max(
                    8,
                    Math.min(
                      100,
                      value,
                    ),
                  )}%`,
              }}
            />
          ),
        )}
      </div>

      <div className="engine-card-footer">
        <span>
          Weight
        </span>

        <strong>
          {engine.weightLabel ??
            "—"}
        </strong>
      </div>
    </article>
  );
}
