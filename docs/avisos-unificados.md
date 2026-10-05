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
| `pedido_cliente_popup_vistos` | "Já dispensado" do popup "Pedidos do cliente", por (usuário, tipo do pedido, pedido). Fase 3. |

Todas com RLS: só `service_role` acessa. A função SQL `avisos_restaurar_padrao(jsonb)` aplica o "Restaurar padrão"
numa única transação. As tabelas antigas (`aviso_vaga_*`, `rescisao_avisos_*`, `funcionario_aso_avisos_*`) não foram
alteradas.

## Eventos (22) e canais

| Grupo | Evento | Canais configuráveis |
|---|---|---|
| Vagas | `vaga_criada`, `vaga_reativada`, `vaga_fechada`, `vaga_cancelada` | e-mail, sino |
| Vagas | `solicitacao_vaga` | e-mail, sino, **popup** (popup desde a Fase 3) |
| Rescisão | `rescisao_lancamento`, `rescisao_vencimento_rescisao`, `rescisao_vencimento_guia` | e-mail, sino |
| Rescisão | `rescisao_paga` | sino |
| ASO periódico | `aso_periodico_sem_registro`, `aso_periodico_vencendo`, `aso_periodico_atrasado` | e-mail, sino |
| Portal do cliente | `indicacao_candidato_recebida` | e-mail, sino, popup |
| Portal do cliente | `solicitacao_alteracao_pedida`, `vaga_reativacao_pedida`, `vaga_pausa_pedida` | e-mail, sino, popup (Fase 3) |
| Portal do cliente | `agendamento_cliente` (só quando o candidato **não** tem responsável) | e-mail, sino (Fase 3) |
| Avisos ao cliente | `indicacao_decidida_cliente`, `candidato_enviado_cliente` | sino, popup (sem lista de pessoas; ver "Avisos ao cliente") |
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

## Fase 3, bloco 1: pedidos do cliente no portal

Antes, estes avisos usavam regra fixa (`notifyAllAnalysts` + sino geral). Agora leem a lista do evento; **sem
configuração, o comportamento é exatamente o antigo em todos os canais**.

| Evento | Disparo | Sino (tipo gravado) | E-mail (tipo) |
|---|---|---|---|
| `solicitacao_alteracao_pedida` | `api/portal/solicitacoes/[id]/alteracao` | `alteracao_solicitacao_vaga` | `alteracao_solicitacao_pedida` |
| `vaga_reativacao_pedida` | `.../reativacao` | `vaga_reativacao_pedida` | `vaga_status_solicitado` |
| `vaga_pausa_pedida` ("Cliente pediu encerramento de vaga") | `.../encerramento` | `vaga_pausa_pedida` | `vaga_status_solicitado` |
| `agendamento_cliente` | `api/portal/agendar` (só o fallback) | `agendamento_cliente` | `agendamento_cliente` |

- **Rótulo na tela.** A tela de Avisos lê o nome e a explicação de cada evento do catálogo no código
  (`ROTULO_EVENTO` e `NOTA_EVENTO` em `avisosCatalogo.ts`), não de `aviso_eventos.descricao`. Por isso renomear
  "Cliente pediu encerramento de vaga" não exige migration; o id, o tipo de sino (`vaga_pausa_pedida`) e a ação
  interna (`pausar`) não mudam. Aprovar ou recusar o pedido é feito no painel de Vagas, na solicitação.
- **Código.** `src/lib/avisoPedidoCliente.ts` (`avisarPedidoCliente`) reaproveita `resolverAvisoVaga` /
  `gravarSinoAvisoVaga` / `executarCanaisIndependentes`. Sino e e-mail rodam isolados e a função nunca lança: falha de
  aviso não derruba a rota nem a gravação do pedido.
- **Sino.** Lista configurada = uma linha **por usuário** (`user_id` preenchido, `unidade_id`, mesmo tipo e mesmo link de
  antes: `/painel/vagas?solicitacao=<id da solicitação>`; no agendamento, o perfil do candidato). Sem configuração =
  a linha geral de sempre (`user_id` nulo, da unidade). Canal desligado = ninguém.
- **E-mail.** Lista configurada = só a lista (usuários e e-mails livres). Sem configuração = todos os analistas ativos
  da unidade (`notifyAllAnalysts`). Desligado = ninguém.
- **Filtro de unidade fixo** (`analistaAtendeUnidade`) por cima de qualquer lista: unidade do pedido/cliente.
- **Agendamento.** O ramo do **responsável do candidato** (`notifyResponsibleOrAll` + `buscarPerfilResponsavel`) continua
  fixo e intocado: sino direcionado e e-mail só para ele. A lista só vale no fallback (sem responsável resolvido), via
  `fallbackBroadcast`. O lembrete automático de agendamento (cron) não mudou.
- **Não mexem:** `avaliar` (aprovação/reprovação), `solicitar-vaga` (exceto o popup, abaixo), `indicar-candidato` e os
  e-mails ao cliente.
- **Carga inicial** (migration `migration_avisos_fase3_bloco1.sql`): e-mail = cópia da lista de `solicitacao_vaga`
  (Andreza, Giovanni, Rebecca); sino = cópia do sino de `solicitacao_vaga` (7 usuários); popup = analistas ativos que
  atendem a unidade (hoje 8). As cargas só são criadas quando o par (evento, canal) está vazio, então rodar a migration
  de novo não recoloca quem foi removido na tela.

## Popup de solicitação de vaga (`solicitacao_vaga`, canal popup)

`GET /api/solicitacoes-vagas/pendentes-popup` agora consulta a lista do canal popup: configurada = só quem está nela;
canal desligado = ninguém; **sem configuração = critério antigo** (todo analista ativo da unidade). O filtro de unidade
(solicitações da unidade do usuário; sócios veem todas) e o mecanismo de "visto" (`solicitacao_vaga_popup_vistos`, clique
no card ou Ok/X marcam todas as listadas) não mudaram, e nenhum dado foi migrado.

## Popup "Pedidos do cliente"

- Componente `PopupPedidosClientePendentes` (montado em `painel/layout.tsx`); `GET /api/pedidos-cliente-popup` e
  `POST /api/pedidos-cliente-popup/marcar-visto`. Uma consulta por carga do painel, sem polling.
- Junta os pedidos **pendentes** de três filas e só dos tipos em que a pessoa está na lista do canal popup do respectivo
  evento (cada tipo tem a sua lista): `alteracao` → `solicitacao_vaga_alteracoes`; `reativacao` (`acao = 'reabrir'`) e
  `pausa` (`acao = 'pausar'`) → `vaga_solicitacoes_status`. Filtro de unidade fixo (sócios veem todas).
- Sem configuração, falha de leitura ou canal desligado: o tipo não aparece (o popup só existe com configuração).
- **Visto** (`pedido_cliente_popup_vistos`: `usuario_id`, `tipo_pedido` em `alteracao|reativacao|pausa`, `pedido_id`,
  `visto_em`; único por usuário+tipo+pedido; RLS só `service_role`). Sem FK para as filas porque o `pedido_id` aponta
  para tabelas diferentes conforme o tipo; só `usuario_id` tem FK. Comportamento igual ao popup de indicações: abre se
  houver ao menos um pendente ainda não visto; a lista traz todos os pendentes; clicar no card marca só o clicado e leva
  à solicitação (mesmo destino do sino); Ok e X marcam todos os listados; uma vez por pessoa por pedido; sem controle de
  sessão. Um pedido de alteração que o cliente reenvia vira um pedido novo (id novo) e reabre o popup.

## Popup de indicações diretas

- Abre ao carregar o painel (sem polling), só para quem está na lista do canal popup do evento
  `indicacao_candidato_recebida`. Sem configuração, falha de leitura ou canal desligado: ninguém vê.
- **Lista:** traz TODAS as indicações pendentes da unidade do usuário (sócios veem todas), inclusive as já vistas.
- **"Visto"** só decide SE o popup abre: abre quando existe ao menos uma pendente ainda não vista.
- "Ok, entendi!" e o X marcam como vistas todas as listadas. Clicar no card marca só a clicada e abre
  `/painel/vagas?indicacao=<id>`.

## Verificação

`node --experimental-strip-types scripts/verificar-avisos-resolvedor.mts` (resolvedor, fallback, unidade, padrão,
restauração, isolamento de canais, catálogo, popups, pedidos do cliente e avisos ao cliente; 149 casos). Na Fase 3 três expectativas dos
casos antigos mudaram de propósito (popup de `solicitacao_vaga` entra no padrão de Vagas: 10 → 11 canais; Portal do
cliente passa de 4 para 8 eventos).

## Rollback da Fase 3, bloco 1

Reverter o merge da branch `fix/avisos-fase3-bloco1`. As rotas voltam a avisar com a regra fixa antiga, o popup de
solicitação volta ao critério antigo e a tabela `pedido_cliente_popup_vistos` e as linhas novas de aviso podem
permanecer no banco sem efeito.

## Rollback

Reverter o merge na `main`: `git revert -m 1 <hash do merge "Avisos unificados: fases 1, 1b e 1c">` e dar push. O código
volta a ler só as tabelas antigas (que nunca foram alteradas). As tabelas novas podem permanecer no banco sem efeito.
A branch `fix/avisos-unificados-fase1` fica como referência.

## Avisos ao cliente (sino e popup no portal)

Avisos que a **Salmazos dá ao cliente**, mostrados no portal. É o sentido contrário de "Portal do cliente" (o que o
cliente faz e a Salmazos recebe). Aba própria em Configurações > Avisos: **Avisos ao cliente**.

- **Sem lista de pessoas.** O destinatário é todo usuário do portal do cliente do aviso (`cliente_usuarios`). A tela só
  liga e desliga cada canal (sino e popup), com a frase "Ligado: todos os usuários do portal do cliente recebem.
  Desligado: ninguém." Não há formulário de adicionar, nem "Restaurar padrão" (`grupoTemPadrao` é falso), e
  `POST /api/avisos-config/destinatarios` devolve 400 para esses eventos (`EVENTOS_SEM_LISTA`, em `avisosCatalogo.ts`).
  Não usam `aviso_destinatarios` nem `resolverDestinatarios`.
- **Liga/desliga.** `avisoClienteLigado(evento, canal)` (`src/lib/avisoCliente.ts`) lê só `aviso_eventos_canais`. **Sem
  linha de canal ou erro de leitura = NÃO envia nada** (antes nada era enviado ao cliente). Na tela, canal sem linha
  aparece desligado.
- **Modelo.** `portal_avisos` (um aviso por cliente e por ocorrência: `cliente_id`, `evento`, `titulo`, `mensagem`, `link`
  sempre `/portal/…`, `referencia_tipo`, `referencia_id`, `chave_dedup` única, `canal_sino`, `canal_popup`, `created_at`;
  índice `(cliente_id, created_at desc)`) e `portal_avisos_estado` (por usuário: `lida_em`, `popup_visto_em`; único por
  `(aviso_id, user_id)`; as linhas nascem quando o usuário marca). RLS só `service_role`, sem acesso de anon e
  authenticated. A leitura passa só por `api/portal/*`, com o `cliente_id` vindo do servidor.
- **Gravação.** `criarAvisoCliente(evento, clienteId, () => dados)` grava conforme o liga/desliga ATUAL de cada canal
  (`canal_sino` / `canal_popup`; os dois desligados = não grava; cliente sem usuário no portal = não grava). Nunca lança
  (os dados são montados dentro do `try/catch`) e é uma chamada extra, depois da ação principal. `chave_dedup` leva
  sufixo de versão (`chaveDedupAviso`): repetir a mesma ocorrência não duplica, um reenvio legítimo é aceito.
- **Visibilidade.** O usuário só vê avisos dos últimos 30 dias **e** criados depois de ele entrar no portal
  (`cliente_usuarios.created_at`). Esconder, nunca apagar (sem cron). Regras puras em `avisoClienteRegras.ts`.
- **Portal.** `GET /api/portal/avisos` faz **uma** consulta (avisos do cliente com o estado do usuário embutido).
  `AvisosPortalProvider` guarda a lista e a divide entre `PortalSino` (topo do portal; últimas 20, contador, "há X") e
  `PopupAvisosPortal`. `POST /api/portal/avisos/marcar` (`{ids}` ou `{todos:true}`, `acao` = `lida` | `popup` | `ambos`)
  só vale para avisos do cliente do usuário e nunca sobrescreve um momento já gravado. Sem polling e sem Realtime: o
  navegador consulta ao carregar o portal e de novo só quando o usuário abre o menu do sino.
- **Popup.** Abre na primeira carga da página se houver ao menos um aviso do canal popup ainda não visto pelo usuário;
  lista todos os não vistos; clicar no card marca só aquele (visto + lido) e leva ao link; "Ok" e o X marcam todos os
  listados como vistos (não marcam lidos). Uma vez por aviso por pessoa.
- **Nunca entra nos textos:** `decidido_por`, notas internas, observações, responsável, fee, nenhum motivo que o
  cliente já não veja.
- **Bloco 1 (esta entrega).** Infraestrutura + `indicacao_decidida_cliente`, disparado em
  `POST /api/solicitacoes-indicacao-candidato/[id]/decisao` (aprovada: "Sua indicação {candidato} foi aprovada para a vaga
  {título}"; recusada: "… não foi aprovada. Motivo: {motivo_recusa}"; link `/portal/minhas-indicacoes`). Migration:
  `supabase/migration_avisos_cliente_bloco1.sql`.
- **Bloco 2: Candidato enviado ao cliente** (`candidato_enviado_cliente`). Migration:
  `supabase/migration_avisos_cliente_bloco2.sql` (só o evento e os 2 canais ligados).
  - **Disparo.** No fim de `POST /api/encaminhamentos` (ação "Encaminhar" do Kanban), depois de o encaminhamento
    estar gravado, uma chamada extra e isolada (`avisarCandidatoEnviadoAoCliente`, em `avisoClienteCandidato.ts`).
    A rota ganhou só linhas novas. O e-mail ao contato do cliente e a movimentação de etapa não mudaram.
  - **Texto.** Título "Novo candidato para avaliar"; mensagem "Novo candidato para avaliar: {nome} — vaga {título}" e,
    se já houver data, " — entrevista em dd/mm/aaaa às hh:mm" (`dataEntrevistaParaCliente`, que esconde o 12:00 de
    convenção, como o portal). Nome ou vaga nulos só encurtam o texto. Nunca entram observações, notas, responsável,
    contatos do candidato, fee nem status interno do funil.
  - **Link.** `/portal/candidato/{id do encaminhamento}`: é o perfil onde o cliente vê e avalia o candidato (o botão
    "Ver perfil" da página inicial do portal usa esta rota, com o id do encaminhamento).
  - **Quando avisa.** No primeiro envio e no reenvio real (o encaminhamento anterior estava encerrado: aprovado,
    reprovado, desistiu ou já avaliado, e foi reaberto). **Não avisa** se o encaminhamento já estava aberto para o
    cliente (nenhuma mudança; mudar a data é remarcação, tratada no bloco 3). Sem cliente, sem usuário no portal ou sem
    conseguir ler o estado anterior: não grava.
  - **Deduplicação.** `chave_dedup = candidato_enviado_cliente:{encaminhamento}:{versão}`, com a versão tirada do estado
    ANTERIOR à gravação (`novo` ou `reenvio:{updated_at anterior}`). Requisições simultâneas e idênticas leem o mesmo
    estado anterior e geram a mesma chave (a segunda é descartada pelo índice único); a repetição depois da primeira já
    encontra o encaminhamento aberto (não avisa); cada reenvio real parte de um estado anterior diferente. Sem vaga a
    rota sempre insere uma linha nova, então cada envio tem o seu id e o seu aviso.
- **Próximos blocos.** 3: entrevistas (agendada, remarcada, cancelada). 4: decisão das solicitações de vaga e dos pedidos
  de alteração, encerramento e reativação.

## Ajustes pós-teste (tela de Avisos e portal)

- **Erro inline na tela de Avisos.** Ações que falham na API (ativar/desativar, remover, adicionar, ligar/desligar canal,
  restaurar padrão) mostram o erro junto da linha ou do bloco clicado, em vermelho discreto, e some sozinho em alguns
  segundos, ao fechar ou na próxima ação. A mensagem global do topo ficou só para falha de rede. A regra do último
  destinatário (409) não mudou. Em desativar e remover, o 409 sempre mostra "Não é possível: este é o último
  destinatário ativo do canal. Adicione outra pessoa antes ou desligue o canal." (`src/lib/avisosErroAcao.ts`); o aviso
  rola até a vista sem ir ao topo. Desligar o canal nunca dá 409 (a API não bloqueia). Depois de um deploy, uma aba
  aberta antes continua com o JavaScript antigo: recarregue a página (Ctrl+F5) para ver a versão nova.
- **Resultado do pedido no portal do cliente** (`/portal/solicitacoes`). Cada card mostra, por tipo (alteração,
  encerramento, reativação), o pedido mais recente: pendente ("enviado, aguardando decisão"), aprovado ou recusado com a
  data. O motivo só aparece na recusa e é o mesmo `motivo_recusa` que o cliente já recebe por e-mail. Decididos há mais
  de 30 dias e substituídos não aparecem. Com pedido de encerramento ou reativação pendente, o botão fica desabilitado
  como "Pedido enviado". Sem tabela nova; a lógica está em `src/lib/pedidoClienteResumo.ts`.
