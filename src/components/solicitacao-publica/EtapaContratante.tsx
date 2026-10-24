"use client";

import { mascararCnpj, mascararCpf, mascararTelefone } from "@/lib/documentoBr";
import { CampoTexto, Segmentado } from "./controles";
import type { PropsEtapa } from "./tipos";

export default function EtapaContratante({ form, atualizar, erros }: PropsEtapa) {
  const pj = form.tipo_pessoa === "pj";
  return (
    <div className="space-y-5">
      <Segmentado
        id="campo-tipo_pessoa"
        rotulo="Quem está contratando?"
        opcoes={[
          { id: "pj", label: "Pessoa jurídica" },
          { id: "pf", label: "Pessoa física" },
        ]}
        valor={form.tipo_pessoa}
        onChange={(v) => atualizar("tipo_pessoa", v)}
      />

      <CampoTexto
        id="campo-nome"
        rotulo={pj ? "Empresa contratante" : "Nome completo"}
        obrigatorio
        valor={form.nome}
        onChange={(v) => atualizar("nome", v)}
        placeholder={pj ? "Ex.: Indústria Exemplo Ltda" : "Ex.: Maria da Silva"}
        autoComplete={pj ? "organization" : "name"}
        maxLength={150}
        erro={erros.nome}
      />

      <CampoTexto
        id="campo-documento"
        rotulo={pj ? "CNPJ" : "CPF"}
        obrigatorio
        valor={form.documento}
        onChange={(v) => atualizar("documento", pj ? mascararCnpj(v) : mascararCpf(v))}
        placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
        inputMode="numeric"
        maxLength={18}
        ajuda="Usamos apenas para identificar o contratante."
        erro={erros.documento}
      />

      {pj && (
        <CampoTexto
          id="campo-contato_nome"
          rotulo="Nome do contato"
          obrigatorio
          valor={form.contato_nome}
          onChange={(v) => atualizar("contato_nome", v)}
          placeholder="Quem vai acompanhar esta vaga?"
          autoComplete="name"
          maxLength={120}
          erro={erros.contato_nome}
        />
      )}

      <CampoTexto
        id="campo-telefone"
        rotulo="Telefone ou WhatsApp"
        obrigatorio
        tipo="tel"
        valor={form.telefone}
        onChange={(v) => atualizar("telefone", mascararTelefone(v))}
        placeholder="(19) 99999-9999"
        inputMode="tel"
        autoComplete="tel"
        maxLength={16}
        erro={erros.telefone}
      />

      <CampoTexto
        id="campo-endereco"
        rotulo="Endereço"
        valor={form.endereco}
        onChange={(v) => atualizar("endereco", v)}
        placeholder="Rua, número, bairro e cidade"
        autoComplete="street-address"
        maxLength={300}
        erro={erros.endereco}
      />

      <CampoTexto
        id="campo-email"
        rotulo="E-mail"
        obrigatorio
        tipo="email"
        valor={form.email}
        onChange={(v) => atualizar("email", v)}
        placeholder="nome@suaempresa.com.br"
        inputMode="email"
        autoComplete="email"
        maxLength={150}
        erro={erros.email}
      />

      <div className="space-y-3 rounded-xl bg-gray-50 p-4">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base text-gray-900">
          <input
            type="checkbox"
            checked={form.mesmo_email}
            onChange={(e) => atualizar("mesmo_email", e.target.checked)}
            className="h-6 w-6 shrink-0"
          />
          <span>Usar o mesmo e-mail para receber a nota fiscal</span>
        </label>
        {!form.mesmo_email && (
          <CampoTexto
            id="campo-email_nf"
            rotulo="E-mail para envio da nota fiscal"
            obrigatorio
            tipo="email"
            valor={form.email_nf}
            onChange={(v) => atualizar("email_nf", v)}
            placeholder="financeiro@suaempresa.com.br"
            inputMode="email"
            maxLength={150}
            erro={erros.email_nf}
          />
        )}
      </div>
    </div>
  );
}
