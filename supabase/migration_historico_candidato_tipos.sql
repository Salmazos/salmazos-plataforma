-- Nome da constraint conferido no banco em 2026-10-08: historico_candidato_tipo_check (única CHECK de tipo, 15 valores).
-- JÁ APLICADA EM PRODUÇÃO; este arquivo é só o registro local.
--
-- O que faz: alarga o CHECK de historico_candidato.tipo para os 15 valores do tipo TipoHistorico
-- (src/lib/registrarHistorico.ts). ADITIVA (só acrescenta valores aceitos, nenhum dado muda) e IDEMPOTENTE (pode rodar
-- mais de uma vez: derruba a constraint se existir e a recria igual).

alter table public.historico_candidato
  drop constraint if exists historico_candidato_tipo_check;

alter table public.historico_candidato
  add constraint historico_candidato_tipo_check
  check (tipo in (
    'cadastro',
    'etapa_alterada',
    'encaminhamento',
    'aprovacao_cliente',
    'reprovacao_cliente',
    'agendamento_cliente',
    'email_enviado',
    'whatsapp',
    'curriculo_atualizado',
    'triagem_ia',
    'match_ia',
    'comentario_interno',
    'retencao_ia',
    'contratado',
    'reprovado_final'
  ));
