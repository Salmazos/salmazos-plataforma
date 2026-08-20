# Salmazos Plataforma — Contexto para IA

> Cole este arquivo (ou aponte pra ele) no início de qualquer nova sessão de Claude Code
> neste repositório. Se o arquivo já estiver na raiz do projeto (`CLAUDE.md`), o Claude Code
> carrega ele automaticamente — não precisa colar nada.

## O que é

Plataforma de RH da Salmazos (recrutamento & seleção + terceirização + mão de obra
temporária), em produção real em **vagas.salmazos.com.br**, usada pela equipe interna
(painel) e pelos clientes da Salmazos (portal). Não é projeto de estudo — é sistema real,
com dados de candidatos, clientes e admissões reais.

## Stack

- **Next.js 15** (App Router) + **React 19** + TypeScript + Tailwind
- **Supabase** (Postgres + Auth + Storage) — projeto `ktzgjthxfpeemlgqynsk` ("Salmazos RH")
- **Vercel** — projeto `salmazos-plataforma`, team `salmazos-projects`, deploy automático
  no push pra `main` (produção real, sem staging separado)
- **GitHub**: `Salmazos/salmazos-plataforma`, branch única `main`
- Integrações: Anthropic API (match de currículo por IA, extração de currículo), ZapSign
  (assinatura eletrônica, ver seção própria abaixo), Clicksign (assinatura, uso residual —
  ver abaixo), SMTP (e-mails transacionais), XLSX (importação de vagas em massa)

## Arquitetura — padrões que se repetem em todo o código

- **Dois clients Supabase**: `createClient()` (anon key, respeita RLS, autenticado via
  cookie) para checar quem é o usuário; `createServiceClient()` (service role, bypassa
  RLS) para toda leitura/escrita de dado de negócio nas rotas API. Ver `src/lib/supabase/server.ts`.
- **Gate de acesso por papel**: cada módulo sensível tem seu próprio `checarPapelXxx(user)`
  em `src/lib/*Auth.ts` (ex: `admissaoAuth.ts`, `funcionariosAuth.ts`, `fullAccessAuth.ts`),
  chamado logo após o `if (!user)` em toda rota API do módulo. Roles conhecidos:
  `analista`, `supervisor`, `diretoria`, `dp`, `superuser`.
- **Validação**: todo body de rota API passa por `parseBody(schema, body)` com schema Zod
  centralizado em `src/lib/schemas.ts` (um arquivo grande, todos os schemas do app).
- **Auditoria**: mudanças relevantes chamam `registrarAuditoria({...})` (`src/lib/audit.ts`),
  visível em `/painel/audit-logs`.
- **Upload de arquivo**: padrão signed-URL — rota API gera `createSignedUploadUrl` no bucket
  `admissao-docs` (ou outro), cliente sobe direto pro Storage via PUT, depois PATCH confirma
  gravando a linha no banco. Nunca sobe arquivo binário através da própria rota Next.
- **Nunca decide "no escuro"**: em qualquer lugar que existe matching/inferência automática
  (nome de arquivo → tipo de documento, nome de cliente → cliente_id, etc.), a regra do
  projeto é: bateu com confiança = segue; não bateu ou ambíguo = força confirmação manual,
  nunca assume.
- **Migrações SQL**: mudança de schema sempre via `mcp__<supabase-mcp>__apply_migration` ou
  arquivo `.sql` em `supabase/`, nunca `ALTER TABLE` solto sem registro.
- **⚠️ Ambiguidade de FK entre `vagas` e `candidatos_vagas`**: existem DUAS foreign keys entre
  essas tabelas — `candidatos_vagas_vaga_id_fkey` (a original: `candidatos_vagas.vaga_id →
  vagas.id`, usar sempre em embeds "normais") e `vagas_reposicao_de_candidato_vaga_id_fkey`
  (a nova, só do fluxo de reposição de garantia: `vagas.reposicao_de_candidato_vaga_id →
  candidatos_vagas.id`). Qualquer `select()` que faça `.from("candidatos_vagas")` embutindo
  `vagas(...)` (ou o inverso) **sem** especificar `vagas!candidatos_vagas_vaga_id_fkey(...)`
  quebra em runtime com "Could not embed because more than one relationship was found for
  'candidatos_vagas' and 'vagas'". Já aconteceu 2x em produção (primeira vez corrigida em
  ~15 arquivos; segunda vez, ago/2026, reintroduzida em código novo e corrigida em
  `candidatos-vagas/[id]/route.ts` e `candidatos/[id]/etapa/route.ts`). Ver
  `supabase/migration_reposicao_garantia_fk_ambiguidade.sql` para o detalhe completo.
  **Checklist antes de escrever qualquer novo `select()` que junte `candidatos_vagas` e
  `vagas`**: sempre usar o hint de FK explícito, nunca o embed implícito `vagas(...)`.
- **Comentários no código**: só explicam o "porquê" não-óbvio (uma decisão de negócio, um
  motivo pra código estranho), nunca o "o quê". É convenção forte neste repo — description
  de commit e comentário de código costumam citar explicitamente a decisão de negócio por
  trás (ex: "ASSUNÇÃO DE NEGÓCIO CONFIRMADA COM O NEGÓCIO: ...").

## Módulos principais (visão geral, não exaustiva — 465+ commits)

- **Kanban de candidatos / vagas** (`/painel/vagas`, `/painel/banco-candidatos`) — pipeline
  por etapa, match por IA (Claude Haiku) candidato×vaga, importação de vagas via Excel com
  vínculo automático a `clientes.id` por nome normalizado.
- **Admissão Digital** (`/painel/admissoes`, `/admissao/[token]` público) — formulário que o
  candidato preenche, upload de documentos, geração de PDF do pacote, e dois fluxos de
  assinatura eletrônica **distintos e independentes**:
  - **Pacote da Contabilidade** (Ficha de Registro, Modelo Contrato, Acordo HS/VT, Termo
    LGPD + opcionais Ficha de IR/Salário Família/Termo Responsabilidade) — via
    `ModalUploadDocumentosContabilidade.tsx` + `api/admissoes/[id]/documentos-contabilidade/
    montar-enviar`. Usa **só ZapSign** (Clicksign foi removida deste fluxo especificamente).
    Upload sequencial linha-a-linha com trava de ordem (ver seção ZapSign abaixo).
  - **Assinatura Admissão** (card separado, `ModalAssinaturaEletronica.tsx` +
    `api/admissoes/[id]/assinatura` + `api/admissoes/assinatura-clicksign/criar`) — ainda usa
    **só Clicksign**, nunca migrado pra ZapSign. Não confundir os dois fluxos.
- **Funcionários** (`/painel/funcionarios`) — criado automaticamente ao gerar o pacote de
  admissão (exceto vagas de R&S puro, onde o cliente é o empregador direto). Tem sub-módulos
  de **ASO periódico** (com avisos de vencimento automáticos) e **Contrato** (com
  soft-delete restrito a diretoria).
- **Rescisões** (`/painel/rescisoes`) — lançamento, avisos automáticos (3 canais: e-mail,
  plataforma, sino), configuração global de destinatários.
- **Clientes** (`/painel/clientes`, `/painel/gestao-clientes`) — cadastro, tipos de serviço,
  `entidade_contratante` (CNPJ que assina pelos dois — ver `ENTIDADES_CONTRATANTES` em
  `constants.ts`), portal próprio pro cliente logar.
- **Portal do Cliente** (`/portal`) — avaliação de candidatos, solicitação de vaga, agenda,
  visão somente-leitura de funcionários.
- **Financeiro R&S** (`/painel/financeiro-rs`) — fee de recrutamento & seleção, taxa
  negociada, taxa de cancelamento, cobrança R&S com avisos automáticos e popup de pendências
  no login.
- **KM/Reembolsos** (`/painel/quilometragem`, `/painel/reembolsos`) — registro de visitas e
  quilometragem, relatório PDF.
- **SLA, Aniversários, Notificações (sino)** — módulos de apoio transversais.
- **Relatórios** (`/painel/relatorios`) — carteira por responsável comercial, métricas.

## ZapSign — arquitetura de posicionamento (importante, não óbvio)

`src/lib/zapsignPosicoes.ts` é uma **tabela fixa de coordenadas**, calibrada manualmente
contra casos reais assinados (Eliane para os 4 obrigatórios, Poliana para os 3 opcionais),
que substituiu uma tentativa anterior de detecção de posição por texto-âncora em tempo real
(`pdfAnchors.ts`, mantido no repo mas não usado no fluxo principal — mostrou-se frágil).
**Regra de negócio real dos 7 documentos**: o pacote da contabilidade só existe com 4
documentos OU 7, nunca quantidade intermediária. Só a Ficha de IR (5º) tem escolha real de
enviar/pular; se ela vier, os outros 2 (Salário Família, Termo Responsabilidade) tornam-se
obrigatórios e sequenciais, sem opção de pular individual. Se alguma vez a contabilidade
trocar o gerador/modelo do PDF, essas coordenadas ficam desatualizadas silenciosamente — não
há checagem automática de "o texto esperado está mesmo aqui".

Sandbox da ZapSign não envia e-mail de verdade pros signatários — pra testar, pegue o
`sign_url` direto da resposta da API (`GET /api/v1/docs/{token}/`) e abra manualmente.

## Padrão de trabalho esperado (o que NÃO deve mudar entre sessões)

Isso é o que o usuário (Olver) espera de qualquer sessão de Claude Code neste projeto,
reforçado repetidamente ao longo do histórico:

1. **Investigar antes de implementar.** Ler o código relevante, entender o padrão existente,
   só então propor mudança.
2. **Mostrar diff antes de aplicar quando a mudança é grande ou o pedido pede explicitamente.**
3. **Nunca commitar sem aprovação explícita do usuário** — nem push, nem deploy. Perguntar
   mesmo que pareça óbvio que ele vai aprovar.
4. **Validação final obrigatória em toda mudança de código**: `npx tsc --noEmit` e
   `npm run build`, ambos limpos, antes de considerar concluído.
5. **Teste com dado descartável, sempre limpo depois**: candidatos de teste com prefixo
   `ZZTEST`, e-mail de teste é `olverpera@gmail.com` (e-mail pessoal do Olver, nunca um
   candidato real), vagas de teste com `status='fechada'` (não aparecem na vaga pública).
   Depois do teste: apagar documento(s) externos (ZapSign/Clicksign sandbox), apagar linhas
   de banco criadas, apagar arquivo local baixado. Storage do Supabase não dá pra apagar por
   script neste ambiente (sem service_role local) — avisar que precisa apagar manual pelo
   painel.
6. **Perguntar antes de assumir escopo em mudanças ambíguas ou que afetam mais de um fluxo**
   (ex: "tirar a Clicksign" podia significar só um modal ou o sistema inteiro — sempre
   perguntar qual).
7. **Corrigir contagens/premissas do próprio usuário quando a investigação mostra
   divergência**, antes de agir — não seguir cegamente um número que não bate com o dado
   real.
8. **Mensagens de commit em português**, prefixo `feat:`/`fix:`/`chore:`, foco no *porquê*
   não no *o quê*, terminando com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
9. **Nunca lidar com segredos/credenciais diretamente** — se uma chave real precisa ir pro
   `.env.local` ou similar, pedir pro usuário colar ele mesmo, mesmo que pareça mais rápido
   fazer por script.

## Particularidades técnicas deste ambiente (Claude Code aqui, não do app em si)

- O middleware do Next (edge runtime) às vezes falha com `fetch failed` ao chamar o Supabase
  Auth quando o `next dev` é iniciado por certas ferramentas — rodar `npm run dev` via Bash
  com `dangerouslyDisableSandbox: true` resolve. Se o usuário roda no próprio PowerShell,
  não tem esse problema.
- `vercel env pull` **redige** valores marcados como "Sensitive" na Vercel, substituindo
  pelo literal `"[SENSITIVE]"` — não dá pra extrair segredo real assim. Segredos sensíveis
  (`SUPABASE_SERVICE_ROLE_KEY`, tokens de produção) só o usuário pode colocar no
  `.env.local`.
- `.claude/settings.local.json` é config local de permissões da ferramenta — nunca faz parte
  de commit de feature.

## Pendências conhecidas (no momento em que este documento foi gerado)

- Verificar se a Vercel de produção está com credenciais reais da ZapSign (`ZAPSIGN_API_TOKEN`,
  `ZAPSIGN_SANDBOX=false`, `ZAPSIGN_WEBHOOK_SECRET`) — ficou temporariamente em sandbox
  durante rodadas de teste e a restauração final não estava confirmada até este ponto.
- Grupo 3 da investigação de vínculo de vagas↔clientes (62 vagas restantes sem `cliente_id`,
  incluindo 2 com `cliente_nome = 'Salmazos'`) segue sem vínculo — decisão pendente do
  usuário, não vincular sem aprovação nova.
