"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatarDataSemFuso } from "@/lib/utils";
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
}

interface ClienteOption {
  id: string;
  nome: string;
}

export interface UsuarioOption {
  user_id: string;
  nome_completo: string;
  email: string;
}

interface Props {
  funcionariosIniciais: FuncionarioRow[];
  clientes: ClienteOption[];
  usuarios: UsuarioOption[];
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  ativo: { label: "Ativo", bg: "#D1FAE5", text: "#166534" },
  desligado: { label: "Desligado", bg: "#FEE2E2", text: "#991B1B" },
};

export default function FuncionariosPageClient({ funcionariosIniciais, clientes, usuarios }: Props) {
  const router = useRouter();
  const [filtroStatus, setFiltroStatus] = useState<string>("ativo");
  const [filtroClienteId, setFiltroClienteId] = useState<string>("");
  const [modalAberto, setModalAberto] = useState(false);
  const [funcionarioRescisao, setFuncionarioRescisao] = useState<FuncionarioRow | null>(null);

  const filtrados = useMemo(() => {
    return funcionariosIniciais.filter((f) => {
      if (filtroStatus !== "todos" && f.status !== filtroStatus) return false;
      if (filtroClienteId && f.cliente_id !== filtroClienteId) return false;
      return true;
    });
  }, [funcionariosIniciais, filtroStatus, filtroClienteId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Funcionários</h1>
        <button onClick={() => setModalAberto(true)} className="btn-primary">
          + Adicionar funcionário manualmente
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="input-field" style={{ maxWidth: 200 }}>
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="desligado">Desligado</option>
        </select>
        <select value={filtroClienteId} onChange={(e) => setFiltroClienteId(e.target.value)} className="input-field" style={{ maxWidth: 260 }}>
          <option value="">Todas as empresas</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
              {["Nome", "Empresa", "Cargo", "Data de admissão", "Status", "Origem", "Ações"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px 12px", textAlign: "center", color: "#9CA3AF" }}>
                  Nenhum funcionário encontrado.
                </td>
              </tr>
            ) : (
              filtrados.map((f) => {
                const badge = STATUS_BADGE[f.status] ?? { label: f.status, bg: "#F3F4F6", text: "#374151" };
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>{f.nome_completo}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{f.clientes?.nome ?? f.empresa ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{f.cargo ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#6B7280" }}>{f.data_admissao ? formatarDataSemFuso(f.data_admissao) : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: badge.bg, color: badge.text }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#9CA3AF", fontSize: 12 }}>
                      {f.admissao_id ? "Admissão digital" : "Cadastro manual"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {f.status === "ativo" && (
                        <button onClick={() => setFuncionarioRescisao(f)} className="btn-outline" style={{ padding: "4px 10px", fontSize: 12 }}>
                          Lançar rescisão
                        </button>
                      )}
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
        usuarios={usuarios}
        onClose={() => setFuncionarioRescisao(null)}
        onLancado={() => { setFuncionarioRescisao(null); router.refresh(); }}
      />
    </div>
  );
}
