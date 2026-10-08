"use client";

import { useEffect, useRef, useState } from "react";
import { createPortalBrowserClient } from "@/lib/supabase/client";
import CampoMoeda from "@/components/ui/CampoMoeda";
import CampoTelefone from "@/components/ui/CampoTelefone";

// Edição de uma indicação já enviada (portal > Minhas Indicações). Pré-preenche com o que foi enviado e
// manda ao servidor SÓ os campos que mudaram; o servidor refaz o diff e revalida tudo (quem pode editar,
// vaga, data). Os campos de horário/turno/escala/integração aparecem como texto livre, exatamente como
// foram gravados na indicação (o formulário de criação os compõe a partir de vários seletores).

interface Detalhe {
  id: string;
  status: string;
  vaga_id: string;
  vaga_titulo: string | null;
  vaga_tipo_servico: string | null;
  tem_curriculo: boolean;
  pode_trocar_vaga: boolean;
  candidato_nome: string | null;
  candidato_telefone: string | null;
  [campo: string]: string | number | boolean | null;
}

interface VagaAtiva {
  id: string;
  titulo: string;
  tipo_servico: string;
}

interface Props {
  indicacaoId: string;
  onClose: () => void;
  // mensagem de sucesso; a página recarrega a lista
  onSalvo: (mensagem: string) => void;
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };
const inputStyle: React.CSSProperties = { border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#111827", outline: "none", width: "100%", boxSizing: "border-box" };

const hojeBrasilia = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function ModalEditarIndicacaoCliente({ indicacaoId, onClose, onSalvo }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [inicial, setInicial] = useState<Detalhe | null>(null);
  const [form, setForm] = useState<Record<string, string | number | boolean | null>>({});
  const [vagas, setVagas] = useState<VagaAtiva[]>([]);
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const inputCurriculoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/portal/minhas-indicacoes/${indicacaoId}`);
        const json = await res.json();
        if (!res.ok) {
          setErro(json.error ?? "Não foi possível carregar a indicação.");
          return;
        }
        const d = json.data as Detalhe;
        setInicial(d);
        setForm({ vaga_id: d.vaga_id, ...Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith("admissao_") || k.startsWith("candidato_"))) });
        if (d.pode_trocar_vaga) {
          const rv = await fetch("/api/portal/vagas-ativas");
          const jv = await rv.json();
          setVagas((jv.data ?? []).filter((v: VagaAtiva) => v.tipo_servico === d.vaga_tipo_servico));
        }
      } catch {
        setErro("Não foi possível carregar a indicação.");
      } finally {
        setCarregando(false);
      }
    })();
  }, [indicacaoId]);

  const set = (campo: string, valor: string | number | boolean | null) => setForm((f) => ({ ...f, [campo]: valor }));
  const txt = (campo: string) => (form[campo] as string | null) ?? "";
  const isRS = inicial?.vaga_tipo_servico === "recrutamento_selecao";

  const campoTexto = (campo: string, label: string) => (
    <Campo label={label}>
      <input value={txt(campo)} onChange={(e) => set(campo, e.target.value)} style={inputStyle} />
    </Campo>
  );

  const salvar = async () => {
    if (!inicial) return;
    setErro("");
    // Só o que mudou. "" vira null (igual à criação); número 0 do campo de moeda vira null.
    const mudou: Record<string, string | number | boolean | null> = {};
    for (const [campo, valor] of Object.entries(form)) {
      const novo = typeof valor === "string" ? (valor.trim() === "" ? null : valor.trim()) : valor === 0 ? null : valor;
      const antigo = campo === "vaga_id" ? inicial.vaga_id : (inicial[campo] ?? null);
      if (novo !== antigo) mudou[campo] = novo;
    }
    if (mudou.candidato_nome === null || mudou.candidato_telefone === null) {
      setErro("Nome e telefone do candidato não podem ficar em branco.");
      return;
    }

    setSalvando(true);
    try {
      if (curriculo) {
        const supabase = createPortalBrowserClient();
        const ext = curriculo.name.split(".").pop()?.toLowerCase() ?? "pdf";
        const contentType =
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "doc" || ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("curriculos").upload(fileName, curriculo, { contentType });
        if (uploadErr) throw new Error("Falha ao enviar o currículo. Tente novamente.");
        mudou.curriculo_url = fileName;
      }
      if (Object.keys(mudou).length === 0) {
        onSalvo("Nenhuma alteração para salvar.");
        return;
      }
      const res = await fetch(`/api/portal/minhas-indicacoes/${indicacaoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mudou),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível salvar.");
        // 409 = a indicação mudou ou já está em andamento: recarregar a lista deixa o estado certo na tela.
        if (res.status === 409) setTimeout(() => onSalvo(""), 2500);
        return;
      }
      onSalvo(json.alterado ? "Indicação atualizada. A Salmazos foi avisada das alterações." : "Nenhuma alteração para salvar.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg">Editar indicação</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>

        {carregando && <p className="p-6 text-sm text-gray-400">Carregando...</p>}

        {!carregando && !inicial && <p className="p-6 text-sm text-red-600">{erro}</p>}

        {!carregando && inicial && (
          <div className="p-6 space-y-4">
            <p className="text-xs text-gray-500">A Salmazos será avisada das alterações que você salvar.</p>

            {inicial.pode_trocar_vaga ? (
              <Campo label="Vaga">
                <select value={(form.vaga_id as string) ?? ""} onChange={(e) => set("vaga_id", e.target.value)} style={inputStyle}>
                  {!vagas.some((v) => v.id === inicial.vaga_id) && <option value={inicial.vaga_id}>{inicial.vaga_titulo ?? "Vaga atual"}</option>}
                  {vagas.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}
                </select>
              </Campo>
            ) : (
              <Campo label="Vaga">
                <p className="text-sm text-gray-700">{inicial.vaga_titulo ?? "—"}</p>
              </Campo>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {campoTexto("candidato_nome", "Nome do candidato")}
              <Campo label="Telefone">
                <CampoTelefone value={txt("candidato_telefone")} onChange={(v) => set("candidato_telefone", v)} style={inputStyle} />
              </Campo>
            </div>

            <Campo label="Currículo">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => inputCurriculoRef.current?.click()} className="btn-outline text-xs px-3 py-1.5">
                  {curriculo ? "Trocar arquivo" : inicial.tem_curriculo ? "Substituir currículo" : "Anexar currículo"}
                </button>
                <span className="text-xs text-gray-500 truncate">{curriculo ? curriculo.name : inicial.tem_curriculo ? "Currículo já anexado" : "Sem currículo"}</span>
                <input ref={inputCurriculoRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setCurriculo(e.target.files?.[0] ?? null)} />
              </div>
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo label="Data de início">
                <input type="date" min={hojeBrasilia()} value={txt("admissao_data_inicio")} onChange={(e) => set("admissao_data_inicio", e.target.value)} style={inputStyle} />
              </Campo>
              {campoTexto("admissao_funcao", isRS ? "Função confirmada" : "Função")}
              <Campo label="Salário mensal">
                <CampoMoeda value={(form.admissao_salario as number | null) ?? null} onChange={(n) => set("admissao_salario", n || null)} style={inputStyle} />
              </Campo>
              {!isRS && (
                <Campo label="Salário por hora">
                  <CampoMoeda value={(form.admissao_salario_hora as number | null) ?? null} onChange={(n) => set("admissao_salario_hora", n || null)} style={inputStyle} />
                </Campo>
              )}
              {!isRS && campoTexto("admissao_setor", "Setor")}
              {!isRS && campoTexto("admissao_centro_custo", "Centro de custo")}
              {!isRS && campoTexto("admissao_gestor", "Gestor")}
              {!isRS && campoTexto("admissao_horario", "Horário")}
              {!isRS && campoTexto("admissao_turno", "Turno")}
              {inicial.vaga_tipo_servico === "mao_obra_temporaria" && campoTexto("admissao_escala", "Escala")}
              {!isRS && campoTexto("admissao_periodo_experiencia", "Período de experiência")}
              {!isRS && campoTexto("admissao_tempo_contrato", "Tempo de contrato")}
              {!isRS && (
                <Campo label="Vale transporte">
                  <select
                    value={form.admissao_vt === true ? "sim" : form.admissao_vt === false ? "nao" : ""}
                    onChange={(e) => set("admissao_vt", e.target.value === "" ? null : e.target.value === "sim")}
                    style={inputStyle}
                  >
                    <option value="">Não informado</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </Campo>
              )}
              {!isRS && campoTexto("admissao_exame_responsavel", "Responsável pelo exame admissional")}
              {!isRS && campoTexto("admissao_local_integracao", "Local e data da integração")}
            </div>

            <Campo label="Observações">
              <textarea value={txt("admissao_observacoes")} onChange={(e) => set("admissao_observacoes", e.target.value)} rows={3} style={inputStyle} />
            </Campo>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={onClose} className="btn-outline" disabled={salvando}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="btn-primary" style={{ opacity: salvando ? 0.6 : 1 }}>
                {salvando ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
