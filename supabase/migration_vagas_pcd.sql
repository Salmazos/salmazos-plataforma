-- Vaga PCD: a vaga passa a poder ser marcada como PCD, e a página pública (listagem e vaga) mostra só o selo "Vaga PCD", para evitar
-- currículos fora do perfil. Até aqui o PCD só existia em solicitacoes_vagas.perfil_extra->>'pcd' ('sim'/'nao'), sem campo em vagas.
-- Quem marca: o analista (Nova Vaga / Editar Vaga) ou a conversão solicitação → vaga (/api/vagas/from-solicitacao, quando perfil_extra.pcd = 'sim').
-- ATENÇÃO À ORDEM: aplicar esta migração ANTES de publicar o código novo (a criação e a edição de vaga gravam esta coluna).
-- Importação de vagas por Excel não mexe nesta coluna: vagas importadas nascem com o padrão (false).
alter table vagas add column if not exists pcd boolean not null default false;

-- Backfill: vagas já criadas a partir de uma solicitação que marcou PCD passam a ser PCD.
update vagas v set pcd = true
from solicitacoes_vagas s
where s.vaga_id = v.id and s.perfil_extra->>'pcd' = 'sim';
