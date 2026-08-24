-- Exclusão de pastas na árvore Salmazos — as 4 pastas de raiz originais (ver
-- migration_documentos_pastas_salmazos.sql) são padrão da plataforma e nunca podem ser
-- excluídas, mesmo vazias. Pastas criadas pelo usuário nascem protegida=false e só podem
-- ser excluídas se estiverem vazias (checado em DELETE /api/documentos-pastas-salmazos/[id]).
alter table public.documentos_pastas_salmazos add column protegida boolean not null default false;

update public.documentos_pastas_salmazos set protegida = true
where id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004'
);
