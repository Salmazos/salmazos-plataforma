"use client";

import { useEffect, useRef, useState } from "react";
import { createPortalBrowserClient } from "@/lib/supabase/client";
import BlocoDadosAdmissao from "@/components/BlocoDadosAdmissao";
import { mensagemErrosAdmissao, validarCamposAdmissao } from "@/lib/admissaoCamposPadrao";
import { faltandoObrigatorios, mexeNosDadosDeAdmissao } from "@/lib/admissaoObrigatorios";
import { colunasDeDados, colunasVisiveis, comHorario, dadosDeColunas, dadosVazios, integracaoPreenchidaParcialmente } from "@/lib/admissaoForm";
import CampoTelefone from "@/components/ui/CampoTelefone";
import { MOSTRAR_DIA_TESTE_NO_PORTAL } from "@/lib/diaTestePortal";
import { diasTesteParaEnvio, erroDiasTeste } from "@/components/CampoDiasTeste";

// Edição de uma indicação já enviada (portal > Minhas Indicações). Pré-preenche com o que foi enviado e
// manda ao servidor SÓ os campos que mudaram; o servidor refaz o diff e revalida tudo (quem pode editar,
// vaga, data). Os dados de admissão usam o MESMO bloco do formulário de criação (BlocoDadosAdmissao): mesmos controles, listas e máscaras.

interface Detalhe {
  id: string;
  status: string;
  vaga_id: string | null;
  // Indicação sem vaga: a Salmazos direciona; o cliente não escolhe vaga.
  sem_vaga: boolean;
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
  const [dados, setDados] = useState(() => dadosVazios(null));
  const [diasTesteAlterado, setDiasTesteAlterado] = useState(false);
  const [tentouSalvar, setTentouSalvar] = useState(false);
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
        // `form` guarda só nome, telefone e vaga; os dados de admissão vivem no estado do bloco (`dados`).
        setForm({ vaga_id: d.vaga_id, candidato_nome: d.candidato_nome, candidato_telefone: d.candidato_telefone });
        setDados(dadosDeColunas(d, d.vaga_tipo_servico));
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
  const tipo = inicial?.vaga_tipo_servico ?? null;

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
    const normalizar = (valor: unknown) => (typeof valor === "string" ? (valor.trim() === "" ? null : valor.trim()) : valor === 0 || valor === undefined ? null : (valor as string | number | boolean | null));
    for (const [campo, valor] of Object.entries(form)) {
      const novo = normalizar(valor);
      const antigo = campo === "vaga_id" ? inicial.vaga_id : (inicial[campo] ?? null);
      if (novo !== antigo) mudou[campo] = novo;
    }
    if (mudou.candidato_nome === null || mudou.candidato_telefone === null) {
      setErro("Nome e telefone do candidato não podem ficar em branco.");
      return;
    }
    // Dados de admissão: o bloco emite as mesmas colunas da criação; só as que o tipo mostra e que mudaram vão no corpo.
    const colunas = colunasDeDados(dados, tipo);
    for (const c of colunasVisiveis(tipo)) {
      const novo = normalizar(colunas[c]);
      const antigo = inicial[c] ?? null;
      if (novo !== antigo) mudou[c] = novo;
    }
    // Mesmas regras do servidor, antes de enviar. Só o que o cliente MUDOU é conferido: dado antigo intocado não trava o salvar.
    const errosPadrao = validarCamposAdmissao({
      admissao_salario: colunas.admissao_salario as number | null, admissao_salario_hora: colunas.admissao_salario_hora as number | null,
      admissao_centro_custo: colunas.admissao_centro_custo as string | null, admissao_horario: colunas.admissao_horario as string | null,
      admissao_turno: colunas.admissao_turno as string | null, admissao_escala: colunas.admissao_escala as string | null,
      admissao_tempo_contrato: colunas.admissao_tempo_contrato as string | null,
    }).filter((e) => e.campo in mudou);
    if (errosPadrao.length > 0) { setErro(mensagemErrosAdmissao(errosPadrao)); return; }
    if (comHorario(tipo) && integracaoPreenchidaParcialmente(dados)) { setErro("Preencha local, data e hora da integração, ou deixe os três em branco."); return; }
    // Indicação SEM vaga: mexeu nos dados de admissão, precisa deixá-los completos para o tipo (mesma regra do servidor). Indicação antiga que
    // só teve nome, telefone, currículo ou função editados segue sem exigência.
    const semVagaMexeu = inicial.sem_vaga && mexeNosDadosDeAdmissao([...Object.keys(mudou), ...(diasTesteAlterado ? ["admissao_qtd_dias_teste"] : [])]);
    if (semVagaMexeu) {
      const falta = faltandoObrigatorios(tipo, colunas as Parameters<typeof faltandoObrigatorios>[1]);
      if (falta.length > 0) { setErro(falta[0]); return; }
    }
    // Dia(s) de teste: indicação antiga (null) segue editável sem responder — se o cliente não mexer, o campo NÃO vai no corpo
    // (null explícito é recusado em MOT/Terceirização). Mexeu, precisa estar completo; 0 ("Não") é resposta e vai como 0.
    if (MOSTRAR_DIA_TESTE_NO_PORTAL && comHorario(tipo) && (diasTesteAlterado || semVagaMexeu)) {
      setTentouSalvar(true);
      const e = erroDiasTeste(dados.dias_teste);
      if (e) { setErro(e); return; }
      const novaQtd = diasTesteParaEnvio(dados.dias_teste);
      if (novaQtd !== (inicial.admissao_qtd_dias_teste ?? null)) mudou.admissao_qtd_dias_teste = novaQtd;
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
                  {!vagas.some((v) => v.id === inicial.vaga_id) && <option value={inicial.vaga_id ?? ""}>{inicial.vaga_titulo ?? "Vaga atual"}</option>}
                  {vagas.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}
                </select>
              </Campo>
            ) : (
              <Campo label="Vaga">
                <p className="text-sm text-gray-700">{inicial.vaga_titulo ?? (inicial.sem_vaga ? "Sem vaga definida — a Salmazos vai analisar e direcionar" : "—")}</p>
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

            <BlocoDadosAdmissao
              tipoServico={tipo}
              valores={dados}
              onChange={(patch) => {
                setDados((d) => ({ ...d, ...patch }));
                if (patch.dias_teste) setDiasTesteAlterado(true);
              }}
              tentouEnviar={tentouSalvar}
              dataMinima={hojeBrasilia()}
              inputStyle={inputStyle}
            />

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
