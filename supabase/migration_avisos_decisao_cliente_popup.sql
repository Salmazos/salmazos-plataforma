-- Sino e popup configuráveis quando o CLIENTE aprova ou reprova um candidato no portal.
-- Reaproveita os eventos portal_candidato_aprovado e portal_candidato_reprovado (grupo portal_cliente), que até
-- aqui só tinham o canal e-mail. O canal e-mail e o comportamento dele NÃO mudam.
-- Depende de migration_avisos_unificados.sql e migration_avisos_fase1b.sql (já aplicadas).
-- ADITIVA e idempotente. Sem custo: uma tabela pequena (uma linha por aviso visto, por usuário).
--
-- Semântica (no código):
--   SINO : sem linha de canal ou erro de leitura = LIGADO (como era); só ativo = false desliga. Quem recebe: o
--          responsável do candidato (sempre) MAIS a lista do canal sino; sem os dois, a linha geral da unidade.
--   POPUP: sem linha de canal ou erro de leitura = NÃO mostra. Sem lista própria: segue as linhas nominais do sino.

-- ── 1. Os 2 eventos passam a suportar sino e popup ───────────────────────────
update public.aviso_eventos
   set canais_suportados = array['email', 'sino', 'popup']
 where evento in ('portal_candidato_aprovado', 'portal_candidato_reprovado');

-- ── 2. Liga/desliga inicial: sino e popup ligados nos 2 eventos ──────────────
-- Não toca no canal e-mail (aprovado ligado; reprovado desligado) nem em escolhas já feitas (on conflict).
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('portal_candidato_aprovado',  'sino',  true),
  ('portal_candidato_aprovado',  'popup', true),
  ('portal_candidato_reprovado', 'sino',  true),
  ('portal_candidato_reprovado', 'popup', true)
on conflict (evento, canal) do nothing;

-- ── 3. "Já visto" do popup, por aviso e por usuário ──────────────────────────
-- notificacoes_analista.id é uuid (conferido). Cascade nos dois lados: apagar o aviso ou o usuário limpa o visto.
create table if not exists public.notificacao_popup_vistos (
  id uuid primary key default gen_random_uuid(),
  notificacao_id uuid not null references public.notificacoes_analista(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  visto_em timestamptz not null default now(),
  unique (notificacao_id, user_id)
);

-- O unique já cobre a busca por aviso; este índice cobre a busca e a exclusão em cascata por usuário.
create index if not exists idx_notificacao_popup_vistos_user on public.notificacao_popup_vistos (user_id);

alter table public.notificacao_popup_vistos enable row level security;
revoke all on public.notificacao_popup_vistos from anon, authenticated;
drop policy if exists "Service role total notificacao_popup_vistos" on public.notificacao_popup_vistos;
create policy "Service role total notificacao_popup_vistos"
  on public.notificacao_popup_vistos for all to service_role using (true) with check (true);

-- ── 4. Restauração do padrão: aceitar canal ligado SEM lista quando o código permitir ──
-- Mesma função de migration_avisos_fase1b.sql, com UMA mudança: o canal pode trazer "permite_vazio": true (o código
-- só envia isso para sino e popup dos 2 eventos acima, onde o responsável sempre é avisado). Sem a chave, a regra do
-- último destinatário continua exatamente como era (ULTIMO_DESTINATARIO). create or replace é idempotente.
create or replace function public.avisos_restaurar_padrao(p_payload jsonb)
returns integer
language plpgsql
as $$
declare
  ev jsonb;
  ca jsonb;
  d jsonb;
  v_evento text;
  v_canal text;
  v_ativo boolean;
  v_total integer := 0;
begin
  for ev in select value from jsonb_array_elements(coalesce(p_payload->'eventos', '[]'::jsonb)) loop
    v_evento := ev->>'evento';
    if not exists (select 1 from public.aviso_eventos where evento = v_evento) then
      raise exception 'EVENTO_INEXISTENTE:%', v_evento;
    end if;

    for ca in select value from jsonb_array_elements(coalesce(ev->'canais', '[]'::jsonb)) loop
      v_canal := ca->>'canal';
      v_ativo := coalesce((ca->>'ativo')::boolean, true);

      if v_ativo
         and jsonb_array_length(coalesce(ca->'destinatarios', '[]'::jsonb)) = 0
         and not coalesce((ca->>'permite_vazio')::boolean, false) then
        raise exception 'ULTIMO_DESTINATARIO:%:%', v_evento, v_canal;
      end if;

      insert into public.aviso_eventos_canais (evento, canal, ativo, atualizado_em)
      values (v_evento, v_canal, v_ativo, now())
      on conflict (evento, canal) do update set ativo = excluded.ativo, atualizado_em = now();

      delete from public.aviso_destinatarios where evento = v_evento and canal = v_canal;

      for d in select value from jsonb_array_elements(coalesce(ca->'destinatarios', '[]'::jsonb)) loop
        if d->>'tipo_destinatario' = 'usuario' then
          insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo)
          values (v_evento, v_canal, 'usuario', (d->>'usuario_id')::uuid, true);
        else
          insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, email, nome, ativo)
          values (v_evento, v_canal, 'email', lower(d->>'email'), d->>'nome', true);
        end if;
        v_total := v_total + 1;
      end loop;
    end loop;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.avisos_restaurar_padrao(jsonb) from public, anon, authenticated;
grant execute on function public.avisos_restaurar_padrao(jsonb) to service_role;

-- ── 5. Conferência (só leitura; rodar DEPOIS de aplicar) ─────────────────────
-- Canais suportados dos 2 eventos (esperado: {email,sino,popup} nos dois):
--   select evento, canais_suportados from public.aviso_eventos
--   where evento in ('portal_candidato_aprovado', 'portal_candidato_reprovado');
--
-- Linhas de canal (esperado: 6 linhas; e-mail aprovado = true, e-mail reprovado = false, sino e popup = true):
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento in ('portal_candidato_aprovado', 'portal_candidato_reprovado') order by evento, canal;
--
-- Tabela criada, com RLS ligada (esperado: relrowsecurity = true):
--   select relname, relrowsecurity from pg_class where relname = 'notificacao_popup_vistos';
--
-- Sem acesso para anon/authenticated (esperado: só service_role aparece):
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'notificacao_popup_vistos' order by 1, 2;
--
-- Destinatários desses eventos por canal (esperado: e-mail 2 por evento = olver@ e rh@; sino 0; popup 0):
--   select evento, canal, count(*) from public.aviso_destinatarios
--   where evento in ('portal_candidato_aprovado', 'portal_candidato_reprovado') group by 1, 2 order by 1, 2;
--
-- A função aceita "permite_vazio" (esperado: true):
--   select pg_get_functiondef('public.avisos_restaurar_padrao(jsonb)'::regprocedure) like '%permite_vazio%';
