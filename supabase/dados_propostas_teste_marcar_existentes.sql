-- Marca como TESTE as 3 propostas que o Ölver criou para testar o módulo (empresa "cliente teste"). SÓ a flag: o número (OS-0062/26, OS-0063/26,
-- OS-0064/26) NÃO é renomeado, porque está nos snapshots imutáveis das revisões. NÃO entra na migration: é dado, e roda DEPOIS de
-- supabase/migration_propostas_teste.sql (precisa da coluna propostas.teste).
--
-- Rodar UMA vez. Esperado: exatamente 3 linhas. Se não forem exatamente 3 (já marcadas, id/número/empresa diferentes), a transação aborta e nada é gravado.
-- A tabela propostas não tem trigger de imutabilidade (só proposta_revisoes e proposta_historico têm), então o UPDATE é permitido.
--
-- Conferência ANTES (esperado: 3 linhas, teste = false):
--   select id, numero, situacao, teste from public.propostas
--   where id in ('afb30844-5c3e-4277-854a-26f81611c3f2','946a038c-0a4e-484b-bcdc-455ce8dccd3c','16a5e1a8-d854-4bc9-95eb-42db020c13f9') order by numero;

begin;

do $$
declare
  v_linhas int;
begin
  update public.propostas
     set teste = true
   where id in ('afb30844-5c3e-4277-854a-26f81611c3f2', '946a038c-0a4e-484b-bcdc-455ce8dccd3c', '16a5e1a8-d854-4bc9-95eb-42db020c13f9')
     and numero in ('OS-0062/26', 'OS-0063/26', 'OS-0064/26')
     and empresa_visitada_id = '61cc5136-a963-484d-98ca-b895cfa3df5f'
     and teste = false;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 3 then
    raise exception 'Esperado marcar 3 propostas, mas % linha(s) foram atualizadas. Nada foi gravado.', v_linhas;
  end if;
end $$;

commit;

-- Conferência DEPOIS (esperado: 3 linhas, teste = true, números inalterados):
--   select numero, situacao, teste from public.propostas where teste order by numero;
--
-- Para tratar a empresa como "de teste" nas próximas propostas, marque-a pela API (diretoria), que também registra a auditoria:
--   POST /api/comercial/propostas/empresas/61cc5136-a963-484d-98ca-b895cfa3df5f/teste   (só quem é diretoria/superuser)
