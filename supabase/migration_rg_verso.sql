-- Adiciona "rg_verso" à lista de tipo_documento aceitos em admissao_documentos —
-- documento extra opcional, disponível só no painel interno do RH (upload em nome do
-- candidato), pros casos em que ele não conseguiu tirar a foto do RG aberto (frente e
-- verso na mesma imagem) e precisa enviar os dois lados em arquivos separados. Nunca é
-- pré-criado na criação da admissão (ver DOCUMENTOS_ADMISSAO.apenasPainel) — só passa a
-- existir quando o RH explicitamente faz esse upload.
ALTER TABLE public.admissao_documentos
  DROP CONSTRAINT admissao_documentos_tipo_documento_check;

ALTER TABLE public.admissao_documentos
  ADD CONSTRAINT admissao_documentos_tipo_documento_check
    CHECK (tipo_documento = ANY (ARRAY[
      'ctps_todas_paginas'::text, 'foto_3x4'::text, 'cpf'::text, 'titulo_eleitor'::text, 'cartao_sus'::text,
      'rg'::text, 'rg_verso'::text, 'reservista'::text, 'certidao_civil'::text, 'comprovante_escolaridade'::text,
      'pis_pasep'::text, 'comprovante_endereco'::text, 'cnh'::text, 'certidao_nascimento_filho'::text,
      'cpf_dependentes'::text, 'caderneta_vacinacao'::text, 'frequencia_escolar'::text
    ]));
