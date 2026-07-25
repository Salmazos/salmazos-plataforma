-- Migração: separa Turno e Escala no formulário "Aprovar candidato" (MOT) do portal
-- do cliente. admissao_turno (já existente em candidatos_vagas) passa a guardar só o
-- turno (Turno A/B/C/D/Horário Administrativo/Outro) nos envios NOVOS de MOT;
-- admissao_escala guarda a escala (6x1/6x2/Fixa/Outro) separadamente.
--
-- Registros antigos NÃO são migrados/reclassificados — continuam com o valor
-- combinado antigo em admissao_turno (ex: "Escala 6x1") e admissao_escala fica NULL
-- pra eles, o que é esperado e não bloqueia nada (coluna é opcional).
--
-- Terceirização mantém o select combinado como estava — só MOT usa esta coluna nova.
--
-- Execute este SQL no SQL Editor do Supabase.

ALTER TABLE public.candidatos_vagas ADD COLUMN admissao_escala TEXT;
