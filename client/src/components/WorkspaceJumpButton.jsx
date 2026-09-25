import {
  ArrowUpRight,
  BarChart3,
  Bitcoin,
} from "lucide-react";

import {
  Link,
} from "react-router-dom";

export default function WorkspaceJumpButton({
  target = "crypto",
}) {
  const crypto =
    target === "crypto";

  const destination =
    crypto
      ? "/crypto"
      : "/dashboard";

  const Icon =
    crypto
      ? Bitcoin
      : BarChart3;

  return (
    <Link
      to={destination}
      className={[
        "workspace-jump-button",
        crypto
          ? "workspace-jump-button--crypto"
          : "workspace-jump-button--stocks",
      ].join(" ")}
      aria-label={
        crypto
          ? "Open Crypto Dashboard"
          : "Return to Stock Dashboard"
      }
    >
      <span className="workspace-jump-button__icon">
        <Icon size={19} strokeWidth={2} />
      </span>

      <span className="workspace-jump-button__copy">
        <small>
          {crypto
            ? "Switch workspace"
            : "Back to markets"}
        </small>

        <strong>
          {crypto
            ? "Crypto Dashboard"
            : "Stock Dashboard"}
        </strong>
      </span>

      <span className="workspace-jump-button__arrow">
        <ArrowUpRight size={17} />
      </span>
    </Link>
  );
}
