-- Correção única (24/09) da Carteira de Clientes: total de visitas, primeira/última visita e
-- último visitante recalculados a partir das visitas reais — mesmo cálculo de
-- recalcularEmpresaVisitada (src/lib/carteiraClientes.ts), que passa a manter isso certo daqui
-- pra frente. Antes era contador +1 com "última visita = agora" a cada gravação de visita, e a
-- tela de KM regrava todas as visitas ao editar um registro: 26 de 39 contadores errados
-- (203 contados × 119 reais) e 37 de 39 com "última visita" = data da edição.
-- A tabela não tem trigger de updated_at.

WITH reais AS (
  -- Só contam visitas de analistas da mesma unidade da empresa (p.id nulo = outra unidade).
  SELECT e.id,
         count(p.id) AS total,
         min(r.data) FILTER (WHERE p.id IS NOT NULL) AS primeira,
         max(r.data) FILTER (WHERE p.id IS NOT NULL) AS ultima,
         (array_agg(p.user_id ORDER BY r.data DESC, r.created_at DESC) FILTER (WHERE p.id IS NOT NULL))[1] AS ultimo_user_id,
         (array_agg(p.nome_completo ORDER BY r.data DESC, r.created_at DESC) FILTER (WHERE p.id IS NOT NULL))[1] AS ultimo_nome
  FROM public.empresas_visitadas e
  LEFT JOIN public.km_visitas v ON v.empresa ILIKE e.nome
  LEFT JOIN public.km_registros r ON r.id = v.registro_id
  LEFT JOIN public.analistas_perfil p ON p.id = r.analista_id AND p.unidade_id = e.unidade_id
  GROUP BY e.id
)
UPDATE public.empresas_visitadas e
SET total_visitas = reais.total,
    primeira_visita_em = CASE WHEN reais.total > 0 THEN (reais.primeira::text || 'T12:00:00-03:00')::timestamptz ELSE e.primeira_visita_em END,
    ultima_visita_em   = CASE WHEN reais.total > 0 THEN (reais.ultima::text   || 'T12:00:00-03:00')::timestamptz ELSE e.ultima_visita_em END,
    ultimo_visitante_id   = CASE WHEN reais.total > 0 THEN reais.ultimo_user_id ELSE e.ultimo_visitante_id END,
    ultimo_visitante_nome = CASE WHEN reais.total > 0 THEN reais.ultimo_nome    ELSE e.ultimo_visitante_nome END
FROM reais
WHERE reais.id = e.id;
