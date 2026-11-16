-- Efetivação do funcionário MOT / Terceirização (fase temporária).
-- "Efetivado" = deixou de ser temporário (contratado pelo cliente ou efetivado); continua ATIVO.
-- NÃO é desligamento: funcionarios.status e rescisoes não são tocados. O relógio de vencimento
-- (90/180/270 dias) para: quem tem efetivado_em preenchido sai de todos os alertas e contagens
-- de vencimento de contrato (ver src/lib/contratoMotStatus.ts).
--
-- Aditiva e idempotente: só acrescenta 3 colunas nulas e 1 constraint de consistência.
-- Nenhuma linha existente é alterada (todos os funcionários atuais ficam com efetivado_em = null,
-- ou seja, comportamento idêntico ao de hoje). Desfazer a efetivação = voltar as 3 colunas a null
-- (o histórico de quem efetivou/desfez fica em audit_logs, não aqui).
--
-- Sem policy nova: as colunas herdam as policies já existentes de public.funcionarios; todo acesso
-- do app passa pelo service role depois do gate de RH.

alter table public.funcionarios
  add column if not exists efetivado_em date,
  add column if not exists efetivado_por uuid,
  add column if not exists efetivado_obs text;

comment on column public.funcionarios.efetivado_em is
  'Data da efetivação (MOT/Terceirização deixou de ser temporário). NULL = não efetivado. Para o relógio de vencimento de contrato.';
comment on column public.funcionarios.efetivado_por is
  'auth.users.id de quem registrou a efetivação (sem FK, como criado_por em funcionario_mot_eventos).';
comment on column public.funcionarios.efetivado_obs is
  'Observação opcional da efetivação.';

-- Os 3 campos andam juntos: ou todos nulos (não efetivado) ou data + autor preenchidos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'funcionarios_efetivado_consistente_check'
      and conrelid = 'public.funcionarios'::regclass
  ) then
    alter table public.funcionarios
      add constraint funcionarios_efetivado_consistente_check
      check (
        (efetivado_em is null and efetivado_por is null and efetivado_obs is null)
        or (efetivado_em is not null and efetivado_por is not null)
      ) not valid;
  end if;
end;
$$;

-- Índice parcial: as listas/popups filtram "efetivado_em is null" só entre ativos MOT/Terceirização;
-- a tabela é pequena, então o índice é opcional — fica comentado de propósito.
-- create index if not exists funcionarios_efetivado_em_idx on public.funcionarios (efetivado_em) where efetivado_em is not null;
