"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { calcularValidadeAte } from "@/lib/propostas";
import { formatarPct, type CondicoesRs } from "@/lib/propostaModelos";
import CampoMoeda from "@/components/ui/CampoMoeda";
import { Aviso, btnPrimario, btnSecundario, fmtData, labelStyle, Modal } from "@/components/propostas/propostasUi";

interface Props {
  numero: string;
  clienteNome: string;
  condicoes: CondicoesRs;
  validadeDias: number;
  hoje: string;
  valorInicial: number | null;
  vendedorTemTelefone: boolean;
  onClose: () => void;
  onConfirmar: (valor: number) => Promise<string | null>;
}

export default function ModalMarcarEnviada({ numero, clienteNome, condicoes, validadeDias, hoje, valorInicial, vendedorTemTelefone, onClose, onConfirmar }: Props) {
  const [valor, setValor] = useState<number>(valorInicial ?? 0);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // O ref fecha a janela entre o clique e a nova renderização: dois cliques seguidos enviam uma vez só.
  const emAndamento = useRef(false);

  async function confirmar() {
    if (emAndamento.current) return;
    if (!(valor > 0)) { setErro("Informe o valor estimado (maior que zero)."); return; }
    emAndamento.current = true;
    setEnviando(true);
    setErro("");
    const msg = await onConfirmar(valor);
    if (msg) { setErro(msg); setEnviando(false); emAndamento.current = false; }
  }

  const linha = (rotulo: string, texto: string) => (
    <div style={{ display: "flex", gap: 8, fontSize: 14, padding: "3px 0" }}><span style={{ color: "#6B7280", minWidth: 150 }}>{rotulo}</span><strong>{texto}</strong></div>
  );

  return (
    <Modal titulo="Marcei como enviada" onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Valor estimado da proposta *</label>
        <CampoMoeda value={valor || null} onChange={setValor} placeholder="R$ 0,00" style={{ padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" }} />
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Este valor vai para a oportunidade do Funil.</div>
      </div>

      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 4 }}>RESUMO DA PROPOSTA QUE SERÁ REGISTRADA COMO ENVIADA</div>
        {linha("Número", numero)}
        {linha("Cliente", clienteNome)}
        {linha("Taxa sem reposição", formatarPct(condicoes.taxa_sem_reposicao_pct))}
        {linha("Taxa com reposição", formatarPct(condicoes.taxa_com_reposicao_pct))}
        {linha("Taxa de cancelamento", formatarPct(condicoes.taxa_cancelamento_pct))}
        {linha("Currículos em até", `${condicoes.prazo_envio_curriculos_dias_uteis} dias úteis`)}
        {linha("Faturamento", `até ${condicoes.prazo_faturamento_dias} dias de vencimento`)}
        {linha("Validade", `${validadeDias} dias, até ${fmtData(calcularValidadeAte(hoje, validadeDias))}`)}
      </div>

      <Aviso tipo="info">Confira que o PDF enviado foi gerado a partir desta versão.</Aviso>
      {!vendedorTemTelefone && (
        <Aviso tipo="alerta">Seu telefone não está no perfil e não aparecerá no PDF. <Link href="/painel/meu-perfil" style={{ fontWeight: 700, color: "inherit", textDecoration: "underline" }}>Abrir Meu Perfil</Link></Aviso>
      )}
      <Aviso tipo="info">A plataforma não envia e-mail: o PDF é gerado aqui e você o envia ao cliente. Ao confirmar, o Funil recebe a oportunidade em &quot;Proposta enviada&quot; e um lembrete de follow-up para 3 dias úteis.</Aviso>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={btnSecundario} onClick={onClose} disabled={enviando}>Voltar</button>
        <button style={{ ...btnPrimario, opacity: enviando ? 0.6 : 1 }} onClick={confirmar} disabled={enviando}>{enviando ? "Registrando…" : "Confirmar envio"}</button>
      </div>
    </Modal>
  );
}
