-- O cliente agora pode marcar, no próprio formulário de Solicitar Vaga do portal, que a
-- vaga é confidencial. Espelha vagas.confidencial (mesmo significado: só exibição/aviso,
-- sem regra de acesso hoje — ver ModalNovaVaga.tsx), mas aqui quem decide é o cliente, não
-- o analista. Precisa ser notada pela Salmazos já na abertura da solicitação (sino + popup
-- + lista de pendentes) e sobreviver à conversão solicitação → vaga (ver
-- /api/vagas/from-solicitacao), pra não se perder no caminho.
ALTER TABLE solicitacoes_vagas ADD COLUMN confidencial BOOLEAN NOT NULL DEFAULT false;
