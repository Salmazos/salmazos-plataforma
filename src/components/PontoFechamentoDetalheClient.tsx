"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatarDataSemFuso } from "@/lib/utils";
import { ROTULO_OCORRENCIA_PONTO, type TipoOcorrenciaPonto } from "@/lib/pontoAnomalia";

interface DiaRow {
  id: string;
  ponto_funcionario_id: string;
  data: string;
  dia_semana: string | null;
  marcacoes: string[];
  nota_original: string | null;
  campos: Record<string, string>;
  fora_padrao: boolean;
  tipo_ocorrencia: TipoOcorrenciaPonto | null;
  justificativa_rh: string | null;
  status_decisao: string;
}

interface FuncionarioRow {
  id: string;
  funcionario_id: string | null;
  nome_planilha: string;
  ezepoint_codigo: string | null;
  cargo: string | null;
  data_admissao: string | null;
  totais: Record<string, string>;
  status_vinculo: "vinculado" | "pendente_vinculo" | "ignorado";
  dias: DiaRow[];
}

interface FuncionarioCliente {
  id: string;
  nome_completo: string;
}

interface Fechamento {
  id: string;
  cliente_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  status: string;
  arquivo_original_nome: string | null;
  criado_em: string;
  clientes: { nome: string } | null;
}

interface Props {
  fechamento: Fechamento;
  funcionarios: FuncionarioRow[];
  funcionariosDoCliente: FuncionarioCliente[];
  podeExcluir: boolean;
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  rascunho: { label: "Rascunho", bg: "#FEF3C7", text: "#92400E" },
  aguardando_aprovacao_cliente: { label: "Aguardando cliente", bg: "#DBEAFE", text: "#1D4ED8" },
  aprovado_cliente: { label: "Aprovado pelo cliente", bg: "#D1FAE5", text: "#166534" },
  enviado_contabilidade: { label: "Enviado à contabilidade", bg: "#E5E7EB", text: "#374151" },
};

const TIPOS_OCORRENCIA: TipoOcorrenciaPonto[] = [
  "atraso",
  "falta",
  "atestado_medico",
  "atestado_horas",
  "suspensao",
  "marcacao_incompleta",
  "outro",
];

export default function PontoFechamentoDetalheClient({ fechamento, funcionarios: funcionariosIniciais, funcionariosDoCliente, podeExcluir }: Props) {
  const [funcionarios, setFuncionarios] = useState(funcionariosIniciais);
  const [funcionarioAbertoId, setFuncionarioAbertoId] = useState<string | null>(
    funcionariosIniciais.find((f) => f.status_vinculo !== "ignorado")?.id ?? null
  );
  const [somenteForaPadrao, setSomenteForaPadrao] = useState(true);
  const [salvandoDiaId, setSalvandoDiaId] = useState<string | null>(null);
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState("");

  const funcionarioAberto = funcionarios.find((f) => f.id === funcionarioAbertoId) ?? null;
  const badge = STATUS_BADGE[fechamento.status] ?? { label: fechamento.status, bg: "#F3F4F6", text: "#374151" };
  const podeEditar = fechamento.status === "rascunho";

  const pendencias = useMemo(() => {
    const vinculosPendentes = funcionarios.filter((f) => f.status_vinculo === "pendente_vinculo").length;
    const diasSemJustificativa = funcionarios.reduce(
      (acc, f) => acc + f.dias.filter((d) => d.fora_padrao && !d.justificativa_rh?.trim()).length,
      0
    );
    return { vinculosPendentes, diasSemJustificativa };
  }, [funcionarios]);

  const atualizarDia = (funcionarioId: string, diaId: string, patch: Partial<DiaRow>) => {
    setFuncionarios((prev) =>
      prev.map((f) =>
        f.id !== funcionarioId ? f : { ...f, dias: f.dias.map((d) => (d.id === diaId ? { ...d, ...patch } : d)) }
      )
    );
  };

  const salvarDia = async (funcionarioId: string, dia: DiaRow, patch: Partial<DiaRow>) => {
    setSalvandoDiaId(dia.id);
    setErro("");
    const anterior = { ...dia };
    atualizarDia(funcionarioId, dia.id, patch);
    try {
      const res = await fetch(`/api/ponto/fechamentos/${fechamento.id}/dias/${dia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar.");
    } catch (err) {
      atualizarDia(funcionarioId, dia.id, anterior);
      setErro(err instanceof Error ? err.message : "Erro de conexão ao salvar o dia.");
    } finally {
      setSalvandoDiaId(null);
    }
  };

  const vincular = async (funcionarioPlanilhaId: string, funcionarioId: string | null, ignorar: boolean) => {
    setVinculandoId(funcionarioPlanilhaId);
    setErro("");
    try {
      const res = await fetch(`/api/ponto/fechamentos/${fechamento.id}/funcionarios/${funcionarioPlanilhaId}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funcionario_id: funcionarioId, ignorar }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao vincular.");
      setFuncionarios((prev) =>
        prev.map((f) =>
          f.id !== funcionarioPlanilhaId
            ? f
            : { ...f, funcionario_id: ignorar ? null : funcionarioId, status_vinculo: ignorar ? "ignorado" : "vinculado" }
        )
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro de conexão ao vincular.");
    } finally {
      setVinculandoId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <Link href="/painel/ponto" style={{ fontSize: 13, color: "#6B7280", textDecoration: "none" }}>
            ← Espelho de Ponto
          </Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{fechamento.clientes?.nome ?? "—"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatarDataSemFuso(fechamento.periodo_inicio)} a {formatarDataSemFuso(fechamento.periodo_fim)}
            {fechamento.arquivo_original_nome && <> · {fechamento.arquivo_original_nome}</>}
          </p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, background: badge.bg, color: badge.text }}>
          {badge.label}
        </span>
      </div>

      {(pendencias.vinculosPendentes > 0 || pendencias.diasSemJustificativa > 0) && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", margin: "12px 0", fontSize: 13, color: "#92400E" }}>
          {pendencias.vinculosPendentes > 0 && <span>{pendencias.vinculosPendentes} funcionário(s) sem vínculo confirmado. </span>}
          {pendencias.diasSemJustificativa > 0 && <span>{pendencias.diasSemJustificativa} dia(s) fora do padrão sem justificativa.</span>}
        </div>
      )}
      {erro && <p className="text-red-600 text-sm my-2">{erro}</p>}

      <div className="flex gap-4 mt-4" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ padding: 0, width: 300, flexShrink: 0 }}>
          {funcionarios.map((f, i) => {
            const diasForaPadrao = f.dias.filter((d) => d.fora_padrao);
            const semJustificativa = diasForaPadrao.filter((d) => !d.justificativa_rh?.trim()).length;
            return (
              <button
                key={f.id}
                onClick={() => setFuncionarioAbertoId(f.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  borderBottom: i < funcionarios.length - 1 ? "1px solid #F3F4F6" : "none",
                  background: f.id === funcionarioAbertoId ? "#EFF6FF" : "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: 0 }}>{f.nome_planilha}</p>
                <div className="flex items-center gap-2 mt-1">
                  {f.status_vinculo === "pendente_vinculo" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B" }}>
                      sem vínculo
                    </span>
                  )}
                  {f.status_vinculo === "ignorado" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280" }}>
                      ignorado
                    </span>
                  )}
                  {diasForaPadrao.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: semJustificativa > 0 ? "#FEF3C7" : "#D1FAE5", color: semJustificativa > 0 ? "#92400E" : "#166534" }}>
                      {diasForaPadrao.length} fora do padrão{semJustificativa > 0 ? ` · ${semJustificativa} pendente(s)` : ""}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="card flex-1" style={{ minWidth: 0 }}>
          {!funcionarioAberto ? (
            <p style={{ color: "#9CA3AF", textAlign: "center", padding: "40px 0" }}>Selecione um funcionário.</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{funcionarioAberto.nome_planilha}</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>
                    {funcionarioAberto.cargo ?? "—"}
                    {funcionarioAberto.ezepoint_codigo && <> · matrícula {funcionarioAberto.ezepoint_codigo}</>}
                  </p>
                </div>
                <label className="flex items-center gap-2" style={{ fontSize: 13, color: "#374151" }}>
                  <input type="checkbox" checked={somenteForaPadrao} onChange={(e) => setSomenteForaPadrao(e.target.checked)} />
                  Mostrar só dias fora do padrão
                </label>
              </div>

              {funcionarioAberto.status_vinculo === "pendente_vinculo" && (
                <VinculoPendente
                  disabled={!podeEditar || vinculandoId === funcionarioAberto.id}
                  funcionariosDoCliente={funcionariosDoCliente}
                  onVincular={(fid) => vincular(funcionarioAberto.id, fid, false)}
                  onIgnorar={() => vincular(funcionarioAberto.id, null, true)}
                />
              )}
              {funcionarioAberto.status_vinculo === "ignorado" && podeEditar && (
                <div style={{ background: "#F3F4F6", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#374151" }}>
                  Ignorado — este registro do EzePoint não será considerado no espelho de ponto deste cliente.{" "}
                  <button onClick={() => vincular(funcionarioAberto.id, null, false)} className="text-blue-600" style={{ textDecoration: "underline" }}>
                    Desfazer
                  </button>
                </div>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                    <th style={thStyle}>Data</th>
                    <th style={thStyle}>Marcações</th>
                    <th style={thStyle}>Observação original</th>
                    <th style={thStyle}>Ocorrência</th>
                    <th style={thStyle}>Justificativa (RH)</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionarioAberto.dias
                    .filter((d) => !somenteForaPadrao || d.fora_padrao)
                    .map((d) => (
                      <LinhaDia
                        key={d.id}
                        dia={d}
                        podeEditar={podeEditar}
                        salvando={salvandoDiaId === d.id}
                        onSalvar={(patch) => salvarDia(funcionarioAberto.id, d, patch)}
                      />
                    ))}
                </tbody>
              </table>
              {funcionarioAberto.dias.filter((d) => !somenteForaPadrao || d.fora_padrao).length === 0 && (
                <p style={{ color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>Nenhum dia fora do padrão neste funcionário.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {podeExcluir && fechamento.status === "rascunho" && (
        <div className="mt-4">
          <button
            disabled={excluindo}
            onClick={async () => {
              if (!confirm("Excluir este fechamento e todos os dados importados? Essa ação não pode ser desfeita.")) return;
              setExcluindo(true);
              try {
                const res = await fetch(`/api/ponto/fechamentos/${fechamento.id}`, { method: "DELETE" });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Erro ao excluir.");
                window.location.href = "/painel/ponto";
              } catch (err) {
                setErro(err instanceof Error ? err.message : "Erro de conexão ao excluir.");
                setExcluindo(false);
              }
            }}
            className="text-red-600"
            style={{ fontSize: 13, background: "none", border: "none", cursor: "pointer" }}
          >
            {excluindo ? "Excluindo..." : "Excluir este fechamento"}
          </button>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 10px", color: "#6B7280", fontWeight: 700, fontSize: 11, textTransform: "uppercase" };

function VinculoPendente({
  disabled,
  funcionariosDoCliente,
  onVincular,
  onIgnorar,
}: {
  disabled: boolean;
  funcionariosDoCliente: FuncionarioCliente[];
  onVincular: (funcionarioId: string) => void;
  onIgnorar: () => void;
}) {
  const [selecionado, setSelecionado] = useState("");
  return (
    <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
      <p style={{ fontSize: 13, color: "#991B1B", fontWeight: 600, marginBottom: 8 }}>
        Não foi possível vincular automaticamente este nome a um único funcionário cadastrado deste cliente.
      </p>
      <div className="flex items-center gap-2">
        <select value={selecionado} onChange={(e) => setSelecionado(e.target.value)} className="input-field" style={{ maxWidth: 280 }} disabled={disabled}>
          <option value="">Selecione o funcionário...</option>
          {funcionariosDoCliente.map((f) => (
            <option key={f.id} value={f.id}>{f.nome_completo}</option>
          ))}
        </select>
        <button disabled={disabled || !selecionado} onClick={() => onVincular(selecionado)} className="btn-primary">
          Vincular
        </button>
        <button disabled={disabled} onClick={onIgnorar} className="btn-outline">
          Ignorar (não é deste cliente)
        </button>
      </div>
    </div>
  );
}

function LinhaDia({
  dia,
  podeEditar,
  salvando,
  onSalvar,
}: {
  dia: DiaRow;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (patch: Partial<DiaRow>) => void;
}) {
  const [marcacoesTexto, setMarcacoesTexto] = useState((dia.marcacoes ?? []).join(", "));
  const [tipoOcorrencia, setTipoOcorrencia] = useState<TipoOcorrenciaPonto | "">(dia.tipo_ocorrencia ?? "");
  const [justificativa, setJustificativa] = useState(dia.justificativa_rh ?? "");

  return (
    <tr style={{ borderBottom: "1px solid #F3F4F6", background: dia.fora_padrao ? "#FFFBEB" : "transparent" }}>
      <td style={tdStyle}>
        <p style={{ margin: 0, fontWeight: 600 }}>{formatarDataSemFuso(dia.data)}</p>
        <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF" }}>{dia.dia_semana}</p>
      </td>
      <td style={tdStyle}>
        <input
          value={marcacoesTexto}
          disabled={!podeEditar}
          onChange={(e) => setMarcacoesTexto(e.target.value)}
          onBlur={() => {
            const marcacoes = marcacoesTexto.split(",").map((m) => m.trim()).filter(Boolean);
            onSalvar({ marcacoes });
          }}
          className="input-field"
          style={{ fontSize: 12, padding: "4px 8px", minWidth: 160 }}
          placeholder="07:38, 12:00, 13:00, 17:00"
        />
      </td>
      <td style={{ ...tdStyle, color: "#6B7280" }}>{dia.nota_original || "—"}</td>
      <td style={tdStyle}>
        <select
          value={tipoOcorrencia}
          disabled={!podeEditar}
          onChange={(e) => {
            const valor = (e.target.value || null) as TipoOcorrenciaPonto | null;
            setTipoOcorrencia(valor ?? "");
            onSalvar({ tipo_ocorrencia: valor });
          }}
          className="input-field"
          style={{ fontSize: 12, padding: "4px 8px" }}
        >
          <option value="">—</option>
          {TIPOS_OCORRENCIA.map((t) => (
            <option key={t} value={t}>{ROTULO_OCORRENCIA_PONTO[t]}</option>
          ))}
        </select>
      </td>
      <td style={tdStyle}>
        <textarea
          value={justificativa}
          disabled={!podeEditar}
          onChange={(e) => setJustificativa(e.target.value)}
          onBlur={() => onSalvar({ justificativa_rh: justificativa || null })}
          className="input-field"
          style={{ fontSize: 12, padding: "4px 8px", minWidth: 220, minHeight: 32 }}
          rows={1}
        />
        {salvando && <span style={{ fontSize: 11, color: "#9CA3AF" }}>salvando...</span>}
      </td>
    </tr>
  );
}

const tdStyle: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };
