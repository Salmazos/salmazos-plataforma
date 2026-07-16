-- Separa "Dados Bancários" (cadastro geral, usado desde a Ficha Cadastral original) de
-- "portabilidade de salário" (usado especificamente na carta de abertura de conta) —
-- alguém pode ter conta em mais de um banco, e o banco cadastrado no geral não é
-- necessariamente o banco de destino da portabilidade salarial. Os campos originais
-- banco/agencia/conta/tipo_conta continuam existindo exatamente como estão, sem migração
-- automática de dado antigo — são conceitos diferentes agora, não substituição.
ALTER TABLE admissao_dados_pessoais
  ADD COLUMN deseja_portabilidade_salario BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN banco_portabilidade TEXT,
  ADD COLUMN agencia_portabilidade TEXT,
  ADD COLUMN conta_portabilidade TEXT,
  ADD COLUMN tipo_conta_portabilidade TEXT
    CHECK (tipo_conta_portabilidade = ANY (ARRAY['corrente'::text, 'poupanca'::text]));
