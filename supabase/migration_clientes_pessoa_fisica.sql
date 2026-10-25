-- Cliente pessoa física (CPF) e e-mail da nota fiscal.
--
-- Por quê: o link público de solicitação de vaga aceita PF ou PJ, e hoje clientes só tem cnpj. Sem esta migração não há onde gravar o CPF de
-- quem contrata como pessoa física, nem o e-mail para onde sai a nota fiscal (o cliente informa no link; hoje só existe dentro da
-- solicitação). O CPF fica em coluna PRÓPRIA (não dentro de cnpj): a trava de duplicidade, o índice único e a Cobrança R&S continuam
-- tratando cnpj como CNPJ.
--
-- O que faz (idempotente: pode rodar de novo sem efeito colateral; tudo numa transação):
--   1) clientes.tipo_pessoa text not null default 'pj' ('pj' | 'pf') — os clientes existentes viram 'pj';
--   2) clientes.cpf text (nulo) e clientes.email_nota_fiscal text (nulo);
--   3) check: cpf e cnpj nunca juntos no mesmo cadastro;
--   4) índice único: dois clientes ATIVOS não podem ter o mesmo CPF (compara só os dígitos, como o do CNPJ). Antes de criá-lo, a migração
--      ABORTA com mensagem clara se já houver CPF repetido entre ativos. Hoje não há nenhum CPF cadastrado: a proteção vale para reexecução
--      e para qualquer carga futura anterior à migração.
-- Não altera nenhum dado existente. Não mexe em cnpj nem no índice clientes_cnpj_ativo_unico.
--
-- COMO RODAR: SQL Editor do Supabase, o arquivo inteiro de uma vez (ele já tem begin/commit). Depois rode o bloco de VERIFICAÇÃO.
-- ROLLBACK: bloco ao final (comentado, com trava: só remove as colunas se ninguém usou).

begin;

alter table public.clientes add column if not exists tipo_pessoa text not null default 'pj';
alter table public.clientes add column if not exists cpf text;
alter table public.clientes add column if not exists email_nota_fiscal text;

alter table public.clientes drop constraint if exists clientes_tipo_pessoa_check;
alter table public.clientes add constraint clientes_tipo_pessoa_check check (tipo_pessoa in ('pj', 'pf'));

alter table public.clientes drop constraint if exists clientes_documento_coerente;
alter table public.clientes add constraint clientes_documento_coerente check (cpf is null or cnpj is null);

-- Aborta (e desfaz a transação inteira) se o índice único não puder ser criado. A mensagem traz só a quantidade, nunca o CPF.
do $$
declare
  repetidos integer;
begin
  select count(*) into repetidos
  from (
    select regexp_replace(cpf, '\D', '', 'g') as digitos
    from public.clientes
    where ativo and nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '') is not null
    group by 1
    having count(*) > 1
  ) d;
  if repetidos > 0 then
    raise exception 'Migração abortada: % CPF(s) repetido(s) entre clientes ativos. Inative ou corrija os cadastros repetidos e rode de novo. Para listar: select regexp_replace(cpf, ''\D'', '''', ''g'') as cpf_digitos, count(*), array_agg(id) from public.clientes where ativo and nullif(regexp_replace(coalesce(cpf, ''''), ''\D'', '''', ''g''), '''') is not null group by 1 having count(*) > 1;', repetidos
      using errcode = 'P0001';
  end if;
end
$$;

create unique index if not exists clientes_cpf_ativo_unico
  on public.clientes ((regexp_replace(cpf, '\D', '', 'g')))
  where ativo and nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '') is not null;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO PÓS-MIGRAÇÃO (rode depois). Os itens 1 a 3 só leem. O item 4 INSERE linhas de teste e as desfaz em sub-blocos: não deixa dado, mas grava durante a execução.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 1) Colunas. Esperado: cpf text YES null | email_nota_fiscal text YES null | tipo_pessoa text NO 'pj'::text
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'clientes' and column_name in ('tipo_pessoa', 'cpf', 'email_nota_fiscal')
--   order by column_name;
--
-- 2) Constraints e índice. Esperado: 2 checks (clientes_documento_coerente, clientes_tipo_pessoa_check) e o índice parcial único de CPF.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.clientes'::regclass and conname in ('clientes_tipo_pessoa_check', 'clientes_documento_coerente');
--   select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'clientes' and indexname in ('clientes_cpf_ativo_unico', 'clientes_cnpj_ativo_unico');
--
-- 3) Nenhum dado mudou. Esperado hoje: total 48 | pj 48 | pf 0 | com_cpf 0 | com_cnpj 20 | com_email_nf 0
--   select count(*) as total,
--          count(*) filter (where tipo_pessoa = 'pj') as pj,
--          count(*) filter (where tipo_pessoa = 'pf') as pf,
--          count(*) filter (where cpf is not null) as com_cpf,
--          count(*) filter (where cnpj is not null) as com_cnpj,
--          count(*) filter (where email_nota_fiscal is not null) as com_email_nf
--   from public.clientes;
--
-- 4) Comportamento (não deixa nenhum dado: cada bloco interno desfaz o que inseriu). Esperado: duas mensagens "ok:" e nenhum erro.
--   do $$
--   begin
--     begin
--       insert into public.clientes (nome, contato_nome, contato_telefone, contato_email, cidade, segmento, tipo_pessoa, cpf)
--         values ('ZZTESTE PF 1', 'x', 'x', 'x@x.com', 'x', 'Outros', 'pf', '529.982.247-25');
--       insert into public.clientes (nome, contato_nome, contato_telefone, contato_email, cidade, segmento, tipo_pessoa, cpf)
--         values ('ZZTESTE PF 2', 'x', 'x', 'x@x.com', 'x', 'Outros', 'pf', '52998224725');
--       raise exception 'FALHOU: o índice único de CPF não bloqueou o mesmo CPF (com e sem máscara)';
--     exception when unique_violation then
--       raise notice 'ok: o índice único de CPF bloqueou o mesmo CPF (com e sem máscara)';
--     end;
--     begin
--       insert into public.clientes (nome, contato_nome, contato_telefone, contato_email, cidade, segmento, cpf, cnpj)
--         values ('ZZTESTE JUNTOS', 'x', 'x', 'x@x.com', 'x', 'Outros', '529.982.247-25', '11.222.333/0001-81');
--       raise exception 'FALHOU: o check aceitou cpf e cnpj no mesmo cadastro';
--     exception when check_violation then
--       raise notice 'ok: cpf e cnpj no mesmo cadastro foi recusado';
--     end;
--     begin
--       insert into public.clientes (nome, contato_nome, contato_telefone, contato_email, cidade, segmento, tipo_pessoa)
--         values ('ZZTESTE TIPO', 'x', 'x', 'x@x.com', 'x', 'Outros', 'mei');
--       raise exception 'FALHOU: o check aceitou tipo_pessoa fora de pj/pf';
--     exception when check_violation then
--       raise notice 'ok: tipo_pessoa fora de pj/pf foi recusado';
--     end;
--   end
--   $$;
--   -- Depois, confirme que nada ficou: select count(*) from public.clientes where nome like 'ZZTESTE%';  (esperado 0)
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (só se pedirem; COMENTADO de propósito — descomente o bloco inteiro para usar)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- As colunas passam a guardar dados reais depois do uso: o rollback RECUSA se algum cliente já usa PF, CPF ou e-mail da nota fiscal.
--
--   begin;
--   do $$
--   begin
--     if exists (
--       select 1 from public.clientes where tipo_pessoa <> 'pj' or cpf is not null or email_nota_fiscal is not null
--     ) then
--       raise exception 'Rollback abortado: há clientes PF, com CPF ou com e-mail da nota fiscal cadastrados. Remover as colunas apagaria esses dados.';
--     end if;
--   end
--   $$;
--   drop index if exists public.clientes_cpf_ativo_unico;
--   alter table public.clientes drop constraint if exists clientes_documento_coerente;
--   alter table public.clientes drop constraint if exists clientes_tipo_pessoa_check;
--   alter table public.clientes drop column if exists email_nota_fiscal;
--   alter table public.clientes drop column if exists cpf;
--   alter table public.clientes drop column if exists tipo_pessoa;
--   commit;
