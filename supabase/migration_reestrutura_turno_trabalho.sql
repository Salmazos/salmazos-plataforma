-- Reestruturação de Turno/Horário de Trabalho.
--
-- A implementação anterior (classificação automática 1º/2º/3º Turno/ADM/Dia/Noite a partir
-- de hora_inicio/hora_fim, ver classificarTurno.ts) fica obsoleta e é removida — nunca foi
-- usada de fato em produção (turno_hora_inicio/turno_hora_fim seguiam 100% vazios em todos os
-- 45 funcionários). A fonte de verdade correta: RH preenche "Horário de trabalho" (texto
-- livre, já existia em admissoes) e "Turno" (menu fixo, novo) na tela de Admissão, os dois
-- propagam pra funcionarios quando a admissão vira funcionário, e continuam editáveis lá
-- direto pra cobrir casos legados que nunca passaram por essa tela.
--
-- funcionarios.turno_trabalho já guardava só o texto livre do horário (nunca uma
-- classificação de verdade, ver acima) — renomeia pra horario_trabalho, que é literalmente
-- o que ele sempre foi, e evita a ambiguidade de nome com o novo campo turno (menu fixo).
alter table public.funcionarios rename column turno_trabalho to horario_trabalho;
alter table public.funcionarios drop column turno_hora_inicio;
alter table public.funcionarios drop column turno_hora_fim;

alter table public.funcionarios add column turno text;
alter table public.admissoes add column turno text;

comment on column public.funcionarios.horario_trabalho is
  'Horário de trabalho (texto livre) — propagado de admissoes.horario_trabalho quando a admissão vira funcionário, editável depois para casos legados que nunca passaram pela tela de Admissão.';
comment on column public.funcionarios.turno is
  'Turno de trabalho — menu fixo (Turno A/B/C/D, Adm, 12x36 Noite, 12x36 Dia — ver TURNOS_FUNCIONARIO em src/lib/constants.ts), propagado de admissoes.turno quando a admissão vira funcionário, editável depois para casos legados.';
comment on column public.admissoes.turno is
  'Turno de trabalho — menu fixo (ver TURNOS_FUNCIONARIO em src/lib/constants.ts), preenchido pelo RH junto com horario_trabalho na tela de Admissão.';
