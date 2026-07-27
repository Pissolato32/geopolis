// Tab5Archive — Presidential Reserved Archive (classified covert ops).

import type { IPresidentialBriefing } from "./briefingTypes.js";

interface Props {
  briefing: IPresidentialBriefing;
}

function statusClass(status: string): string {
  if (status.includes("ATIVA")) return "archive-active";
  if (status.includes("CONCLUIDO")) return "archive-done";
  if (status.includes("PAUSADO")) return "archive-paused";
  if (status.includes("STANDBY")) return "archive-standby";
  return "archive-unknown";
}

export function Tab5Archive({ briefing }: Props) {
  return (
    <div className="archive-tab">
      <div className="archive-header">
        <span className="archive-classified-banner">ARQUIVO RESERVADO · CLASSIFICADO</span>
        <h3 className="section-heading">Operações Presidenciais Classificadas</h3>
        <p className="archive-disclaimer">
          Acesso restrito ao Comandante-em-Chefe e ao Gabinete de Segurança Institucional.
          Distribuição sujeita a protocolo sigiloso.
        </p>
      </div>

      <div className="archive-list">
        {briefing.reservedArchive.map((op, i) => (
          <div key={i} className={`archive-card ${statusClass(op.status)}`}>
            <div className="archive-card-header">
              <span className="archive-codename">{op.codename}</span>
              <span className={`archive-status ${statusClass(op.status)}`}>{op.status}</span>
            </div>
            <p className="archive-details">{op.details}</p>
            <div className="archive-footer">
              <span className="archive-id">OPS-{String(i + 1).padStart(3, "0")}</span>
              <span className="archive-cls">ULTRASSECRETO</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
