import {
  Building2,
  Database,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export default function InstitutionalPanel({
  institutional,
}) {
  return (
    <section className="panel institutional-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Smart-money context</p>
          <h2>Institutional Intelligence</h2>
        </div>
        <Building2 size={20} />
      </div>

      <div className="institutional-summary">
        <div>
          <span>Institutional bias</span>
          <strong>{institutional.bias}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{institutional.confidence}%</strong>
        </div>
      </div>

      <div className="source-card">
        <Database size={18} />
        <div>
          <strong>SEC EDGAR</strong>
          <span>{institutional.secStatus}</span>
        </div>
        <span className="status-dot online" />
      </div>

      <div className="source-card">
        <TrendingUp size={18} />
        <div>
          <strong>FINRA Reg SHO</strong>
          <span>{institutional.finraStatus}</span>
        </div>
        <span className="status-dot online" />
      </div>

      <div className="institutional-note">
        <ShieldCheck size={17} />
        <p>
          FINRA short-sale volume is treated as a positioning-pressure proxy,
          not as short interest or standalone institutional direction.
        </p>
      </div>
    </section>
  );
}
