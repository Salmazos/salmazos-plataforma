-- Rescisões carregam dados financeiros/trabalhistas (valor de rescisão, comprovantes,
-- ASO) que não podem desaparecer silenciosamente numa exclusão de funcionário (por engano
-- ou limpeza de dados de teste). CASCADE (definido na migration original) trocado por
-- RESTRICT: a exclusão do funcionário passa a ser bloqueada pelo Postgres enquanto ele
-- tiver rescisão vinculada.
alter table public.rescisoes drop constraint rescisoes_funcionario_id_fkey;
alter table public.rescisoes
  add constraint rescisoes_funcionario_id_fkey
  foreign key (funcionario_id) references public.funcionarios(id) on delete restrict;
