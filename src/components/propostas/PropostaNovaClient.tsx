"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rotuloEtapa } from "@/lib/comercialRotulos";
import { MODELOS, MODELOS_ATIVOS, ROTULO_MODELO, type ModeloProposta } from "@/lib/propostas";
import CamposProposta, { camposPadrao, conteudoDoForm, validadeDoForm, type CamposForm } from "@/components/propostas/CamposProposta";
import CamposPropostaMot, { camposMotPadrao, conteudoMotDoForm, validadeMotDoForm, type CamposMotForm, type EstadoPrevia } from "@/components/propostas/CamposPropostaMot";
import { aplicarPrefill, lerDadosPrefill, type DadosPrefill } from "@/lib/propostaPrefill";
import { Aviso, btnPrimario, btnSecundario, cardStyle, inputStyle, labelStyle, lerResposta, guardarAvisoProposta } from "@/components/propostas/propostasUi";

interface Contato { id: string; nome: string; cargo: string | null; principal: boolean }
// oportunidade_aberta só vem para quem tem Funil; sem o campo, não há aviso de oportunidade de outro vendedor.
// teste só vem para o gestor (true = empresa de teste: as propostas dela saem como TESTE-..., fora das listas e sem efeito no Funil).
// Cliente cadastrado que ainda não tem empresa na Carteira (sem id de empresa): a empresa é criada na hora, ao escolhê-lo.
interface ClienteOpc { origem: "cliente"; cliente_id: string; nome: string; cidade?: string }
const ehCliente = (x: EmpresaOpc | ClienteOpc): x is ClienteOpc => (x as ClienteOpc).origem === "cliente";
interface EmpresaOpc { id: string; nome: string; contatos: Contato[]; oportunidade_aberta?: { id: string; vendedor_nome: string | null; etapa: string } | null; teste?: boolean }

// gestor: só ele vê o modelo MOT ("Em teste"), e só o habilita com uma empresa de TESTE escolhida. O servidor confere de novo (vendedor nunca cria MOT).
export default function PropostaNovaClient({ meuNome, gestor = false }: { meuNome: string; gestor?: boolean }) {
  const router = useRouter();
  const [modelo, setModelo] = useState<ModeloProposta>("RS");
  const [busca, setBusca] = useState("");
  const [empresas, setEmpresas] = useState<(EmpresaOpc | ClienteOpc)[]>([]);
  const [criandoDeCliente, setCriandoDeCliente] = useState<string | null>(null);
  const criandoRef = useRef(false);
  const [empresa, setEmpresa] = useState<EmpresaOpc | null>(null);
  const [contatoId, setContatoId] = useState("");
  const [campos, setCampos] = useState<CamposForm>(camposPadrao());
  const [camposMot, setCamposMot] = useState<CamposMotForm>(camposMotPadrao());
  // Sem percentuais vigentes (ou erro no cálculo) o servidor responde com uma mensagem e o botão de criar fica bloqueado.
  const [previaMot, setPreviaMot] = useState<EstadoPrevia>({ previa: null, erro: null, carregando: false });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroBusca, setErroBusca] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ nome: "", contato_nome: "", contato_telefone: "", contato_email: "" });
  const [criandoEmpresa, setCriandoEmpresa] = useState(false);
  const [erroNova, setErroNova] = useState("");
  const [alternandoTeste, setAlternandoTeste] = useState(false);
  const [erroTeste, setErroTeste] = useState("");
  const emAndamento = useRef(false);
  // Descarta a resposta atrasada de uma empresa que já foi trocada.
  const sequenciaPrefill = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carteira da unidade do vendedor (a rota já filtra por unidade). Uma busca por pausa na digitação, sem repetição automática.
  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    // O clearTimeout só cancela a busca que ainda não saiu; `cancelado` descarta a resposta de uma que já estava em andamento.
    let cancelado = false;
    temporizador.current = setTimeout(async () => {
      try {
        const r = await lerResposta<{ data: (EmpresaOpc | ClienteOpc)[] }>(await fetch(`/api/comercial/propostas/empresas?q=${encodeURIComponent(busca.trim())}`));
        if (cancelado) return;
        if (r.ok) { setEmpresas(r.json.data ?? []); setErroBusca(""); }
        else setErroBusca(r.json.error ?? "Não foi possível buscar as empresas.");
      } catch {
        if (cancelado) return;
        setErroBusca("Não foi possível buscar as empresas.");
      }
    }, busca ? 300 : 0);
    return () => {
      cancelado = true;
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [busca]);

  // MOT só vale para o gestor com empresa de teste escolhida; fora disso a tela volta sozinha para o R&S (nunca prepara um MOT que o servidor recusaria).
  const motLiberado = gestor && empresa?.teste === true;
  const modeloAtual: ModeloProposta = modelo === "MOT" && !motLiberado ? "RS" : modelo;

  // Preenche SÓ os campos vazios da MESMA empresa com os dados do cadastro (nunca sobrescreve o que o vendedor digitou). Os dois formulários (R&S e MOT)
  // recebem o mesmo A/C; CNPJ e endereço só existem no R&S.
  function preencherDoCadastro(dados: DadosPrefill) {
    setCampos((c) => aplicarPrefill(c, dados));
    setCamposMot((c) => ({ ...c, aos_cuidados: aplicarPrefill({ aos_cuidados: c.aos_cuidados, cliente_cnpj: "", cliente_endereco: "" }, { ...dados, cnpj: null, cidade: null, endereco: null }).aos_cuidados }));
  }

  function escolher(e: EmpresaOpc) {
    setEmpresa(e);
    const principal = e.contatos.find((c) => c.principal) ?? e.contatos[0];
    setContatoId(principal?.id ?? "");
    // Trocar de empresa REINICIA tudo (A/C, CNPJ, endereço, condições, cláusulas...): A/C, CNPJ e endereço pertencem à empresa e nada da anterior atravessa a
    // troca, nem o que foi digitado. O A/C já vem do contato principal da lista (ou o primeiro); CNPJ e endereço chegam pela rota leve, logo abaixo.
    setCampos({ ...camposPadrao(), aos_cuidados: principal?.nome ?? "" });
    setCamposMot({ ...camposMotPadrao(), aos_cuidados: principal?.nome ?? "" });
    // Se a consulta falhar, os campos simplesmente ficam vazios para o vendedor digitar.
    const sequencia = ++sequenciaPrefill.current;
    fetch(`/api/comercial/propostas/empresas/${e.id}/prefill`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((json) => {
        if (sequencia !== sequenciaPrefill.current) return; // já escolheu outra empresa
        const dados = lerDadosPrefill(json);
        if (dados) preencherDoCadastro(dados);
      })
      .catch(() => {});
  }

  // Cliente cadastrado sem Carteira: a empresa é criada (ou, se já existir, devolvida) pelo servidor e a tela segue com a EMPRESA REAL, com o A/C do contato principal.
  async function escolherCliente(c: ClienteOpc) {
    if (criandoRef.current) return;
    criandoRef.current = true;
    setCriandoDeCliente(c.cliente_id);
    setErroBusca("");
    try {
      const r = await lerResposta<{ data: EmpresaOpc }>(await fetch("/api/comercial/propostas/empresas/de-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: c.cliente_id }),
      }));
      if (!r.ok) { setErroBusca(r.json.error ?? "Não foi possível preparar este cliente."); return; }
      // O cliente agora tem empresa: sai da lista de clientes e a tela segue como se a empresa tivesse sido escolhida da Carteira.
      setEmpresas((lista) => lista.filter((x) => !(ehCliente(x) && x.cliente_id === c.cliente_id)));
      escolher(r.json.data);
    } catch {
      setErroBusca("Não foi possível preparar este cliente.");
    } finally {
      criandoRef.current = false;
      setCriandoDeCliente(null);
    }
  }

  // Gestor: liga/desliga "empresa de teste" (a API só aceita diretoria/superuser). Propostas antigas não mudam.
  async function alternarTeste() {
    if (!empresa || empresa.teste === undefined || alternandoTeste) return;
    setAlternandoTeste(true);
    setErroTeste("");
    try {
      const r = await lerResposta<{ data?: { teste: boolean } }>(await fetch(`/api/comercial/propostas/empresas/${empresa.id}/teste`, { method: empresa.teste ? "DELETE" : "POST" }));
      if (!r.ok) { setErroTeste(r.json.error ?? "Não foi possível alterar a empresa."); return; }
      const nova = r.json.data?.teste === true;
      setEmpresa({ ...empresa, teste: nova });
      setEmpresas((lista) => lista.map((x) => (!ehCliente(x) && x.id === empresa.id ? { ...x, teste: nova } : x)));
    } catch {
      setErroTeste("Não foi possível alterar a empresa.");
    } finally {
      setAlternandoTeste(false);
    }
  }

  // Empresa que ainda não é cliente: entra na Carteira só como registro (prospect) e é escolhida como qualquer outra.
  async function cadastrarEmpresa() {
    if (criandoEmpresa) return;
    if (nova.nome.trim().length < 2) { setErroNova("Informe o nome da empresa."); return; }
    setCriandoEmpresa(true);
    setErroNova("");
    try {
      const r = await lerResposta<{ data: EmpresaOpc }>(await fetch("/api/comercial/propostas/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nova.nome,
          contato_nome: nova.contato_nome.trim() || null,
          contato_telefone: nova.contato_telefone.trim() || null,
          contato_email: nova.contato_email.trim() || null,
        }),
      }));
      if (!r.ok) { setErroNova(r.json.error ?? "Não foi possível cadastrar a empresa."); return; }
      escolher(r.json.data);
      setNovaAberta(false);
      setNova({ nome: "", contato_nome: "", contato_telefone: "", contato_email: "" });
    } catch {
      setErroNova("Não foi possível cadastrar a empresa.");
    } finally {
      setCriandoEmpresa(false);
    }
  }

  const atalhoNova = (
    <button type="button" onClick={() => { setNova((n) => ({ ...n, nome: n.nome || busca.trim() })); setNovaAberta(true); }}
      style={{ background: "none", border: "none", padding: 0, color: "#B45309", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
      Não achou? Cadastrar nova empresa (apenas registro)
    </button>
  );

  // A lista da Carteira só traz o NOME do vendedor da oportunidade aberta: é o que dá para comparar aqui.
  // O servidor confere de novo (id) e devolve o mesmo aviso ao criar.
  const abertaDeOutro = empresa?.oportunidade_aberta && empresa.oportunidade_aberta.vendedor_nome !== meuNome ? empresa.oportunidade_aberta : null;

  async function criar() {
    if (emAndamento.current) return;
    if (!empresa) { setErro("Escolha a empresa da Carteira."); return; }
    if (modeloAtual === "MOT" && previaMot.erro) { setErro(previaMot.erro); return; }
    emAndamento.current = true;
    setSalvando(true);
    setErro("");
    // Depois de criar, o botão continua travado até a navegação: sem isso um segundo clique criaria outra proposta.
    let navegou = false;
    try {
      const r = await lerResposta<{ data: { id: string }; aviso: string | null }>(await fetch("/api/comercial/propostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modeloAtual === "MOT" ? {
          modelo: modeloAtual,
          empresa_visitada_id: empresa.id,
          contato_id: contatoId || null,
          aos_cuidados: camposMot.aos_cuidados.trim() || null,
          validade_dias: validadeMotDoForm(camposMot),
          conteudo: conteudoMotDoForm(camposMot),
        } : {
          modelo: modeloAtual,
          empresa_visitada_id: empresa.id,
          contato_id: contatoId || null,
          aos_cuidados: campos.aos_cuidados.trim() || null,
          validade_dias: validadeDoForm(campos),
          conteudo: conteudoDoForm(campos),
        }),
      }));
      if (!r.ok) { setErro(r.json.error ?? "Não foi possível criar a proposta."); return; }
      navegou = true;
      guardarAvisoProposta(r.json.data.id, r.json.aviso);
      router.push(`/painel/comercial/propostas/${r.json.data.id}`);
    } catch {
      setErro("Não foi possível criar a proposta.");
    } finally {
      if (!navegou) {
        setSalvando(false);
        emAndamento.current = false;
      }
    }
  }

  const bloqueadoPorCalculo = modeloAtual === "MOT" && previaMot.erro !== null;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}><Link href="/painel/comercial/propostas" style={{ fontSize: 13, color: "#6B7280" }}>← Propostas</Link></div>
      <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 800, color: "#111827" }}>Nova proposta</h1>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={labelStyle}>Modelo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {MODELOS.map((m) => {
            const noTeste = m === "MOT" && gestor && !MODELOS_ATIVOS.includes(m);
            const ativo = MODELOS_ATIVOS.includes(m) || (noTeste && motLiberado);
            const sel = modeloAtual === m;
            return (
              <button key={m} type="button" disabled={!ativo} data-modelo={m} onClick={() => ativo && setModelo(m)}
                style={{ textAlign: "left", padding: 12, borderRadius: 10, border: sel ? "2px solid #FFB800" : "1px solid #D1D5DB", background: ativo ? "#fff" : "#F9FAFB", color: ativo ? "#111827" : "#9CA3AF", cursor: ativo ? "pointer" : "not-allowed" }}>
                <div style={{ fontWeight: 800 }}>{ROTULO_MODELO[m]}</div>
                <div style={{ fontSize: 12 }}>{noTeste ? (motLiberado ? "Em teste" : "Em teste (escolha uma empresa de teste)") : ativo ? "Disponível" : "Em breve"}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <label style={labelStyle}>Empresa da Carteira</label>
        {empresa ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>{empresa.nome}</strong>
            <button type="button" style={btnSecundario} onClick={() => { setEmpresa(null); setErroTeste(""); }}>Trocar empresa</button>
          </div>
        ) : (
          <>
            <input style={inputStyle} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite parte do nome da empresa" />
            {erroBusca && <div style={{ marginTop: 8 }}><Aviso tipo="erro">{erroBusca}</Aviso></div>}
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              {empresas.length === 0 ? <div style={{ padding: 12, color: "#6B7280", fontSize: 13 }}>Nenhuma empresa da Carteira da sua unidade encontrada. {atalhoNova}</div> : empresas.map((e) => ehCliente(e) ? (
                <button key={`cliente-${e.cliente_id}`} type="button" disabled={criandoDeCliente !== null} data-origem="cliente" onClick={() => escolherCliente(e)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: "1px solid #F3F4F6", background: "#fff", cursor: criandoDeCliente !== null ? "wait" : "pointer", fontSize: 14, opacity: criandoDeCliente !== null && criandoDeCliente !== e.cliente_id ? 0.6 : 1 }}>
                  {e.nome}{e.cidade ? ` — ${e.cidade}` : ""}
                  <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: "#EEF2FF", color: "#3730A3", fontSize: 11, fontWeight: 700 }}>{criandoDeCliente === e.cliente_id ? "Preparando…" : "Cliente cadastrado"}</span>
                </button>
              ) : (
                <button key={e.id} type="button" onClick={() => escolher(e)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: "1px solid #F3F4F6", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                  {e.nome}{e.teste ? " (teste)" : ""}
                </button>
              ))}
            </div>
            {!novaAberta && empresas.length > 0 && <div style={{ marginTop: 8 }}>{atalhoNova}</div>}
            {novaAberta && (
              <div style={{ marginTop: 12, padding: 12, border: "1px solid #E5E7EB", borderRadius: 8, background: "#FAFAFA" }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
                  Empresa ainda não é cliente — cadastro só para registro. Cadastre como cliente quando fecharem negócio.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Nome da empresa</label>
                    <input style={inputStyle} value={nova.nome} maxLength={200} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
                  </div>
                  <div><label style={labelStyle}>Contato (opcional)</label><input style={inputStyle} value={nova.contato_nome} maxLength={200} onChange={(e) => setNova({ ...nova, contato_nome: e.target.value })} /></div>
                  <div><label style={labelStyle}>Telefone (opcional)</label><input style={inputStyle} value={nova.contato_telefone} maxLength={200} onChange={(e) => setNova({ ...nova, contato_telefone: e.target.value })} /></div>
                  <div><label style={labelStyle}>E-mail (opcional)</label><input style={inputStyle} type="email" value={nova.contato_email} maxLength={200} onChange={(e) => setNova({ ...nova, contato_email: e.target.value })} /></div>
                </div>
                {erroNova && <div style={{ marginTop: 8 }}><Aviso tipo="erro">{erroNova}</Aviso></div>}
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button type="button" style={{ ...btnPrimario, opacity: criandoEmpresa ? 0.6 : 1 }} disabled={criandoEmpresa} onClick={cadastrarEmpresa}>{criandoEmpresa ? "Cadastrando…" : "Cadastrar e usar"}</button>
                  <button type="button" style={btnSecundario} disabled={criandoEmpresa} onClick={() => { setNovaAberta(false); setErroNova(""); }}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}
        {empresa && empresa.teste !== undefined && (
          <div style={{ marginTop: 12 }}>
            {empresa.teste && <Aviso tipo="alerta">Empresa de TESTE: as propostas dela saem como TESTE-..., com marca TESTE no PDF, fora das listas dos vendedores e sem efeito no Funil.</Aviso>}
            <button type="button" style={{ ...btnSecundario, padding: "5px 12px", fontSize: 12, opacity: alternandoTeste ? 0.6 : 1 }} disabled={alternandoTeste} onClick={alternarTeste}>
              {empresa.teste ? "Desmarcar empresa de teste" : "Marcar como empresa de teste"}
            </button>
            {erroTeste && <div style={{ marginTop: 8 }}><Aviso tipo="erro">{erroTeste}</Aviso></div>}
          </div>
        )}
        {abertaDeOutro && (
          <div style={{ marginTop: 12 }}>
            <Aviso tipo="alerta">
              Já existe uma oportunidade aberta nesta empresa com {abertaDeOutro.vendedor_nome ?? "outro vendedor"} (fase: {rotuloEtapa(abertaDeOutro.etapa)}).
              Você pode criar o rascunho, mas não poderá marcá-lo como enviado enquanto essa oportunidade estiver aberta.
            </Aviso>
          </div>
        )}
      </div>

      {empresa && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          {modeloAtual === "MOT" ? (
            <>
              <Aviso tipo="alerta">Modelo em teste: esta proposta sai como TESTE-MOT-..., fora das listas dos vendedores e sem efeito no Funil.</Aviso>
              <CamposPropostaMot valor={camposMot} onChange={setCamposMot} contatos={empresa.contatos} contatoId={contatoId} onContato={setContatoId} onPrevia={setPreviaMot} />
            </>
          ) : (
            <CamposProposta valor={campos} onChange={setCampos} contatos={empresa.contatos} contatoId={contatoId} onContato={setContatoId} />
          )}
        </div>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div style={{ display: "flex", gap: 10 }}>
        <button style={{ ...btnPrimario, opacity: salvando || !empresa || bloqueadoPorCalculo ? 0.6 : 1 }} disabled={salvando || !empresa || bloqueadoPorCalculo} onClick={criar}>{salvando ? "Criando…" : "Criar rascunho"}</button>
        <button style={btnSecundario} onClick={() => router.push("/painel/comercial/propostas")}>Cancelar</button>
      </div>
    </div>
  );
}
