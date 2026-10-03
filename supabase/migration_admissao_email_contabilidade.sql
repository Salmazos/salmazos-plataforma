-- DOCUMENTAÇÃO: já aplicada no Supabase por outra via. Não executar de novo.
-- E-mail do pacote de admissão para a contabilidade: destinatários "Para" configuráveis e o
-- registro do último envio na própria admissão.
CREATE TABLE IF NOT EXISTS public.admissao_contabilidade_email_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admissao_contabilidade_email_destinatarios_email_uq
  ON public.admissao_contabilidade_email_destinatarios (lower(email));

ALTER TABLE public.admissao_contabilidade_email_destinatarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role acesso total admissao_contabilidade_email_destinatarios"
  ON public.admissao_contabilidade_email_destinatarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.admissoes
  ADD COLUMN IF NOT EXISTS pacote_enviado_email_em timestamptz,
  ADD COLUMN IF NOT EXISTS pacote_enviado_email_por uuid,
  ADD COLUMN IF NOT EXISTS pacote_enviado_email_para text;

-- Cc editável pela tela: mesma tabela, com a coluna copia (false = "Para", true = "Cópia (Cc)").
-- O índice único em lower(email) vale para as duas listas (o mesmo endereço não fica em Para e Cc).
ALTER TABLE public.admissao_contabilidade_email_destinatarios
  ADD COLUMN IF NOT EXISTS copia boolean NOT NULL DEFAULT false;

-- Seed dos Cc que antes eram fixos no código (EMAIL_CONTABILIDADE_CC_FIXO, removido).
INSERT INTO public.admissao_contabilidade_email_destinatarios (nome, email, ativo, copia)
VALUES
  ('Consultoria Salmazos', 'consultoria@salmazos.com.br', true, true),
  ('RH Salmazos', 'rh@salmazos.com.br', true, true)
ON CONFLICT DO NOTHING;
