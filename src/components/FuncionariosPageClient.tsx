"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatarDataSemFuso } from "@/lib/utils";
import { calcularStatusAso, ASO_STATUS_INFO } from "@/lib/asoStatus";
import ModalAdicionarFuncionario from "./ModalAdicionarFuncionario";
import ModalLancarRescisao from "./ModalLancarRescisao";

export interface FuncionarioRow {
  id: string;
  admissao_id: string | null;
  cliente_id: string | null;
  nome_completo: string;
  cargo: string | null;
  empresa: string | null;
  data_admissao: string | null;
  status: string;
  criado_em: string;
  clientes: { nome: string } | null;
  aso_data_exame_mais_recente: string | null;
  tipo_servico: string | null;
}

interface ClienteOption {
  id: string;
  nome: string;
}

interface Props {
  funcionariosIniciais: FuncionarioRow[];
  clientes: ClienteOption[];
  clientesFiltro: ClienteOption[];
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ativo: { label: "Ativo", bg: "#D1FAE5", text: "#166534" },
  desligado: { label: "Desligado", bg: "#FEE2E2", text: "#991B1B" },
};

// Mesmo padrão visual de badge de modalidade já usado em Admissões (MODALIDADE_LABEL/
// AdmissoesClient) — mas com chaves próprias, porque funcionarios.tipo_servico usa os
// valores "mao_obra_temporaria"/"terceirizacao" (iguais a vagas.tipo_servico), diferente
// de admissoes.modalidade ("MOT"/"terceirizacao"). Cores distintas (azul/roxo) pra
// diferenciar MOT de Terceirização de relance na tabela.
const MODALIDADE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  mao_obra_temporaria: { label: "MOT", bg: "#EFF6FF", text: "#1D4ED8" },
  terceirizacao: { label: "Terc.", bg: "#F5F3FF", text: "#6D28D9" },
};

// Sentinela pro filtro de modalidade quando o card de aviso é clicado — não é um valor
// real de tipo_servico, só um marcador pra filtrados() saber que deve mostrar quem está
// com tipo_servico nulo (resíduo de antes da validação obrigatória existir).
const SEM_MODALIDADE = "__sem_modalidade__";

export default function FuncionariosPageClient({ funcionariosIniciais, clientes, clientesFiltro }: Props) {
  const router = useRouter();
  const [filtroStatus, setFiltroStatus] = useState<string>("ativo");
  const [filtroClienteId, setFiltroClienteId] = useState<string>("");
  const [filtroModalidade, setFiltroModalidade] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [funcionarioRescisao, setFuncionarioRescisao] = useState<FuncionarioRow | null>(null);

  // Contagem por modalidade sempre sobre ativos "atuais" (independente dos filtros da
  // tela) — mesmo raciocínio dos cards de resumo em Admissões (CARDS_RESUMO), que também
  // contam sobre a lista cheia, não sobre o resultado já filtrado.
  const ativos = useMemo(() => funcionariosIniciais.filter((f) => f.status === "ativo"), [funcionariosIniciais]);
  const totalAtivos = ativos.length;
  const totalMot = useMemo(() => ativos.filter((f) => f.tipo_servico === "mao_obra_temporaria").length, [ativos]);
  const totalTerc = useMemo(() => ativos.filter((f) => f.tipo_servico === "terceirizacao").length, [ativos]);
  const totalSemModalidade = useMemo(() => ativos.filter((f) => !f.tipo_servico).length, [ativos]);

  const filtrados = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return funcionariosIniciais.filter((f) => {
      if (filtroStatus !== "todos" && f.status !== filtroStatus) return false;
      if (filtroClienteId && f.cliente_id !== filtroClienteId) return false;
      if (filtroModalidade === SEM_MODALIDADE) {
        if (f.tipo_servico) return false;
      } else if (filtroModalidade && f.tipo_servico !== filtroModalidade) return false;
      if (buscaLower && !f.nome_completo.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
  }, [funcionariosIniciais, filtroStatus, filtroClienteId, filtroModalidade, busca]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Funcionários</h1>
        <button onClick={() => setModalAberto(true)} className="btn-primary">
          + Adicionar funcionário manualmente
        </button>
      </div>

      {/* Cards de contagem por modalidade — sobre os ativos atuais, clicáveis como
          atalho de filtro (mesmo padrão dos cards de resumo em Admissões). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => setFiltroModalidade("")}
          style={{
            textAlign: "left",
            background: "#F9FAFB",
            border: filtroModalidade === "" ? "2px solid #374151" : "2px solid transparent",
            borderRadius: 12,
            padding: "14px 16px",
            cursor: "pointer",
          }}
        >
          <p style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0 }}>{totalAtivos}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#111827", margin: "2px 0 0" }}>Total de funcionários</p>
        </button>
        <button
          onClick={() => setFiltroModalidade(filtroModalidade === "mao_obra_temporaria" ? "" : "mao_obra_temporaria")}
          style={{
            textAlign: "left",
            background: MODALIDADE_BADGE.mao_obra_temporaria.bg,
            border: filtroModalidade === "mao_obra_temporaria" ? `2px solid ${MODALIDADE_BADGE.mao_obra_temporaria.text}` : "2px solid transparent",
            borderRadius: 12,
            padding: "14px 16px",
            cursor: "pointer",
          }}
        >
          <p style={{ fontSize: 26, fontWeight: 800, color: MODALIDADE_BADGE.mao_obra_temporaria.text, margin: 0 }}>{totalMot}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: MODALIDADE_BADGE.mao_obra_temporaria.text, margin: "2px 0 0" }}>MOT</p>
        </button>
        <button
          onClick={() => setFiltroModalidade(filtroModalidade === "terceirizacao" ? "" : "terceirizacao")}
          style={{
            textAlign: "left",
            background: MODALIDADE_BADGE.terceirizacao.bg,
            border: filtroModalidade === "terceirizacao" ? `2px solid ${MODALIDADE_BADGE.terceirizacao.text}` : "2px solid transparent",
            borderRadius: 12,
            padding: "14px 16px",
            cursor: "pointer",
          }}
        >
          <p style={{ fontSize: 26, fontWeight: 800, color: MODALIDADE_BADGE.terceirizacao.text, margin: 0 }}>{totalTerc}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: MODALIDADE_BADGE.terceirizacao.text, margin: "2px 0 0" }}>Terceirização</p>
        </button>
        {totalSemModalidade > 0 && (
          <button
            onClick={() => setFiltroModalidade(filtroModalidade === SEM_MODALIDADE ? "" : SEM_MODALIDADE)}
            style={{
              textAlign: "left",
              background: "#FFFBEB",
              border: filtroModalidade === SEM_MODALIDADE ? "2px solid #B45309" : "2px solid transparent",
              borderRadius: 12,
              padding: "14px 16px",
              cursor: "pointer",
            }}
          >
            <p style={{ fontSize: 26, fontWeight: 800, color: "#B45309", margin: 0 }}>⚠ {totalSemModalidade}</p>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#B45309", margin: "2px 0 0" }}>Sem modalidade definida</p>
          </button>
        )}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome..."
          className="input-field"
          style={{ maxWidth: 240 }}
        />
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="input-field" style={{ maxWidth: 200 }}>
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="desligado">Desligado</option>
        </select>
        <select value={filtroClienteId} onChange={(e) => setFiltroClienteId(e.target.value)} className="input-field" style={{ maxWidth: 260 }}>
          <option value="">Todas as empresas</option>
          {clientesFiltro.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
              {["Nome", "Empresa", "Cargo", "Modalidade", "Data de admissão", "Status", "ASO", "Origem", "Ações"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>
                  Nenhum funcionário encontrado.
                </td>
              </tr>
            ) : (
              filtrados.map((f) => {
                const badge = STATUS_BADGE[f.status] ?? { label: f.status, bg: "#F3F4F6", text: "#374151" };
                const badgeAso = ASO_STATUS_INFO[calcularStatusAso(f.aso_data_exame_mais_recente)];
                const badgeModalidade = f.tipo_servico ? MODALIDADE_BADGE[f.tipo_servico] : null;
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{f.nome_completo}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{f.clientes?.nome ?? f.empresa ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{f.cargo ?? "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {badgeModalidade ? (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badgeModalidade.bg, color: badgeModalidade.text }}>
                          {badgeModalidade.label}
                        </span>
                      ) : (
                        <span style={{ color: "#D1D5DB" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6B7280" }}>{f.data_admissao ? formatarDataSemFuso(f.data_admissao) : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badge.bg, color: badge.text }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badgeAso.bg, color: badgeAso.text }}>
                        {badgeAso.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#9CA3AF", fontSize: 12 }}>
                      {f.admissao_id ? "Admissão digital" : "Cadastro manual"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div className="flex gap-2">
                        <Link href={`/painel/funcionarios/${f.id}`} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                          Ver detalhes
                        </Link>
                        {f.status === "ativo" && (
                          <button onClick={() => setFuncionarioRescisao(f)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                            Lançar rescisão
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ModalAdicionarFuncionario
        isOpen={modalAberto}
        clientes={clientes}
        onClose={() => setModalAberto(false)}
        onCriado={() => { setModalAberto(false); router.refresh(); }}
      />

      <ModalLancarRescisao
        isOpen={funcionarioRescisao !== null}
        funcionario={funcionarioRescisao}
        onClose={() => setFuncionarioRescisao(null)}
        onLancado={() => { setFuncionarioRescisao(null); router.refresh(); }}
      />
    </div>
  );
}
