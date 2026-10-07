-- Eventos do contrato de mão de obra temporária (MOT): prorrogação, início e fim de afastamento.
-- Alimenta as ações do aviso "Vencimentos de contrato MOT" (popup do painel) e o bloco "Contrato MOT"
-- da ficha do funcionário.
--
-- APPEND-ONLY de propósito: um evento lançado errado nunca é apagado nem editado — é anulado por uma
-- linha de correção (corrige_evento_id aponta pro evento anulado). Quem calcula o resumo
-- (src/lib/contratoMotEventos.ts) ignora tanto o evento anulado quanto a própria linha de correção.
--
-- Dado de saúde (afastamento/benefício INSS, LGPD): SEM policy de leitura pro cliente do portal —
-- diferente de funcionarios/funcionario_contratos, que têm "cliente_le_proprios". Todo acesso do app
-- passa pelo service role, depois do gate de RH.
--
-- Idempotente: pode rodar mais de uma vez sem erro.

create table if not exists public.funcionario_mot_eventos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo text not null,
  data_evento date not null,
  tipo_beneficio text,
  observacoes text,
  -- Aditivo de prorrogação (opcional). Fica em admissao-docs/aditivos/..., NUNCA em
  -- funcionario_contratos (a ficha usa contratos[0] como "contrato atual").
  arquivo_path text,
  nome_arquivo_original text,
  corrige_evento_id uuid references public.funcionario_mot_eventos(id),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint funcionario_mot_eventos_tipo_check
    check (tipo = any (array['prorrogacao', 'afastamento_inicio', 'afastamento_fim'])),
  constraint funcionario_mot_eventos_beneficio_check
    check (tipo_beneficio is null or tipo_beneficio = any (array['auxilio_doenca', 'acidentario', 'outro'])),
  constraint funcionario_mot_eventos_beneficio_so_no_inicio_check
    check (tipo_beneficio is null or tipo = 'afastamento_inicio'),
  constraint funcionario_mot_eventos_arquivo_so_na_prorrogacao_check
    check (arquivo_path is null or tipo = 'prorrogacao'),
  constraint funcionario_mot_eventos_nao_corrige_a_si_check
    check (corrige_evento_id is null or corrige_evento_id <> id)
);

create index if not exists funcionario_mot_eventos_funcionario_data_idx
  on public.funcionario_mot_eventos (funcionario_id, data_evento);
create index if not exists funcionario_mot_eventos_corrige_idx
  on public.funcionario_mot_eventos (corrige_evento_id) where corrige_evento_id is not null;

alter table public.funcionario_mot_eventos enable row level security;

-- Imutabilidade: nenhum UPDATE, e nenhum DELETE direto — vale até pro service role (que ignora RLS).
-- O DELETE em cascata (pg_trigger_depth() > 1) continua liberado, senão apagar o funcionário
-- (ex: cancelamento de admissão, api/admissoes/[id]/cancelar) passaria a falhar.
create or replace function public.funcionario_mot_eventos_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'funcionario_mot_eventos é append-only: para corrigir, registre uma linha com corrige_evento_id';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'funcionario_mot_eventos_imutavel' and tgrelid = 'public.funcionario_mot_eventos'::regclass
  ) then
    create trigger funcionario_mot_eventos_imutavel
      before update or delete on public.funcionario_mot_eventos
      for each row execute function public.funcionario_mot_eventos_imutavel();
  end if;
end;
$$;

-- Policies. "to <role>" é obrigatório (sem ele a policy vale pra public, inclui anon). Só select e insert
-- pra analistas (não é "analistas_all" como em funcionarios: append-only). Sem policy pra cliente.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'funcionario_mot_eventos' and policyname = 'analistas_select'
  ) then
    create policy "analistas_select" on public.funcionario_mot_eventos
      for select to authenticated
      using ((select public.is_analista()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'funcionario_mot_eventos' and policyname = 'analistas_insert'
  ) then
    create policy "analistas_insert" on public.funcionario_mot_eventos
      for insert to authenticated
      with check ((select public.is_analista()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'funcionario_mot_eventos' and policyname = 'Service role total funcionario_mot_eventos'
  ) then
    create policy "Service role total funcionario_mot_eventos" on public.funcionario_mot_eventos
      for all to service_role
      using (true)
      with check (true);
  end if;
end;
$$;
