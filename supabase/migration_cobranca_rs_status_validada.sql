-- Adiciona o status 'validada' ao ciclo de vida de cobrancas_rs.
--
-- Contexto: o status 'aprovada_enviada' era usado pra dois momentos diferentes ao mesmo
-- tempo -- "enviada pra diretoria, ainda sem data de vencimento" e "diretoria ja definiu a
-- data, so falta pagar" -- fazendo a aba "Aguardando validacao" nunca esvaziar mesmo depois
-- da diretoria ja ter validado (definido a data de vencimento) uma cobranca. Nao havia status
-- proprio pra esse segundo momento.
--
-- Novo ciclo: pendente_revisao -> aprovada_enviada -> validada -> paga
-- (cancelada continua como ramificacao lateral a partir de qualquer um dos 3 primeiros)
--
-- A transicao aprovada_enviada -> validada acontece em
-- src/app/api/cobrancas-rs/[id]/vencimento/route.ts, no momento em que a diretoria salva a
-- data de vencimento pela primeira vez (ver comentario no codigo).

alter table cobrancas_rs drop constraint if exists cobrancas_rs_status_check;

alter table cobrancas_rs add constraint cobrancas_rs_status_check
  check (status = any (array['pendente_revisao', 'aprovada_enviada', 'validada', 'paga', 'cancelada']));

-- Backfill: cobrancas que hoje estao em 'aprovada_enviada' mas ja tem data_vencimento
-- preenchida sao, pela nova definicao, 'validada' -- a diretoria ja fez a parte dela, so
-- falta o pagamento. Nao mexe em quem ainda nao tem data_vencimento (essas continuam
-- corretamente em 'aprovada_enviada', aguardando a diretoria definir a data).
update cobrancas_rs
  set status = 'validada'
  where status = 'aprovada_enviada'
    and data_vencimento is not null;
