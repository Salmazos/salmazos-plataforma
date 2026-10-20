-- Local da entrevista (texto livre) informado pelo cliente ao confirmar a data no portal, ou pela Salmazos ao
-- encaminhar/remarcar. ADITIVA (só acrescenta uma coluna opcional; nenhum dado existente muda) e IDEMPOTENTE
-- (pode rodar mais de uma vez). Sem default, sem NOT NULL, sem UPDATE: encaminhamentos antigos ficam com NULL e as
-- telas tratam NULL como "local não informado".
--
-- APLICAR ANTES do deploy do código que lê/grava a coluna: os selects do Kanban, do portal e do cron citam
-- local_entrevista e falham se a coluna ainda não existir.

alter table public.encaminhamentos
  add column if not exists local_entrevista text;
