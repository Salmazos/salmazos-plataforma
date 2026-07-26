-- Adiciona "cnh_verso" à lista de tipo_documento aceitos em admissao_documentos —
-- mesmo padrão de migration_rg_verso.sql. Ao contrário do rg_verso (que nasceu como
-- upload manual do RH), cnh_verso já nasce como campo normal do formulário público
-- (obrigatorio: true quando isMotorista, condicional: "motorista" — ver
-- lib/admissaoDocumentos.ts), seguindo o novo fluxo de captura com moldura CARTÃO
-- em 2 fotos (frente + verso) para RG e CNH.
--
-- Execute este SQL no SQL Editor do Supabase.

ALTER TABLE public.admissao_documentos
  DROP CONSTRAINT admissao_documentos_tipo_documento_check;

ALTER TABLE public.admissao_documentos
  ADD CONSTRAINT admissao_documentos_tipo_documento_check
    CHECK (tipo_documento = ANY (ARRAY[
      'ctps_todas_paginas'::text, 'foto_3x4'::text, 'cpf'::text, 'titulo_eleitor'::text, 'cartao_sus'::text,
      'rg'::text, 'rg_verso'::text, 'reservista'::text, 'certidao_civil'::text, 'comprovante_escolaridade'::text,
      'pis_pasep'::text, 'comprovante_endereco'::text, 'cnh'::text, 'cnh_verso'::text, 'certidao_nascimento_filho'::text,
      'cpf_dependentes'::text, 'caderneta_vacinacao'::text, 'frequencia_escolar'::text
    ]));
