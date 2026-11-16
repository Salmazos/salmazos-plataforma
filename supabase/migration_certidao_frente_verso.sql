-- Adiciona "certidao_civil_verso" à lista de tipo_documento aceitos em admissao_documentos —
-- mesmo padrão de migration_rg_verso.sql / migration_cnh_verso.sql: o verso é um tipo próprio, com
-- linha, arquivo e status próprios. Diferente do rg_verso, é OPCIONAL (obrigatorio = false): serve
-- para a averbação de divórcio, que fica atrás da certidão de casamento, e nunca bloqueia o envio
-- da admissão nem a geração do pacote (ver lib/admissaoDocumentos.ts).
--
-- Aditiva e idempotente: só amplia o CHECK (a lista nova é um SUPERCONJUNTO da atual, então nenhuma
-- linha existente deixa de satisfazê-lo) e não cria, altera nem apaga nenhuma linha. Admissões
-- existentes ficam exatamente como estão (sem linha de verso e sem nova pendência); só as admissões
-- criadas depois do deploy nascem com a linha do verso (admissaoCriacao.ts).
--
-- DROP + ADD no MESMO ALTER TABLE: a troca é atômica (nunca existe um instante sem o CHECK) e
-- rodar a migração de novo apenas recria o mesmo constraint.

ALTER TABLE public.admissao_documentos
  DROP CONSTRAINT IF EXISTS admissao_documentos_tipo_documento_check,
  ADD CONSTRAINT admissao_documentos_tipo_documento_check
    CHECK (tipo_documento = ANY (ARRAY[
      'ctps_todas_paginas'::text, 'foto_3x4'::text, 'cpf'::text, 'titulo_eleitor'::text, 'cartao_sus'::text,
      'rg'::text, 'rg_verso'::text, 'reservista'::text, 'certidao_civil'::text, 'certidao_civil_verso'::text,
      'comprovante_escolaridade'::text, 'pis_pasep'::text, 'comprovante_endereco'::text, 'cnh'::text,
      'cnh_verso'::text, 'certidao_nascimento_filho'::text, 'cpf_dependentes'::text, 'caderneta_vacinacao'::text,
      'frequencia_escolar'::text
    ]));
