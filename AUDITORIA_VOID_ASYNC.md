# Auditoria — Padrão `void` em chamadas assíncronas (fire-and-forget em serverless)

Data: 20/07/2026
Escopo: `src/app/api/**`, `src/lib/**`, e demais arquivos do repositório.
Referência (padrão correto, já corrigido): `await` + tratamento de erro em
`src/app/api/cron/aniversarios/route.ts`, `src/app/api/cron/garantia-rs/route.ts`,
`src/lib/slaChecker.ts`, `src/app/api/portal/solicitar-vaga/route.ts`.

Nenhum código foi alterado — este documento é só investigação/relatório.

---

## ALTO — grava estado/sucesso antes de confirmar que a tarefa assíncrona terminou

### 1. `src/app/api/candidatos-vagas/[id]/acionar-garantia/route.ts:127`
```ts
void notifyAllAnalysts({ subject: `🔄 Garantia R&S Acionada...`, html, tipo: "garantia_acionada", ... });
```
- **O que dispara:** e-mail para todos os analistas avisando que a garantia de R&S foi
  acionada (reposição gratuita de candidato).
- **Estado já gravado antes:** sim. `garantia_acionada: true` é gravado com `await`
  nas linhas 38-45 — *antes* do `void notifyAllAnalysts`. A vaga já foi duplicada
  (linha 61-85) e o candidato já foi resetado (linha 89-92). A rota retorna
  `{ success: true, nova_vaga_id }` (linha 143) sem nunca confirmar que o e-mail saiu.
- **Risco:** é o mirror exato do bug original ainda não corrigido — se a Vercel matar
  a function antes do `notifyAllAnalysts` terminar, o sistema já "consumiu" a garantia
  e devolve sucesso ao usuário, mas nenhum analista fica sabendo que isso aconteceu.

### 2. `src/app/api/candidatos-vagas/[id]/acionar-garantia/route.ts:136`
```ts
void supabase.from("notificacoes_analista").insert({ tipo: "garantia_acionada", ... });
```
- **O que dispara:** criação do "sininho" de notificação in-app para os analistas
  (mesma rota do item 1).
- **Estado já gravado antes:** mesmo contexto do item 1 — `garantia_acionada` já
  persistido.
- **Risco:** se essa insert for interrompida junto com o e-mail do item 1, nem
  e-mail nem notificação in-app chegam a ninguém. Combinado ao item 1, essa rota é a
  ocorrência mais crítica do repositório.

### 3. `src/app/api/portal/avaliar/route.ts:150-271`
```ts
void (async () => {
  try {
    ...
    await sendEmail({ to: "olver@salmazos.com.br", subject: `✅ Aprovação de Candidato...`, ... });
  } catch (emailErr) { console.error(...) }
})();
```
- **O que dispara:** e-mail interno avisando que um candidato foi aprovado pelo
  cliente, incluindo dados de admissão e cálculo de fee de R&S.
- **Estado já gravado antes:** sim. O status `aprovado` e todos os campos de
  admissão/fee já foram persistidos com `await` nas linhas 60-131, *antes* do bloco
  `void (async () => {...})()`. A resposta HTTP (`NextResponse.json({ data: updated })`,
  linha 274) não espera esse e-mail.
- **Risco:** a aprovação já fica "fechada" no sistema; se a function morrer no meio do
  IIFE, o time comercial/financeiro nunca recebe o aviso com o valor do fee — sem
  nenhum log de erro visível, porque o `catch` interno é o único lugar que veria a
  falha e ele mesmo pode não rodar se a function for morta antes.

---

## MÉDIO — fire-and-forget arriscado, mas sem dedup indevido dependente dele

### 4. `src/app/api/admissoes/route.ts:112`
```ts
sendEmail({ to: candidato.email, subject, html, tipo: "admissao_link", ... });
```
- **O que dispara:** e-mail ao candidato com o link do formulário de admissão.
- Nem `void` nem `await` — é um floating promise "puro", nem sequer sinalizado como
  intencional (TypeScript deixa passar, mas nenhum eslint `no-floating-promises`
  pegaria isso sem configuração).
- **Atenuante:** existe fallback via WhatsApp (`whatsappUrl`, linhas 101-103,
  devolvido na resposta) — se o e-mail falhar, ainda há um canal alternativo.
- **Gravidade:** MÉDIO-ALTO — mitigado pelo WhatsApp, mas merece o mesmo tratamento
  dos 4 arquivos já corrigidos.

### 5. `src/app/api/candidatos/[id]/etapa/route.ts:105`
```ts
sendEmail({ to: data.email, subject, html, tipo: "notificacao_analista", candidato_id: id });
```
- **O que dispara:** e-mail ao candidato avisando mudança de etapa no processo.
- Etapa já persistida com `await` nas linhas 82-96, antes do disparo. Sem `void`,
  sem `await`, sem fallback.
- **Gravidade:** MÉDIO.

### 6. `src/app/api/candidatos/[id]/etapa/route.ts:125`
```ts
sendEmail({ to: cliente.contato_email, subject, html, tipo: "candidato_entrevista_cliente", candidato_id: id });
```
- **O que dispara:** e-mail ao contato do cliente avisando de entrevista agendada.
- Mesmo contexto do item 5 (mesma rota).
- **Gravidade:** MÉDIO.

### 7. `src/app/api/vagas/from-solicitacao/route.ts:92`
```ts
sendEmail({ to: cliente.contato_email, subject, html, tipo: "vaga_aprovada_cliente", vaga_id: vaga.id });
```
- **O que dispara:** e-mail ao cliente avisando que a vaga solicitada por ele foi
  aprovada.
- Status `aprovada` já persistido com `await` nas linhas 66-75, antes do disparo.
- **Gravidade:** MÉDIO.

---

## MÉDIO — padrão fire-and-forget "por design", sem dedup crítico dependente

### 8. `void registrarHistorico(...)` — 12 ocorrências
`src/lib/registrarHistorico.ts` já documenta o padrão como intencional:
> "Fire-and-forget helper — swallows all errors so callers are never blocked.
> Always call as `void registrarHistorico(...)` from API routes."

A função engole todos os erros internamente (try/catch próprio) e nenhuma lógica de
negócio ou dedup lê a tabela `historico_candidato` para decidir algo crítico depois —
é só a timeline exibida na tela do candidato. Ainda assim, sujeito ao mesmo risco
estrutural: se a Vercel matar a function antes do `INSERT`, a entrada de histórico
some silenciosamente, sem log nenhum sobrando (o próprio helper suprime o erro).

Ocorrências:
- `src/app/api/candidatos-vagas/[id]/route.ts:50`
- `src/app/api/encaminhamentos/route.ts:65`
- `src/app/api/candidatos-vagas/[id]/retencao/route.ts:38`
- `src/app/api/candidatos-vagas/[id]/finalizar/route.ts:98`
- `src/app/api/candidatos-vagas/[id]/finalizar/route.ts:143`
- `src/app/api/candidatos-vagas/[id]/finalizar/route.ts:151`
- `src/app/api/candidatos-vagas/[id]/fee-status/route.ts:36`
- `src/app/api/candidatos-vagas/[id]/acionar-garantia/route.ts:94`
- `src/app/api/candidatos/[id]/responsavel/route.ts:68`
- `src/app/api/candidatos/[id]/etapa/route.ts:135`
- `src/app/api/candidatos/[id]/encerrar-alocacao/route.ts:42`
- `src/app/api/candidatos/route.ts:256`
- `src/app/api/portal/avaliar/route.ts:134`

### 9. `registrarAuditoria(...)` — usada em ~26 rotas
`src/lib/audit.ts:29-46`:
```ts
export function registrarAuditoria(params: AuditoriaParams): void {
  const supabase = createServiceClient();
  void (async () => {
    try { await supabase.from("audit_logs").insert({ ... }); }
    catch (err) { console.error("[audit]", err); }
  })();
}
```
- Mesmo padrão estrutural do `registrarHistorico`: função síncrona por fora (nem
  retorna `Promise`), IIFE `void` por dentro, erros engolidos, sem dedup dependente.
  Normalmente chamada logo antes do `return NextResponse.json(...)` da rota — ou
  seja, exatamente o ponto onde a Vercel tem menos tempo de sobra para deixar o IIFE
  terminar.
- **Exemplos de uso:** `src/app/api/admissoes/route.ts:90`,
  `src/app/api/candidatos/[id]/etapa/route.ts:143`, `src/app/api/vagas/route.ts`,
  `src/app/api/usuarios/route.ts`, `src/app/api/candidatos/route.ts`, e mais ~21 rotas
  (lista completa disponível via grep por `registrarAuditoria(` se precisar).
- **Gravidade:** MÉDIO — sistêmico (usado em quase toda rota de escrita), mas o
  impacto é restrito ao log de auditoria/compliance, não a e-mails ou fluxo de
  negócio.

---

## Resumo priorizado

| # | Gravidade | Arquivo:linha | Função disparada | Por quê |
|---|-----------|----------------|-------------------|---------|
| 1 | **ALTO** | `acionar-garantia/route.ts:127` | `notifyAllAnalysts` | dedup (garantia usada) já gravado antes; e-mail pode nunca sair |
| 2 | **ALTO** | `acionar-garantia/route.ts:136` | insert notificação in-app | mesma rota do #1, mesmo risco |
| 3 | **ALTO** | `portal/avaliar/route.ts:150-271` | `sendEmail` (aprovação c/ fee) | aprovação já fechada antes; e-mail financeiro pode sumir |
| 4 | MÉDIO-ALTO | `admissoes/route.ts:112` | `sendEmail` (link admissão) | sem void/await, mas tem fallback WhatsApp |
| 5 | MÉDIO | `candidatos/[id]/etapa/route.ts:105` | `sendEmail` (candidato) | sem void/await, sem fallback |
| 6 | MÉDIO | `candidatos/[id]/etapa/route.ts:125` | `sendEmail` (cliente) | sem void/await, sem fallback |
| 7 | MÉDIO | `vagas/from-solicitacao/route.ts:92` | `sendEmail` (cliente) | sem void/await, sem fallback |
| 8 | MÉDIO | 12 arquivos — `void registrarHistorico(...)` | insert em `historico_candidato` | fire-and-forget por design, só afeta timeline |
| 9 | MÉDIO | ~26 rotas — `registrarAuditoria(...)` | insert em `audit_logs` | fire-and-forget por design, só afeta log de auditoria |

**Sugestão de ordem de correção:** itens 1–3 primeiro (mesmo padrão do bug já
corrigido, envolvem e-mails de negócio críticos), depois 4–7 (e-mails sem nem sequer
`void`, fáceis de corrigir com `await` + try/catch), e por último avaliar se vale a
pena tornar 8–9 mais resilientes (ex.: mover para uma fila/edge function, já que são
"by design" e de baixo impacto individual, mas volumosos).
