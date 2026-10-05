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

## Eventos (24) e canais

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
| Avisos ao cliente | `indicacao_decidida_cliente`, `candidato_enviado_cliente`, `entrevista_agendada_cliente`, `entrevista_remarcada_cliente` | sino, popup (sem lista de pessoas; ver "Avisos ao cliente") |
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
restauração, isolamento de canais, catálogo, popups, pedidos do cliente e avisos ao cliente; 166 casos). Na Fase 3 três expectativas dos
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
- **Bloco 3: Entrevista agendada e Entrevista remarcada** (`entrevista_agendada_cliente` e
  `entrevista_remarcada_cliente`). Migration: `supabase/migration_avisos_cliente_bloco3.sql` (2 eventos e 4 canais ligados).
  - **O que dispara.** *Agendada*: a Salmazos define a data de um encaminhamento que ainda estava sem data. *Remarcada*:
    a data ou o horário muda num encaminhamento que já tinha data. Quando o candidato já é enviado com a data, o aviso é o
    de "Candidato enviado" (bloco 2), nunca os dois.
  - **Caminhos que gravam a data do encaminhamento.** (1) `PATCH /api/encaminhamentos/[id]` (botão Remarcar do Kanban):
    ligado. (2) `POST /api/encaminhamentos` (Encaminhar do Kanban e da vaga) quando reaproveita um encaminhamento que
    continuava aberto e a data é definida ou mudada: ligado. (3) `POST /api/portal/agendar`: é o próprio cliente que
    agenda, **sem aviso**. Não gravam data: `sincronizarEncaminhamento` e a decisão da indicação (criam encaminhamento
    encerrado/aprovado), os crons de lembrete (só mexem em carimbos de lembrete) e `candidatos-vagas`
    (`data_entrevista_salmazos` é a entrevista da Salmazos com o candidato, outra coisa).
  - **Decisão** (`decidirAvisoEntrevista`, em `horaEntrevista.ts`): compara o estado ANTERIOR, lido antes de gravar, com
    o novo, do jeito que o cliente enxerga a data (`dataEntrevistaParaCliente`). Sem data antes e com data agora =
    agendada. Com data antes e data/horário diferente = remarcada. Não avisa se nada mudou (o 12:00 de convenção do Kanban
    conta como "sem horário"; diferença de segundos também não é mudança), se só apagou a data, se não havia estado
    anterior ou se o encaminhamento estava ou ficou encerrado (aprovado, reprovado, desistiu).
  - **Texto.** "Entrevista agendada: {nome} — vaga {título} — dd/mm/aaaa às hh:mm" e "Entrevista remarcada: {nome} — vaga
    {título} — de dd/mm/aaaa [às hh:mm] para dd/mm/aaaa [às hh:mm]" (a hora some quando é o 12:00 de convenção). Nome ou
    vaga nulos só encurtam a frase. Só nome, vaga e datas.
  - **Link.** `/portal/agenda` (calendário onde o cliente vê a data; ela lista só encaminhamento "aguardando"). No caso raro
    de a data ser definida com o encaminhamento ainda `aguardando_agendamento_cliente`, o perfil
    `/portal/candidato/{id do encaminhamento}`, para o clique nunca cair numa tela sem o item.
  - **Deduplicação.** `chave_dedup = {evento}:{encaminhamento}:{versão}`; agendada: `{data nova}@{updated_at anterior}`;
    remarcada: `{data anterior}>{data nova}@{updated_at anterior}`. Repetir a mesma requisição: a segunda lê o estado já
    igual e não avisa. Duas simultâneas leem o mesmo estado anterior (mesma chave) e a segunda cai no índice único sem
    lançar. Remarcações sucessivas para datas diferentes geram chaves diferentes; o `updated_at` anterior no fim evita que
    voltar a uma data já usada (A>B, B>A, A>B) seja engolido pela chave antiga.
  - **Isolamento.** Cada rota ganhou só linhas novas: uma leitura do estado anterior e uma chamada extra, isolada e que
    nunca lança, depois da gravação. Histórico, e-mails, lembretes por cron e etapa não mudaram. Aviso de entrevista
    cancelada ou de desistência não existe nesta fase.
- **Bloco 4 (último): Solicitação de vaga decidida e Pedido do cliente decidido** (`solicitacao_vaga_decidida_cliente` e
  `pedido_vaga_decidido_cliente`). Migration: `supabase/migration_avisos_cliente_bloco4.sql` (2 eventos e 4 canais ligados).
  Código: `src/lib/avisoClienteDecisao.ts` (`avisarSolicitacaoDecidida`, `avisarPedidoDecidido`) e as regras puras em
  `avisoClienteRegras.ts`.
  - **Onde liga** (uma chamada isolada em cada rota, depois da decisão e do e-mail que a rota já enviava): solicitação
    aprovada em `POST /api/vagas/from-solicitacao`; solicitação recusada em `PATCH /api/solicitacoes-vagas/[id]/recusar`;
    pedido de alteração em `POST /api/solicitacoes-vagas/[id]/alteracao`; pedido de encerramento ou reativação em
    `POST /api/vagas/[id]/solicitacao-status`. As rotas ganharam só linhas novas (nenhuma removida). Os e-mails, o status, o
    histórico e os selos do portal não mudaram. A edição da solicitação (`PATCH /api/solicitacoes-vagas/[id]`) não decide
    nada (só altera campos) e o pedido substituído por outro mais novo não é decisão: nenhum dos dois avisa.
  - **Texto.** Só o que o cliente já vê em Minhas Solicitações: o cargo e, na recusa, o `motivo_recusa` (o mesmo campo que o
    e-mail da rota envia). Aprovada: "Sua solicitação de vaga {cargo} foi aprovada e já está no ar". Recusada: "Sua
    solicitação {cargo} não foi aprovada. Motivo: {motivo}". Pedido: "Seu pedido de {alteração|encerramento|reativação} para
    {cargo} foi aprovado" / "... não foi aprovado. Motivo: {motivo}". Para o cliente a palavra é sempre "encerramento",
    nunca "pausa". Cargo nulo só encurta a frase. Nunca decisor, notas, observações internas, responsável nem fee.
  - **Link.** `/portal/solicitacoes`: lista todas as solicitações do cliente (aprovada, recusada, com o motivo) e, em cada
    card, o selo de resultado dos pedidos de alteração, encerramento e reativação (decididos há até 30 dias).
  - **Deduplicação.** Os dados são lidos da própria linha já gravada. Solicitação:
    `solicitacao_vaga_decidida_cliente:{id}:{aprovada|recusada}:{aprovada_em}`. Pedido:
    `pedido_vaga_decidido_cliente:{alteracao|encerramento|reativacao}:{id do pedido}:{aprovado|recusado}:{decidido_em}`.
    Chamar a rota duas vezes seguidas: a segunda recebe 409 (o status já não é pendente) e nem chega ao aviso; se uma
    chamada chegasse duas vezes ao aviso, a mesma chave cai no índice único (23505, sem lançar). Uma decisão nova tem outro
    id de pedido ou outro instante, então gera aviso novo.
  - **Isolamento.** `criarAvisoCliente` e os dois helpers nunca lançam: falha de rede, canal desligado, cliente sem usuário no
    portal ou linha não encontrada só resultam em "não avisou". O aviso não depende do e-mail (e vice-versa).
- **Fechamento da fase.** O grupo "Avisos ao cliente" tem 6 eventos, todos com sino e popup, sem lista de pessoas e sem
  "Restaurar padrão" (liga/desliga por canal): decisão da indicação direta, candidato enviado ao cliente, entrevista
  agendada, entrevista remarcada, solicitação de vaga decidida e pedido do cliente decidido. A política de e-mails ao
  cliente é tratada em tarefa separada.

## E-mails ao cliente (interruptor "E-mail" e destinatários)

Migration: `supabase/migration_avisos_cliente_email.sql` (7 eventos e 7 linhas de canal). Na tela (Configurações > Avisos,
aba "Avisos ao cliente", seção "E-mails ao cliente") cada e-mail tem um interruptor "E-mail". Sem lista de pessoas.

| Evento (`aviso_eventos`) | `email_logs.tipo` | Onde é enviado | Padrão |
|---|---|---|---|
| `email_cliente_candidato_entrevista` | `candidato_entrevista_cliente` | `candidatos/[id]/etapa` (etapa entrevista com o cliente) | ligado |
| `email_cliente_lembrete_entrevista_hoje` | `lembrete_entrevista_hoje` | `cron/lembrete-entrevista-hoje` (9h) | ligado |
| `email_cliente_vaga_aprovada` | `vaga_aprovada_cliente` | `vagas/from-solicitacao` | **desligado** |
| `email_cliente_vaga_status_decidido` | `vaga_status_decidido` | `vagas/[id]/solicitacao-status` | **desligado** |
| `email_cliente_solicitacao_recusada` | `solicitacao_recusada` | `solicitacoes-vagas/[id]/recusar` | ligado |
| `email_cliente_alteracao_decidida` | `alteracao_solicitacao_aprovada` e `_recusada` (um só interruptor) | `solicitacoes-vagas/[id]/alteracao` | ligado |
| `email_cliente_lembrete_agendamento` | `lembrete_agendamento_pendente` | `cron/lembrete-agendamento` (só o e-mail ao cliente) | ligado |

- **Semântica INVERSA à de sino/popup** (`emailClienteLigado`, em `avisoCliente.ts`; regra pura `emailClienteLigadoRegra`):
  sem linha de canal ou erro de leitura = **ligado** (o e-mail já existia); só `ativo = false` desliga. A tela mostra
  "ligado" quando não há linha. Os dois e-mails desligados por padrão (vaga aprovada; encerramento/reativação decidido)
  já são cobertos pelo sino e popup do bloco 4. Desligar não remove código: a rota só deixa de enviar e nada mais muda
  (histórico, status, selos, aviso de sino). Reativar é um clique na tela. O padrão está documentado em
  `PADRAO_EMAIL_CLIENTE` (`avisosPadrao.ts`), sem criar "Restaurar padrão" para o grupo.
- **Destinatários** (`destinatariosEmailCliente`, em `destinatariosEmailCliente.ts`): o e-mail de LOGIN de cada usuário do
  portal (`cliente_usuarios` -> `auth.users`, via `auth.admin.getUserById`), únicos e não vazios, e **um e-mail por pessoa**
  (`enviarEmailAoCliente`: nunca vários endereços no mesmo "to"; cada envio tem a sua linha em `email_logs`; uma falha não
  impede os outros). Cliente sem usuário no portal, lista vazia ou qualquer erro de leitura = `clientes.contato_email`
  (último recurso, comportamento anterior); sem ele, ninguém. O `cliente_id` vem sempre da linha do banco, nunca do request.
- **Crons.** Continua um e-mail por cliente por dia (o lembrete de entrevistas agrupa as entrevistas), agora enviado a cada
  usuário do portal. O carimbo de "enviado" (`lembrete_entrevista_hoje_enviado_em`, `ultimo_lembrete_agendamento_em`) é
  gravado se **pelo menos um** envio foi aceito pelo SMTP. Com o interruptor desligado, o cron de entrevistas nem consulta
  as entrevistas; o de agendamento não envia ao cliente mas dá o ciclo por cumprido (carimbo) para o lembrete ao ANALISTA
  manter o ritmo de 48 horas, e o e-mail ao analista não passa pelo interruptor.
- **API de configuração.** `PATCH /api/avisos-config/canal` só aceita o canal `email` para estes 7 eventos;
  `POST /api/avisos-config/destinatarios` continua devolvendo 400 (sem lista de pessoas). O grupo segue sem "Restaurar padrão",
  então `avisos_restaurar_padrao` e a regra do último destinatário não o alcançam.

## Decisão do cliente (aprovou ou reprovou um candidato): sino e popup no painel

Migration: `supabase/migration_avisos_decisao_cliente_popup.sql`. Reaproveita os eventos `portal_candidato_aprovado` e
`portal_candidato_reprovado` (grupo Portal do cliente), que ganham os canais Sino e Popup além do E-mail (que não mudou:
aprovado ligado, reprovado desligado, olver@ e rh@).

- **Sino** (`avisarDecisaoClienteCandidato`, chamada por `PATCH /api/portal/avaliar` depois da decisão gravada; nunca lança):
  o responsável do candidato (`candidatos.responsavel` -> `buscarPerfilResponsavel`) **mais** a lista do canal sino do evento,
  uma linha por `user_id` em `notificacoes_analista` (tipos `aprovacao_cliente` e `reprovacao_cliente`), sem repetir quem
  está nos dois. Sem responsável e sem lista: a linha geral da unidade do cliente (`user_id` nulo), como antes. Sem linha de
  canal ou erro de leitura = ligado; só `ativo = false` desliga TUDO (responsável, lista e geral). A lista pode ficar vazia
  (a regra do último destinatário e a restauração do padrão não se aplicam ao sino e ao popup destes 2 eventos).
- **Texto:** "{cliente} aprovou/reprovou a candidatura de {candidato} para a vaga {título}", mais o comentário do cliente
  (aprovação) ou o motivo (reprovação), tudo cortado em 400 caracteres. Nunca fee, dados de admissão, notas internas nem quem
  decidiu por dentro. Link: o perfil do candidato (`candidato_id`).
- **Popup** (`GET /api/decisoes-cliente-popup`, lido uma vez ao entrar no painel, sem polling): avisos NOMINAIS do próprio
  usuário (`user_id` da sessão) dos últimos 30 dias que ele ainda não viu (`notificacao_popup_vistos`, por aviso e usuário), só
  dos eventos com o canal popup ligado (sem linha ou erro de leitura = não mostra). Sem lista própria: quem vê é o responsável
  e a lista do sino. Clicar no cartão marca só aquele e abre o candidato; Ok e X marcam os listados
  (`POST /api/decisoes-cliente-popup/marcar-visto`, só linhas do próprio usuário). Não marca a notificação do sino como lida.
  A linha geral da unidade nunca gera popup.
- **Duplicidade:** o `UPDATE` do encaminhamento só grava com `status = 'aguardando'`; quem perde a corrida recebe o mesmo 409,
  sem aviso nem e-mail.
- O sino interno do painel (polling de 30 s e Realtime) não mudou: o aviso novo chega por ele como os outros.

## Garantia R&S (equipe interna): sino, popup e e-mail

Migration: `supabase/migration_avisos_garantia_rs.sql` (aditiva; não aplicada pelo código). Dois eventos novos no grupo Vagas,
com os canais E-mail, Sino e Popup: `garantia_rs_vencendo` (cron `garantia-rs`) e `garantia_rs_acionada` (rota
`PATCH /api/candidatos-vagas/[id]/acionar-garantia`). O cliente não recebe nada. Os tipos gravados em `notificacoes_analista` e
`email_logs` (`alerta_garantia_rs`, `garantia_acionada`) não mudaram.

- **Quando avisa:** só no último dia da garantia (sem aviso antecipado). Se o cron falhar, ele recupera até 2 dias para trás
  (datas em Brasília); `candidatos_vagas.garantia_alerta_enviado_em` evita repetir (inclusive com o cron rodando duas vezes).
  O carimbo só é gravado se pelo menos um canal ligado entregou, ou se todos estão desligados; se todos os ligados falharam,
  a próxima execução tenta de novo.
- **Sino:** o responsável do candidato (sempre) MAIS a lista do canal sino, uma linha por `user_id`; sem os dois, a linha geral
  da unidade. Sem linha de canal ou erro de leitura = ligado; só `ativo = false` desliga tudo. Lista vazia é permitida.
- **Popup:** estende o popup da decisão do cliente (`GET /api/decisoes-cliente-popup`): lista as linhas nominais dos tipos
  `alerta_garantia_rs` e `garantia_acionada`, cada tipo ligado ao seu evento. Mesmas regras (lido uma vez, sem polling, 30 dias,
  só do próprio usuário, "visto" por usuário; sem linha ou erro = não mostra).
- **E-mail:** canal ligado sem destinatários = modo legado, exatamente como era (vencendo: analistas da unidade, sem diretoria e
  superuser; acionada: todos os analistas da unidade). Com lista cadastrada, usa a lista. Template, assunto e tipo iguais; links
  no domínio fixo `https://vagas.salmazos.com.br`. Em recuperação (aviso fora do dia do vencimento) o texto usa a data, não "hoje".
- **Acionar:** o `UPDATE` só marca com `garantia_acionada = false`; quem perde a corrida recebe o mesmo 409, antes de criar a vaga
  de reposição, o histórico ou o aviso. O prazo vale até 23:59:59 de Brasília (-03:00) do dia do vencimento.
- **Padrão / "Restaurar padrão do grupo vagas":** sino e popup ligados com lista vazia (exceção `permite_vazio`); e-mail ligado com
  a mesma lista de `vaga_cancelada` (Rebecca, Andreza, Giovanni). Atenção: restaurar o grupo troca o modo legado do e-mail por essa lista.

## Pós-venda R&S (equipe comercial): sino, popup e e-mail

Migration: `supabase/migration_avisos_pos_venda_rs.sql` (aditiva; sem coluna, tabela, função, trigger nem policy novos). Um
evento novo no grupo Vagas, `pos_venda_rs_7dias`, com E-mail, Sino e Popup. O cliente não recebe nada. Os tipos gravados
(`pos_venda_rs` em `notificacoes_analista` e `email_logs`) não mudaram, nem a regra de negócio (7 dias corridos depois do
início, só nas 3 primeiras vagas de R&S do cliente).

- **Cron `pos-venda-rs`** (o mesmo, 0 9 * * *): seleciona `data_inicio` entre (hoje - 9) e (hoje - 7) em horário de Brasília
  (isto é, início + 7 entre hoje - 2 e hoje), com `pos_venda_notificado_em` nulo. Os descartes (sem cliente, fora das 3
  primeiras) continuam carimbando. O carimbo do aviso só é gravado se algo foi entregue (sino gravado ou e-mail aceito) ou se
  todos os canais estão desligados; se havia canal ligado e nada foi entregue (falha ou sem destinatário), não carimba e a
  execução seguinte tenta de novo, até 2 dias. Erro na consulta responde 500 (não há coluna nova, então não há fallback).
- **Sino:** os destinatários de sempre (`resolverDestinatariosPosVenda`: responsável comercial do cliente ou, sem ele, o time
  comercial da unidade) MAIS a lista do canal sino, uma linha por `user_id` e sem repetir. Sem linha de canal ou erro de
  leitura = ligado; só `ativo = false` desliga tudo. A lista pode ficar vazia.
- **Popup:** continua o `PopupPosVendaRSHoje` (avisos de pós-venda do dia, uma vez por dia por usuário), agora ligado ao
  interruptor do canal popup do evento: sem linha ou erro de leitura = não mostra. Não usa o popup de decisões do cliente
  (evita aviso duplicado).
- **E-mail:** sem lista = os mesmos destinatários de sempre; com lista, só a lista. Assunto e template iguais; link no
  domínio fixo `https://vagas.salmazos.com.br`.
- **Padrão / "Restaurar padrão do grupo vagas":** sino e popup ligados com lista vazia (exceção `permite_vazio`); e-mail ligado
  com a mesma lista de `vaga_cancelada` (Rebecca, Andreza, Giovanni). Restaurar troca o modo legado do e-mail por essa lista.

## Avisos restantes (antes fixos no código)

Migration única: `supabase/migration_avisos_restantes.sql` (aditiva: só inserts em `aviso_eventos` e `aviso_eventos_canais`; nenhuma
coluna, tabela, função, trigger, policy ou constraint). Onze eventos novos no grupo Vagas; os tipos gravados em
`notificacoes_analista` e `email_logs` não mudaram. Regras comuns (as mesmas da garantia e do pós-venda): sino sem linha de canal ou
erro de leitura = ligado e só `ativo = false` desliga tudo; popup sem linha ou erro = não mostra; e-mail sem lista = comportamento de
sempre, com lista = só a lista; os destinatários de sempre MAIS a lista do sino, uma linha por usuário; carimbo/dedup só quando algo foi
entregue (ou tudo está desligado). Peças comuns: `avisoConfiguravel.ts` e `avisosRestantesRegras.ts`.

| Evento | Canais | Quem recebe (sempre) | Observação |
|---|---|---|---|
| `candidato_transferido` | sino | responsável antigo e novo | o novo responsável passou a ser avisado |
| `candidato_curriculo_atualizado` | sino | responsável do candidato (sem ele, linha geral) | antes ia para todos |
| `funcionario_nao_criado` | sino | linha geral sem unidade | não repete o mesmo aviso em 24 h |
| `lembrete_agendamento_pendente_analista` | sino, e-mail | responsável ativo (sem ele, equipe da unidade) | não repete em 40 h se o e-mail ao cliente falha |
| `lembrete_comercial` | sino, popup | o próprio vendedor; a lista recebe com o nome do vendedor | um aviso por vendedor por dia |
| `supervisao_cliente_atrasada` | sino, e-mail, popup | sino: diretoria/superuser + supervisor; e-mail: supervisor | o sino não repete mais todo dia |
| `conta_receber_hortolandia_atrasada` | sino, popup | diretoria/superuser | um aviso por lançamento; só o carimbo é gravado na conta |
| `fee_rs_nao_configurado` | sino | linha geral da unidade | só os 3 avisos; cálculo do fee e decisão do cliente intactos |
| `aniversario_mes_seguinte` | e-mail | analistas da unidade + sócios | lote mensal por unidade |
| `aniversario_tres_dias` | sino, e-mail | linha geral da unidade + analistas e sócios | recupera até 2 dias; dedup por ano da ocorrência |
| `aniversario_no_dia` | sino, e-mail, popup | idem | recupera até 2 dias |

`agendamento_cliente` (grupo Portal do cliente) já existia: agora o responsável ativo sempre recebe e a lista também vale. Os popups
existentes (comercial, supervisão, faturamento, aniversários) só ganharam a checagem do canal popup do evento; a lógica de estado e de
"visto" deles não mudou. Links de e-mail via `src/lib/siteUrl.ts` (constante fixa `https://vagas.salmazos.com.br`).

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
