-- "Principais Atividades" como campo próprio da solicitação de vaga do portal, do template do
-- cliente e da vaga — texto livre, mostrado na vaga pública logo abaixo de Benefícios.
-- Antes disso o cliente (caso real: Novacki, set/2026) descrevia as atividades dentro de
-- Observações, que na vaga vira "Observações internas" e nunca aparece pro candidato.

-- Parte 1 — schema (aplicada antes do deploy do código).
ALTER TABLE solicitacoes_vagas ADD COLUMN principais_atividades TEXT;
ALTER TABLE vaga_templates_cliente ADD COLUMN principais_atividades TEXT;
ALTER TABLE vagas ADD COLUMN principais_atividades TEXT;

-- Parte 2 — dados (aplicada depois do deploy, pra o texto não sumir das telas antigas).
-- Tira de Observações só o bloco que começa com o título "PRINCIPAIS ATIVIDADES" (sem o
-- título, que agora é o nome do campo) até a primeira linha em branco; o que vier depois
-- (TURNOS DISPONÍVEIS, ESCOLARIDADE – DIFERENCIAL, DIFERENCIAL...) continua em Observações.
-- Tabelas sem trigger de updated_at (conferido), então o UPDATE não mexe em mais nada.
-- Nenhum pedido de alteração pendente no momento da migração (solicitacao_vaga_alteracoes).
CREATE TEMP TABLE _atividades_split AS
SELECT tabela, id,
       CASE WHEN pos = 0 THEN corpo ELSE left(corpo, pos - 1) END AS atividades,
       CASE WHEN pos = 0 THEN NULL ELSE nullif(btrim(substr(corpo, pos + 2), E' \n'), '') END AS resto
FROM (
  SELECT tabela, id, corpo, strpos(corpo, E'\n\n') AS pos
  FROM (
    SELECT 'solicitacoes_vagas' AS tabela, id,
           regexp_replace(observacoes, E'^PRINCIPAIS ATIVIDADES:?[ \\t]*\\n+', '') AS corpo
      FROM solicitacoes_vagas WHERE observacoes ~ '^PRINCIPAIS ATIVIDADES'
    UNION ALL
    SELECT 'vaga_templates_cliente', id,
           regexp_replace(observacoes, E'^PRINCIPAIS ATIVIDADES:?[ \\t]*\\n+', '')
      FROM vaga_templates_cliente WHERE observacoes ~ '^PRINCIPAIS ATIVIDADES'
    UNION ALL
    SELECT 'vagas', id,
           regexp_replace(observacoes, E'^PRINCIPAIS ATIVIDADES:?[ \\t]*\\n+', '')
      FROM vagas WHERE observacoes ~ '^PRINCIPAIS ATIVIDADES'
  ) b
) s;

UPDATE solicitacoes_vagas t SET principais_atividades = s.atividades, observacoes = s.resto
  FROM _atividades_split s WHERE s.tabela = 'solicitacoes_vagas' AND s.id = t.id;
UPDATE vaga_templates_cliente t SET principais_atividades = s.atividades, observacoes = s.resto
  FROM _atividades_split s WHERE s.tabela = 'vaga_templates_cliente' AND s.id = t.id;
UPDATE vagas t SET principais_atividades = s.atividades, observacoes = s.resto
  FROM _atividades_split s WHERE s.tabela = 'vagas' AND s.id = t.id;

DROP TABLE _atividades_split;
