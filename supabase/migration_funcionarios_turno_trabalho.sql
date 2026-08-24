-- Turno de Trabalho estruturado em funcionarios.
--
-- turno_hora_inicio/turno_hora_fim são o dado bruto (horário de entrada/saída), preenchidos
-- pelo RH via input de hora. turno_trabalho passa a armazenar só a CLASSIFICAÇÃO final
-- ("1º Turno"/"2º Turno"/"3º Turno"/"ADM"/"Dia"/"Noite"/"Não identificado"), calculada por
-- src/lib/classificarTurno.ts a partir dos dois horários, ou definida manualmente pelo RH via
-- override quando o cálculo não bate com nenhuma janela conhecida — nunca mais texto livre
-- digitado diretamente.
alter table public.funcionarios
  add column turno_trabalho text,
  add column turno_hora_inicio time,
  add column turno_hora_fim time;

comment on column public.funcionarios.turno_trabalho is
  'Classificação do turno (1º Turno/2º Turno/3º Turno/ADM/Dia/Noite/Não identificado) — calculada a partir de turno_hora_inicio/turno_hora_fim, ou definida manualmente via override.';
comment on column public.funcionarios.turno_hora_inicio is 'Horário de entrada do turno — dado bruto usado pra calcular turno_trabalho.';
comment on column public.funcionarios.turno_hora_fim is 'Horário de saída do turno — dado bruto usado pra calcular turno_trabalho.';

-- Backfill: só copia o texto livre de admissoes.horario_trabalho pra turno_trabalho, sem
-- tentar parsear pra hora_inicio/hora_fim (texto livre demais pra parsear com segurança —
-- risco de classificar errado). Fica visível pro RH revisar e preencher os horários
-- estruturados manualmente depois. hora_inicio/hora_fim ficam null nesses casos de propósito.
update public.funcionarios f
set turno_trabalho = a.horario_trabalho
from public.admissoes a
where f.admissao_id = a.id
  and a.horario_trabalho is not null
  and a.horario_trabalho <> '';
