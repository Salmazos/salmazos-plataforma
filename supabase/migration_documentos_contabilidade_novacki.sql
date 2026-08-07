alter table admissao_documentos_contabilidade
  drop constraint admissao_documentos_contabilidade_tipo_documento_check;

alter table admissao_documentos_contabilidade
  add constraint admissao_documentos_contabilidade_tipo_documento_check
  check (tipo_documento = any (array[
    'ficha_registro', 'modelo_contrato', 'acordo_hs_vt', 'termo_lgpd',
    'ficha_ir', 'salario_familia', 'termo_responsabilidade',
    'termo_lgpd_novacki', 'termo_confidencialidade_novacki'
  ]));
