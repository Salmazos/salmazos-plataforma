-- UNIQUE (candidato_id, cliente_id, vaga_id) em encaminhamentos — o mesmo candidato pode ser
-- encaminhado ao mesmo cliente em vagas diferentes (casos reais), mas não duas vezes pra mesma
-- vaga. Aplicada em produção em 30/09 pela sessão que investigou o upsert quebrado de
-- encaminhamentos (nome: fix_uniq_encaminhamentos); este arquivo é o registro local.
--
-- Com ela, o "Encaminhar" (POST /api/encaminhamentos) reaproveita o encaminhamento existente
-- da mesma tripla em vez de inserir outro. O antigo "sync" de candidatos-vagas foi removido,
-- não religado (ver comentário lá).

-- Duplicatas exatas (mesmo candidato/cliente/vaga/status) que impediam a constraint; nenhuma
-- tabela referencia encaminhamentos.id.
delete from encaminhamentos where id in (
  '7e342ae0-79ff-4c8a-8e84-9a20d8520b70',
  '1481f60d-04f4-44c7-9e77-bd77d7767e3a'
);

alter table encaminhamentos
  add constraint uniq_encaminhamentos_candidato_cliente_vaga
  unique (candidato_id, cliente_id, vaga_id);
