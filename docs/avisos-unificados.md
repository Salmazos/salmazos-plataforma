# Avisos unificados (Configurações > Avisos)

Tela: `/painel/avisos-config` (só superuser). Define **quem recebe** cada aviso interno, por evento e canal.
Código: `src/lib/avisos.ts` (leitura do banco), `src/lib/avisosResolucao.ts` (regras puras),
`src/lib/avisosCatalogo.ts` (eventos e rótulos), `src/lib/avisosPadrao.ts` (padrão do sistema).

## Tabelas

| Tabela | Para que serve |
|---|---|
| `aviso_eventos` | Catálogo: evento, grupo, descrição e `canais_suportados`. |
| `aviso_eventos_canais` | Liga/desliga por evento e canal (`email`, `sino`, `popup`). |
| `aviso_destinatarios` | Lista por evento e canal: usuário da plataforma ou e-mail livre, com `ativo`. Único por (evento, canal, usuário ou e-mail). |
| `indicacao_candidato_popup_vistos` | "Já dispensado" do popup de indicações, por (usuário, indicação). |

Todas com RLS: só `service_role` acessa. A função SQL `avisos_restaurar_padrao(jsonb)` aplica o "Restaurar padrão"
numa única transação. As tabelas antigas (`aviso_vaga_*`, `rescisao_avisos_*`, `funcionario_aso_avisos_*`) não foram
alteradas.

## Eventos (16) e canais

| Grupo | Evento | Canais configuráveis |
|---|---|---|
| Vagas | `vaga_criada`, `vaga_reativada`, `vaga_fechada`, `vaga_cancelada`, `solicitacao_vaga` | e-mail, sino |
| Rescisão | `rescisao_lancamento`, `rescisao_vencimento_rescisao`, `rescisao_vencimento_guia` | e-mail, sino |
| Rescisão | `rescisao_paga` | sino |
| ASO periódico | `aso_periodico_sem_registro`, `aso_periodico_vencendo`, `aso_periodico_atrasado` | e-mail, sino |
| Portal do cliente | `indicacao_candidato_recebida` | e-mail, sino, popup |
| Portal do cliente | `portal_candidato_aprovado`, `indicacao_decisao_cliente` | e-mail |
| Portal do cliente | `portal_candidato_reprovado` | e-mail (nasce desligado: antes não existia e-mail interno de reprovação) |

O popup de rescisão e de ASO continua derivado das linhas do sino (não tem lista própria).

## Regras

- **Fallback ao comportamento antigo.** `resolverDestinatarios(evento, canal, unidadeId?)` lê só as tabelas novas. Se não
  houver linha de canal nem destinatário para o evento/canal (ou as tabelas não existirem), usa a configuração antiga de
  cada módulo. Modos: `desligado` (ninguém), `legado` (canal ligado sem destinatários ativos: vale o padrão do sistema de
  quem chama) e `configurado` (só a lista). Vagas, rescisão e ASO: legado de vagas = analistas da unidade; legado de
  rescisão/ASO = ninguém. Aprovação do cliente e indicação aprovada: legado = `olver@` e `rh@`. Reprovação e popup: legado = não envia/não abre.
- **Filtro de unidade fixo.** Quando o chamador informa a unidade, só entram analistas ativos que atendem a unidade
  (ou têm acesso a todas). A lista nunca substitui esse filtro.
- **Último destinatário.** A tela não deixa remover ou desativar o último destinatário ativo de um canal ligado (409).
- **`email_falhou`.** Sino "Falha ao notificar por e-mail" quando o e-mail não chega a ninguém
  (solicitação de vaga e indicação direta). Vai **somente para superuser**, por decisão do diretor.
- **Canais independentes.** Na indicação recebida, e-mail e sino rodam isolados: a falha de um não afeta o outro nem a
  gravação da indicação.

## Popup de indicações diretas

- Abre ao carregar o painel (sem polling), só para quem está na lista do canal popup do evento
  `indicacao_candidato_recebida`. Sem configuração, falha de leitura ou canal desligado: ninguém vê.
- **Lista:** traz TODAS as indicações pendentes da unidade do usuário (sócios veem todas), inclusive as já vistas.
- **"Visto"** só decide SE o popup abre: abre quando existe ao menos uma pendente ainda não vista.
- "Ok, entendi!" e o X marcam como vistas todas as listadas. Clicar no card marca só a clicada e abre
  `/painel/vagas?indicacao=<id>`.

## Verificação

`node --experimental-strip-types scripts/verificar-avisos-resolvedor.mts` (resolvedor, fallback, unidade, padrão,
restauração e isolamento de canais; 59 casos).

## Rollback

Reverter o merge na `main`: `git revert -m 1 <hash do merge "Avisos unificados: fases 1, 1b e 1c">` e dar push. O código
volta a ler só as tabelas antigas (que nunca foram alteradas). As tabelas novas podem permanecer no banco sem efeito.
A branch `fix/avisos-unificados-fase1` fica como referência.
