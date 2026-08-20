-- Observação complementar ao salário (ex: insalubridade, periculosidade) — texto livre,
-- separado do campo `salario` (que alimenta cálculo de fee de R&S e formulário de admissão
-- e por isso não pode virar texto livre). Nullable: maioria das vagas não tem nada aqui.
ALTER TABLE vagas ADD COLUMN adicionais_salariais TEXT;
