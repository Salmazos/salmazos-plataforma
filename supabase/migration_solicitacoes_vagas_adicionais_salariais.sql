-- Mesmo campo/motivo de vagas.adicionais_salariais (ver migration_vagas_adicionais_salariais.sql)
-- — texto livre complementar ao salário (ex: insalubridade, periculosidade), agora também no
-- formulário de Solicitar Vaga do portal do cliente. Flui pra vagas.adicionais_salariais
-- quando a solicitação é convertida em vaga (/api/vagas/from-solicitacao).
ALTER TABLE solicitacoes_vagas ADD COLUMN adicionais_salariais TEXT;
