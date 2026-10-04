-- Avisos unificados — Fase 1b: rescisão paga, grupo "Portal do cliente" e função de restauração.
-- Depende de migration_avisos_unificados.sql (já aplicada). SOMENTE ADIÇÃO: nenhuma tabela antiga
-- é alterada ou apagada; o único ajuste em objeto existente é ALARGAR o CHECK de grupo de
-- aviso_eventos (passa a aceitar 'portal_cliente'). Idempotente: pode rodar mais de uma vez.

-- ── 1. CHECK de grupo aceita 'portal_cliente' (alargamento) ──────────────────
alter table public.aviso_eventos drop constraint if exists aviso_eventos_grupo_check;
alter table public.aviso_eventos
  add constraint aviso_eventos_grupo_check check (grupo in ('vagas','rescisao','aso','portal_cliente'));

-- ── 2. Novos eventos ─────────────────────────────────────────────────────────
-- Canais suportados = só os que o aviso realmente tem hoje:
--  • rescisao_paga: só sino (e o popup de login, que deriva do sino) — não há e-mail.
--  • portal_*: só e-mail. O sino de aprovação/reprovação vai para o responsável pelo candidato
--    (regra fixa, não é lista), então não vira configuração.
--  • indicacao_decisao_cliente: só e-mail (não há sino nesse fluxo).
insert into public.aviso_eventos (evento, grupo, descricao, canais_suportados) values
  ('rescisao_paga',              'rescisao',       'Rescisão paga',                                array['sino']),
  ('portal_candidato_aprovado',  'portal_cliente', 'Cliente aprovou candidato no portal',      array['email']),
  ('portal_candidato_reprovado', 'portal_cliente', 'Cliente reprovou candidato no portal',     array['email']),
  ('indicacao_decisao_cliente',  'portal_cliente', 'Indicação direta aprovada pela Salmazos',  array['email'])
on conflict (evento) do nothing;

-- ── 3. Liga/desliga inicial (igual ao comportamento de hoje) ─────────────────
insert into public.aviso_eventos_canais (evento, canal, ativo) values
  ('rescisao_paga',              'sino',  true),
  ('portal_candidato_aprovado',  'email', true),
  -- Hoje NÃO existe e-mail interno de reprovação: nasce desligado para nada mudar.
  ('portal_candidato_reprovado', 'email', false),
  ('indicacao_decisao_cliente',  'email', true)
on conflict (evento, canal) do nothing;

-- ── 4. Carga das listas atuais ───────────────────────────────────────────────
-- rescisao_paga (sino): a mesma lista global de plataforma que avisarRescisaoPaga usa hoje.
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, usuario_id, ativo, criado_em)
select 'rescisao_paga', 'sino', 'usuario', d.usuario_id, true, d.criado_em
from public.rescisao_avisos_plataforma_destinatarios d
on conflict do nothing;

-- Portal: olver@ e rh@ (hoje fixos no código). Para reprovação a lista já fica pronta, mas o canal
-- está desligado (item 3).
insert into public.aviso_destinatarios (evento, canal, tipo_destinatario, email, nome, ativo)
select e.evento, 'email', 'email', d.email, d.nome, true
from (values ('portal_candidato_aprovado'), ('portal_candidato_reprovado'), ('indicacao_decisao_cliente')) as e(evento)
cross join (values ('olver@salmazos.com.br', 'Olver'), ('rh@salmazos.com.br', 'RH')) as d(email, nome)
on conflict do nothing;

-- ── 5. Restauração transacional do "padrão do sistema" ───────────────────────
-- Uma função SQL roda numa única transação: ou aplica tudo ou nada. Quem decide o padrão é o
-- código (src/lib/avisosPadrao.ts); a função só aplica o payload recebido.
-- Formato: {"eventos":[{"evento":"vaga_criada","canais":[{"canal":"email","ativo":true,
--           "destinatarios":[{"tipo_destinatario":"email","nome":"X","email":"x@y.com"},
--                            {"tipo_destinatario":"usuario","usuario_id":"<uuid>"}]}]}]}
-- Regra do último destinatário: canal ligado sem nenhum destinatário aborta tudo.
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

      if v_ativo and jsonb_array_length(coalesce(ca->'destinatarios', '[]'::jsonb)) = 0 then
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

-- ── 6. Conferência (rodar depois; só leitura) ────────────────────────────────
--   select evento, canal, ativo from public.aviso_eventos_canais
--   where evento in ('rescisao_paga','portal_candidato_aprovado','portal_candidato_reprovado','indicacao_decisao_cliente');
--
--   select evento, canal, count(*) total, count(*) filter (where ativo) ativos
--   from public.aviso_destinatarios
--   where evento in ('rescisao_paga','portal_candidato_aprovado','portal_candidato_reprovado','indicacao_decisao_cliente')
--   group by 1, 2 order by 1, 2;
--   -- esperado: rescisao_paga/sino = nº de linhas de rescisao_avisos_plataforma_destinatarios (3 hoje);
--   --           cada evento portal = email com 2 (olver@ e rh@).
--
--   select count(*) from public.rescisao_avisos_plataforma_destinatarios;
--   select proname from pg_proc where proname = 'avisos_restaurar_padrao';
