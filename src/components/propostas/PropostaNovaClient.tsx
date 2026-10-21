"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rotuloEtapa } from "@/lib/comercialRotulos";
import { MODELOS, MODELOS_ATIVOS, ROTULO_MODELO, type ModeloProposta } from "@/lib/propostas";
import CamposProposta, { camposPadrao, conteudoDoForm, validadeDoForm, type CamposForm } from "@/components/propostas/CamposProposta";
import { Aviso, btnPrimario, btnSecundario, cardStyle, inputStyle, labelStyle, lerResposta } from "@/components/propostas/propostasUi";

interface Contato { id: string; nome: string; cargo: string | null; principal: boolean }
interface EmpresaOpc { id: string; nome: string; contatos: Contato[]; oportunidade_aberta: { id: string; vendedor_nome: string | null; etapa: string } | null }

export default function PropostaNovaClient({ meuNome }: { meuNome: string }) {
  const router = useRouter();
  const [modelo, setModelo] = useState<ModeloProposta>("RS");
  const [busca, setBusca] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaOpc[]>([]);
  const [empresa, setEmpresa] = useState<EmpresaOpc | null>(null);
  const [contatoId, setContatoId] = useState("");
  const [campos, setCampos] = useState<CamposForm>(camposPadrao());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroBusca, setErroBusca] = useState("");
  const emAndamento = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carteira da unidade do vendedor (a rota já filtra por unidade). Uma busca por pausa na digitação, sem repetição automática.
  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      try {
        const r = await lerResposta<{ data: EmpresaOpc[] }>(await fetch(`/api/comercial/empresas?q=${encodeURIComponent(busca.trim())}`));
        if (r.ok) { setEmpresas(r.json.data ?? []); setErroBusca(""); }
        else setErroBusca(r.json.error ?? "Não foi possível buscar as empresas.");
      } catch {
        setErroBusca("Não foi possível buscar as empresas.");
      }
    }, busca ? 300 : 0);
    return () => { if (temporizador.current) clearTimeout(temporizador.current); };
  }, [busca]);

  function escolher(e: EmpresaOpc) {
    setEmpresa(e);
    const principal = e.contatos.find((c) => c.principal) ?? e.contatos[0];
    setContatoId(principal?.id ?? "");
    setCampos((c) => ({ ...c, aos_cuidados: principal?.nome ?? c.aos_cuidados }));
  }

  // A lista da Carteira só traz o NOME do vendedor da oportunidade aberta: é o que dá para comparar aqui.
  // O servidor confere de novo (id) e devolve o mesmo aviso ao criar.
  const abertaDeOutro = empresa?.oportunidade_aberta && empresa.oportunidade_aberta.vendedor_nome !== meuNome ? empresa.oportunidade_aberta : null;

  async function criar() {
    if (emAndamento.current) return;
    if (!empresa) { setErro("Escolha a empresa da Carteira."); return; }
    emAndamento.current = true;
    setSalvando(true);
    setErro("");
    // Depois de criar, o botão continua travado até a navegação: sem isso um segundo clique criaria outra proposta.
    let navegou = false;
    try {
      const r = await lerResposta<{ data: { id: string }; aviso: string | null }>(await fetch("/api/comercial/propostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelo,
          empresa_visitada_id: empresa.id,
          contato_id: contatoId || null,
          aos_cuidados: campos.aos_cuidados.trim() || null,
          validade_dias: validadeDoForm(campos),
          conteudo: conteudoDoForm(campos),
        }),
      }));
      if (!r.ok) { setErro(r.json.error ?? "Não foi possível criar a proposta."); return; }
      navegou = true;
      router.push(`/painel/comercial/propostas/${r.json.data.id}${r.json.aviso ? `?aviso=${encodeURIComponent(r.json.aviso)}` : ""}`);
    } catch {
      setErro("Não foi possível criar a proposta.");
    } finally {
      if (!navegou) {
        setSalvando(false);
        emAndamento.current = false;
      }
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}><Link href="/painel/comercial/propostas" style={{ fontSize: 13, color: "#6B7280" }}>← Propostas</Link></div>
      <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 800, color: "#111827" }}>Nova proposta</h1>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={labelStyle}>Modelo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {MODELOS.map((m) => {
            const ativo = MODELOS_ATIVOS.includes(m);
            const sel = modelo === m;
            return (
              <button key={m} type="button" disabled={!ativo} onClick={() => ativo && setModelo(m)}
                style={{ textAlign: "left", padding: 12, borderRadius: 10, border: sel ? "2px solid #FFB800" : "1px solid #D1D5DB", background: ativo ? "#fff" : "#F9FAFB", color: ativo ? "#111827" : "#9CA3AF", cursor: ativo ? "pointer" : "not-allowed" }}>
                <div style={{ fontWeight: 800 }}>{ROTULO_MODELO[m]}</div>
                <div style={{ fontSize: 12 }}>{ativo ? "Disponível" : "Em breve"}</div>
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
            <button type="button" style={btnSecundario} onClick={() => setEmpresa(null)}>Trocar empresa</button>
          </div>
        ) : (
          <>
            <input style={inputStyle} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite parte do nome da empresa" />
            {erroBusca && <div style={{ marginTop: 8 }}><Aviso tipo="erro">{erroBusca}</Aviso></div>}
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              {empresas.length === 0 ? <div style={{ padding: 12, color: "#6B7280", fontSize: 13 }}>Nenhuma empresa da Carteira da sua unidade encontrada.</div> : empresas.map((e) => (
                <button key={e.id} type="button" onClick={() => escolher(e)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: "1px solid #F3F4F6", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                  {e.nome}
                </button>
              ))}
            </div>
          </>
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
          <CamposProposta valor={campos} onChange={setCampos} contatos={empresa.contatos} contatoId={contatoId} onContato={setContatoId} />
        </div>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div style={{ display: "flex", gap: 10 }}>
        <button style={{ ...btnPrimario, opacity: salvando || !empresa ? 0.6 : 1 }} disabled={salvando || !empresa} onClick={criar}>{salvando ? "Criando…" : "Criar rascunho"}</button>
        <button style={btnSecundario} onClick={() => router.push("/painel/comercial/propostas")}>Cancelar</button>
      </div>
    </div>
  );
}
