"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/dataBR";
import { idadeNaData } from "@/lib/gestaoPessoas";
import { faltasDoCadastro, GRAUS_PERFIL, SEXOS_PERFIL, type FilhoFuncionario, type PerfilFuncionario } from "@/lib/funcionarioPerfil";

interface Props {
  funcionarioId: string;
  admissaoId: string | null;
  perfilInicial: PerfilFuncionario | null;
  filhosIniciais: FilhoFuncionario[];
  hojeISO: string; // "hoje" de Brasília, vindo do servidor (limita o campo de data e calcula a idade sem depender do fuso do navegador)
}

const PERFIL_VAZIO: PerfilFuncionario = { sexo: null, data_nascimento: null, grau_instrucao: null, filhos_informado_em: null };
const botao = { minHeight: 44 } as const;
const idadeTexto = (nasc: string, hoje: string) => {
  const i = idadeNaData(nasc, hoje);
  return i === null ? "idade não calculada" : i < 1 ? "menos de 1 ano" : i === 1 ? "1 ano" : `${i} anos`;
};

async function chamar(url: string, metodo: string, corpo?: unknown) {
  try {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const json = (await r.json().catch(() => ({}))) as { error?: string; aviso?: boolean | string | null; data?: unknown };
    return { ok: r.ok, status: r.status, json };
  } catch {
    return { ok: false, status: 0, json: { error: "Sem conexão. Tente de novo." } as { error?: string; aviso?: boolean | string | null; data?: unknown } };
  }
}

// Cartão "Dados pessoais e filhos" da tela do funcionário. Funcionário com admissão digital: só leitura (os dados vêm da admissão). Sem admissão (legado ou
// cadastro manual): o RH completa aqui, salvando por seção; cada alteração fica na auditoria.
export default function FuncionarioDadosPessoais({ funcionarioId, admissaoId, perfilInicial, filhosIniciais, hojeISO }: Props) {
  const router = useRouter();
  const [perfil, setPerfil] = useState<PerfilFuncionario>(perfilInicial ?? PERFIL_VAZIO);
  const [filhos, setFilhos] = useState<FilhoFuncionario[]>(filhosIniciais);
  const [sexo, setSexo] = useState<string>(perfil.sexo ?? "");
  const [nascimento, setNascimento] = useState<string>(perfil.data_nascimento ?? "");
  const [grau, setGrau] = useState<string>(perfil.grau_instrucao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null); // 422 do perfil: pergunta antes de salvar
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [formFilho, setFormFilho] = useState<{ id: string | null; nome: string; nascimento: string } | null>(null);
  const [removendo, setRemovendo] = useState<{ id: string; nome: string; ultimo: boolean } | null>(null);
  const [confirmandoSemFilhos, setConfirmandoSemFilhos] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (admissaoId) {
    return (
      <div className="card mb-6" id="dados-pessoais">
        <p className="section-title mb-1">Dados pessoais e filhos</p>
        <p className="text-sm text-gray-600">
          Este funcionário veio por admissão digital: sexo, nascimento, instrução e filhos vêm da admissão. Para corrigir, use a{" "}
          <Link href={`/painel/admissoes/${admissaoId}`} style={{ textDecoration: "underline", fontWeight: 600 }}>admissão</Link>.
        </p>
      </div>
    );
  }

  const faltas = faltasDoCadastro(null, perfil, filhos.length);
  const filhosInformados = !!perfil.filhos_informado_em || filhos.length > 0;
  const mudou = sexo !== (perfil.sexo ?? "") || nascimento !== (perfil.data_nascimento ?? "") || grau !== (perfil.grau_instrucao ?? "");

  async function salvarPerfil(confirmado: boolean) {
    setSalvando(true);
    setMensagem(null);
    const r = await chamar(`/api/funcionarios/${funcionarioId}/perfil`, "PUT", { sexo: sexo || null, data_nascimento: nascimento || null, grau_instrucao: grau || null, ...(confirmado ? { confirmado: true } : {}) });
    setSalvando(false);
    if (r.status === 422 && r.json.aviso) { setAviso(r.json.error ?? "Confirma a data de nascimento?"); return; }
    if (!r.ok) { setAviso(null); setMensagem({ tipo: "erro", texto: r.json.error ?? "Não foi possível salvar." }); return; }
    setAviso(null);
    setPerfil((p) => ({ ...p, ...(r.json.data as Partial<PerfilFuncionario>) }));
    setMensagem({ tipo: "ok", texto: "Dados pessoais salvos." });
    router.refresh();
  }

  async function salvarFilho() {
    if (!formFilho) return;
    setOcupado(true);
    setMensagem(null);
    const corpo = { nome: formFilho.nome, data_nascimento: formFilho.nascimento || null };
    const r = formFilho.id ? await chamar(`/api/funcionarios/${funcionarioId}/filhos/${formFilho.id}`, "PATCH", corpo) : await chamar(`/api/funcionarios/${funcionarioId}/filhos`, "POST", corpo);
    setOcupado(false);
    if (!r.ok) { setMensagem({ tipo: "erro", texto: r.json.error ?? "Não foi possível salvar o filho." }); return; }
    const salvo = r.json.data as FilhoFuncionario;
    setFilhos((lista) => (formFilho.id ? lista.map((f) => (f.id === salvo.id ? salvo : f)) : [...lista, salvo]));
    if (!formFilho.id) setPerfil((p) => ({ ...p, filhos_informado_em: p.filhos_informado_em ?? new Date().toISOString() }));
    setFormFilho(null);
    setMensagem({ tipo: "ok", texto: typeof r.json.aviso === "string" && r.json.aviso ? `Filho salvo. ${r.json.aviso}` : "Filho salvo." });
    router.refresh();
  }

  async function removerFilho() {
    if (!removendo) return;
    setOcupado(true);
    const r = await chamar(`/api/funcionarios/${funcionarioId}/filhos/${removendo.id}${removendo.ultimo ? "?confirmado=1" : ""}`, "DELETE");
    setOcupado(false);
    if (!r.ok) { setMensagem({ tipo: "erro", texto: r.json.error ?? "Não foi possível remover." }); setRemovendo(null); return; }
    setFilhos((lista) => lista.filter((f) => f.id !== removendo.id));
    setMensagem({ tipo: "ok", texto: removendo.ultimo ? "Filho removido. O funcionário passa a constar como \"Sem filhos declarados\"." : "Filho removido." });
    setRemovendo(null);
    router.refresh();
  }

  async function confirmarSemFilhos() {
    setOcupado(true);
    const r = await chamar(`/api/funcionarios/${funcionarioId}/filhos/confirmar-sem-filhos`, "POST");
    setOcupado(false);
    setConfirmandoSemFilhos(false);
    if (!r.ok) { setMensagem({ tipo: "erro", texto: r.json.error ?? "Não foi possível confirmar." }); return; }
    setPerfil((p) => ({ ...p, filhos_informado_em: (r.json.data as { filhos_informado_em: string }).filhos_informado_em }));
    setMensagem({ tipo: "ok", texto: "Confirmado: este funcionário não tem filhos." });
    router.refresh();
  }

  const rotulo = { display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 } as const;

  return (
    <div className="card mb-6" id="dados-pessoais">
      <div className="flex items-center justify-between mb-1" style={{ flexWrap: "wrap", gap: 8 }}>
        <p className="section-title mb-0">Dados pessoais e filhos</p>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: faltas.length === 0 ? "#D1FAE5" : "#FEF3C7", color: faltas.length === 0 ? "#166534" : "#92400E" }}>
          {faltas.length === 0 ? "Cadastro completo" : `Cadastro incompleto · faltam: ${faltas.join(", ")}`}
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-4">Cadastro manual (sem admissão digital): complete aqui para o funcionário entrar nos gráficos e listas da Gestão de Pessoas.</p>

      <div role="status" aria-live="polite" style={{ minHeight: mensagem ? undefined : 0 }}>
        {mensagem && <p role={mensagem.tipo === "erro" ? "alert" : undefined} style={{ fontSize: 13, margin: "0 0 12px", color: mensagem.tipo === "erro" ? "#991B1B" : "#166534" }}>{mensagem.texto}</p>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void salvarPerfil(false); }} aria-label="Dados pessoais">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 12 }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={rotulo}>Sexo</legend>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {SEXOS_PERFIL.map((s) => (
                <label key={s.value} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14 }}>
                  <input type="radio" name={`sexo-${funcionarioId}`} value={s.value} checked={sexo === s.value} onChange={() => setSexo(s.value)} style={{ width: 20, height: 20 }} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`nasc-${funcionarioId}`} style={rotulo}>Data de nascimento</label>
            <input id={`nasc-${funcionarioId}`} type="date" className="input-field" value={nascimento} min="1900-01-01" max={hojeISO} onChange={(e) => { setNascimento(e.target.value); setAviso(null); }} style={{ width: "100%" }} />
          </div>
          <div>
            <label htmlFor={`grau-${funcionarioId}`} style={rotulo}>Grau de instrução</label>
            <select id={`grau-${funcionarioId}`} className="input-field" value={grau} onChange={(e) => setGrau(e.target.value)} style={{ width: "100%" }}>
              <option value="">Não informado</option>
              {GRAUS_PERFIL.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        </div>

        {aviso && (
          <div role="alert" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px" }}>{aviso}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn-primary" style={botao} disabled={salvando} onClick={() => void salvarPerfil(true)}>Confirmar e salvar</button>
              <button type="button" className="btn-outline" style={botao} onClick={() => setAviso(null)}>Corrigir a data</button>
            </div>
          </div>
        )}

        <button type="submit" className="btn-primary" style={botao} disabled={salvando || !mudou}>{salvando ? "Salvando…" : "Salvar dados pessoais"}</button>
      </form>

      <hr style={{ border: 0, borderTop: "1px solid #F3F4F6", margin: "20px 0" }} />

      <section aria-labelledby={`filhos-${funcionarioId}`}>
        <p id={`filhos-${funcionarioId}`} className="section-title" style={{ marginBottom: 4 }}>Filhos</p>
        <p className="text-sm text-gray-600" style={{ margin: "0 0 12px" }}>
          {filhos.length > 0 ? `${filhos.length} ${filhos.length === 1 ? "filho cadastrado" : "filhos cadastrados"}.` : filhosInformados ? "Sem filhos declarados (confirmado pelo RH)." : "Não informado: ainda não foi cadastrado nenhum filho nem confirmado que não tem."}
        </p>

        {filhos.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>
            {filhos.map((f) => (
              <li key={f.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #F3F4F6", fontSize: 14 }}>
                <span><strong>{f.nome}</strong> · {dataBR(f.data_nascimento)} ({idadeTexto(f.data_nascimento, hojeISO)})</span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn-outline" style={botao} aria-label={`Editar ${f.nome}`} onClick={() => { setFormFilho({ id: f.id, nome: f.nome, nascimento: f.data_nascimento }); setRemovendo(null); }}>Editar</button>
                  <button type="button" className="btn-outline" style={botao} aria-label={`Remover ${f.nome}`} onClick={() => { setRemovendo({ id: f.id, nome: f.nome, ultimo: filhos.length === 1 }); setFormFilho(null); }}>Remover</button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {removendo && (
          <div role="alertdialog" aria-label="Confirmar remoção" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px" }}>
              {removendo.ultimo ? "Este é o último filho cadastrado. Ao remover, o funcionário passa a constar como \"Sem filhos declarados\". Confirma?" : `Remover ${removendo.nome}?`}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn-primary" style={botao} disabled={ocupado} onClick={() => void removerFilho()}>Sim, remover</button>
              <button type="button" className="btn-outline" style={botao} onClick={() => setRemovendo(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {formFilho ? (
          <form onSubmit={(e) => { e.preventDefault(); void salvarFilho(); }} aria-label={formFilho.id ? "Editar filho" : "Adicionar filho"} style={{ background: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <label htmlFor={`filho-nome-${funcionarioId}`} style={rotulo}>Nome do filho(a)</label>
                <input id={`filho-nome-${funcionarioId}`} className="input-field" value={formFilho.nome} maxLength={120} onChange={(e) => setFormFilho({ ...formFilho, nome: e.target.value })} style={{ width: "100%" }} required />
              </div>
              <div>
                <label htmlFor={`filho-nasc-${funcionarioId}`} style={rotulo}>Data de nascimento</label>
                <input id={`filho-nasc-${funcionarioId}`} type="date" className="input-field" value={formFilho.nascimento} min="1900-01-01" max={hojeISO} onChange={(e) => setFormFilho({ ...formFilho, nascimento: e.target.value })} style={{ width: "100%" }} required />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn-primary" style={botao} disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar filho"}</button>
              <button type="button" className="btn-outline" style={botao} onClick={() => setFormFilho(null)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-outline" style={botao} onClick={() => { setFormFilho({ id: null, nome: "", nascimento: "" }); setRemovendo(null); }}>+ Adicionar filho(a)</button>
            {filhos.length === 0 && !filhosInformados && !confirmandoSemFilhos && (
              <button type="button" className="btn-outline" style={botao} onClick={() => setConfirmandoSemFilhos(true)}>Este funcionário não tem filhos</button>
            )}
          </div>
        )}

        {confirmandoSemFilhos && (
          <div role="alertdialog" aria-label="Confirmar que não tem filhos" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 12 }}>
            <p style={{ margin: "0 0 8px" }}>Confirma que este funcionário não tem filhos? Ele passará a constar como &quot;Sem filhos declarados&quot;.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn-primary" style={botao} disabled={ocupado} onClick={() => void confirmarSemFilhos()}>Sim, não tem filhos</button>
              <button type="button" className="btn-outline" style={botao} onClick={() => setConfirmandoSemFilhos(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
