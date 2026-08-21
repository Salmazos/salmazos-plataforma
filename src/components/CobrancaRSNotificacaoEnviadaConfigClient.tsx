"use client";

import { useState } from "react";

export interface AnalistaNotificacaoRow {
  analistaPerfilId: string;
  nomeCompleto: string;
  email: string;
  cargo: string | null;
  nivelAcesso: string | null;
  recebeNotificacao: boolean;
}

interface Props {
  enviadaIniciais: AnalistaNotificacaoRow[];
  vencidaIniciais: AnalistaNotificacaoRow[];
}

// Tabela de destinatários genérica, reaproveitada pelas duas seções abaixo — só muda a URL
// da rota de PATCH (cada categoria de notificação tem sua própria tabela no banco).
function TabelaDestinatarios({
  titulo,
  descricao,
  analistasIniciais,
  patchUrlBase,
}: {
  titulo: string;
  descricao: string;
  analistasIniciais: AnalistaNotificacaoRow[];
  patchUrlBase: string;
}) {
  const [analistas, setAnalistas] = useState(analistasIniciais);

  const handleToggle = async (analistaPerfilId: string, ativo: boolean) => {
    setAnalistas((prev) =>
      prev.map((a) => (a.analistaPerfilId === analistaPerfilId ? { ...a, recebeNotificacao: ativo } : a))
    );
    try {
      const res = await fetch(`${patchUrlBase}/${analistaPerfilId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAnalistas((prev) =>
        prev.map((a) => (a.analistaPerfilId === analistaPerfilId ? { ...a, recebeNotificacao: !ativo } : a))
      );
    }
  };

  return (
    <div className="card mb-6">
      <p className="section-title mb-1">{titulo}</p>
      <p className="text-xs text-gray-400 mb-4">{descricao}</p>

      {analistas.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Nenhum analista ativo encontrado.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                {["Nome", "E-mail", "Cargo", "Nível", "Recebe notificação"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analistas.map((a) => (
                <tr key={a.analistaPerfilId} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "#111827" }}>{a.nomeCompleto}</td>
                  <td style={{ padding: "8px 12px", color: "#374151" }}>{a.email}</td>
                  <td style={{ padding: "8px 12px", color: "#374151" }}>{a.cargo ?? "—"}</td>
                  <td style={{ padding: "8px 12px", color: "#374151", textTransform: "capitalize" }}>{a.nivelAcesso ?? "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={a.recebeNotificacao}
                        onChange={(e) => handleToggle(a.analistaPerfilId, e.target.checked)}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Duas seções independentes — cada popup (Cobrança Enviada / Fatura Vencida) tem sua própria
// lista de destinatários configurável (analista pode receber um, os dois, ou nenhum).
export default function CobrancaRSNotificacaoEnviadaConfigClient({ enviadaIniciais, vencidaIniciais }: Props) {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Notificações de Cobrança R&S</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quem marcado em cada lista abaixo recebe um popup em tela pro respectivo evento — independente de
          ter acesso pra revisar cobranças.
        </p>
      </div>

      <TabelaDestinatarios
        titulo="Cobrança Enviada"
        descricao="Popup exibido sempre que uma Cobrança R&S for aprovada e enviada ao cliente. Só aparecem aqui analistas ativos."
        analistasIniciais={enviadaIniciais}
        patchUrlBase="/api/configuracoes/cobranca-rs-notificacao-enviada"
      />

      <TabelaDestinatarios
        titulo="Fatura Vencida"
        descricao="Popup exibido todo dia que uma cobrança enviada ao cliente continuar com o vencimento no passado, ainda não paga. Só aparecem aqui analistas ativos."
        analistasIniciais={vencidaIniciais}
        patchUrlBase="/api/configuracoes/cobranca-rs-notificacao-vencida"
      />
    </div>
  );
}
