"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { calcularValidadeAte } from "@/lib/propostas";
import type { PreviaMot } from "@/lib/propostaMot";
import { formatarCentavosBRL } from "@/lib/propostaMotCalculo";
import { Aviso, btnPrimario, btnSecundario, fmtData, Modal } from "@/components/propostas/propostasUi";

interface Props {
  numero: string;
  clienteNome: string;
  validadeDias: number;
  hoje: string;
  // Planilha calculada pelo servidor (percentuais vigentes hoje). null = não foi possível calcular (a mensagem vem em `erroCalculo`).
  previa: PreviaMot | null;
  erroCalculo: string | null;
  funcoes: { area: string; descricao?: string | null }[];
  vendedorTemTelefone: boolean;
  // Proposta de teste nunca mexe no Funil; só proposta real de quem tem Funil recebe a promessa de oportunidade/follow-up.
  temFunil: boolean;
  teste: boolean;
  onClose: () => void;
  onConfirmar: () => Promise<string | null>;
}

// "Marcar como enviada" do MOT: NÃO se digita valor. O valor da proposta é a soma dos valores mensais das funções, calculada pelo servidor no envio.
export default function ModalMarcarEnviadaMot({ numero, clienteNome, validadeDias, hoje, previa, erroCalculo, funcoes, vendedorTemTelefone, temFunil, teste, onClose, onConfirmar }: Props) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // O ref fecha a janela entre o clique e a nova renderização: dois cliques seguidos enviam uma vez só.
  const emAndamento = useRef(false);

  async function confirmar() {
    if (emAndamento.current || !previa) return;
    emAndamento.current = true;
    setEnviando(true);
    setErro("");
    const msg = await onConfirmar();
    if (msg) { setErro(msg); setEnviando(false); emAndamento.current = false; }
  }

  const linha = (rotulo: string, texto: string) => (
    <div style={{ display: "flex", gap: 8, fontSize: 14, padding: "3px 0" }}><span style={{ color: "#6B7280", minWidth: 150 }}>{rotulo}</span><strong>{texto}</strong></div>
  );

  return (
    <Modal titulo="Marcar como enviada" onClose={onClose} bloqueado={enviando}>
      {erroCalculo && <Aviso tipo="erro">{erroCalculo}</Aviso>}
      {previa && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>VALOR DA PROPOSTA (CALCULADO PELO SISTEMA)</div>
          {previa.funcoes.map((f, i) => f && (
            <div key={i} data-valor-funcao={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, padding: "2px 0" }}>
              <span>Função {i + 1}{funcoes[i] ? ` · ${funcoes[i].area}${funcoes[i].descricao ? ` — ${funcoes[i].descricao}` : ""}` : ""}</span>
              <strong>{formatarCentavosBRL(f.total_nf_centavos)}</strong>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 15, padding: "6px 0 0", marginTop: 4, borderTop: "1px solid #FCD34D" }}>
            <strong>Valor mensal total</strong>
            <strong data-total-mensal>{formatarCentavosBRL(previa.total_mensal_centavos)}</strong>
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
            Ninguém digita este valor: ele é a soma dos valores mensais das funções, com os percentuais em vigor no momento do envio.
            {teste ? " Como é uma proposta de teste, ele fica registrado só na proposta." : temFunil ? " Este valor vai para a oportunidade do Funil." : " Este valor fica registrado na proposta."}
          </div>
        </div>
      )}

      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 4 }}>RESUMO DA PROPOSTA QUE SERÁ REGISTRADA COMO ENVIADA</div>
        {linha("Número", numero)}
        {linha("Cliente", clienteNome)}
        {linha("Funções", String(funcoes.length))}
        {linha("Validade", `${validadeDias} dias, até ${fmtData(calcularValidadeAte(hoje, validadeDias))}`)}
      </div>

      <Aviso tipo="info">Confira o cálculo acima e que o PDF enviado foi gerado a partir desta versão.</Aviso>
      {!vendedorTemTelefone && (
        <Aviso tipo="alerta">Seu telefone não está no perfil e não aparecerá no PDF. <Link href="/painel/meu-perfil" style={{ fontWeight: 700, color: "inherit", textDecoration: "underline" }}>Abrir Meu Perfil</Link></Aviso>
      )}
      <Aviso tipo="info">
        {teste
          ? <>Proposta de TESTE: ao confirmar, ela passa para Enviada e a validade começa a contar. Nada vai para o Funil.</>
          : temFunil
            ? <>Ao confirmar, o Funil recebe a oportunidade em &quot;Proposta enviada&quot; e um lembrete de follow-up para 3 dias úteis.</>
            : <>Ao confirmar, a proposta passa para Enviada e a validade começa a contar.</>}
      </Aviso>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={btnSecundario} onClick={onClose} disabled={enviando}>Voltar</button>
        <button style={{ ...btnPrimario, opacity: enviando || !previa ? 0.6 : 1 }} onClick={confirmar} disabled={enviando || !previa}>{enviando ? "Registrando…" : "Confirmar envio"}</button>
      </div>
    </Modal>
  );
}
