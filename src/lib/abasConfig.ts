// Lista canônica de abas para o sistema central de exceção de acesso (Fase 2a). Cada
// chave_aba é o identificador estável gravado em usuario_acesso_customizado — nunca
// renomear uma chave existente sem migrar as linhas já cadastradas junto (quebraria
// exceções concedidas). Baseado no mapeamento completo de menu × API feito na Fase 1
// (investigação read-only). Nenhum módulo consome isso ainda — é só a lista base pra UI
// de configuração (item 4) e pros módulos que forem migrados um de cada vez depois.
export interface AbaConfig {
  chave: string;
  rotulo: string;
  grupo: string;
}

export const ABAS_CONFIG: AbaConfig[] = [
  { chave: "recrutamento_banco_candidatos", rotulo: "Banco de Candidatos", grupo: "Recrutamento" },
  { chave: "recrutamento_vagas", rotulo: "Vagas", grupo: "Recrutamento" },
  { chave: "recrutamento_agenda", rotulo: "Agenda", grupo: "Recrutamento" },

  { chave: "comercial_clientes", rotulo: "Clientes", grupo: "Comercial" },
  { chave: "comercial_carteira", rotulo: "Carteira de Clientes", grupo: "Comercial" },
  { chave: "comercial_gestao", rotulo: "Gestão de Clientes", grupo: "Comercial" },

  { chave: "rh_admissoes", rotulo: "Admissões", grupo: "RH" },
  { chave: "rh_funcionarios", rotulo: "Funcionários", grupo: "RH" },
  { chave: "rh_rescisoes", rotulo: "Rescisões", grupo: "RH" },
  { chave: "rh_aniversarios", rotulo: "Aniversários", grupo: "RH" },

  { chave: "financeiro_rs", rotulo: "Financeiro R&S", grupo: "Financeiro" },
  { chave: "faturamento_rs", rotulo: "Faturamento R&S", grupo: "Financeiro" },
  { chave: "cobrancas_rs", rotulo: "Cobranças R&S", grupo: "Financeiro" },

  { chave: "configuracoes", rotulo: "Configurações (grupo)", grupo: "Configurações" },
  { chave: "configuracoes_sla", rotulo: "Config. SLA", grupo: "Configurações" },
  { chave: "configuracoes_email_logs", rotulo: "Log de E-mails", grupo: "Configurações" },
  { chave: "configuracoes_avisos_rescisao", rotulo: "Avisos de Rescisão", grupo: "Configurações" },
  { chave: "configuracoes_avisos_cobranca_rs", rotulo: "Avisos de Cobrança R&S", grupo: "Configurações" },
  { chave: "configuracoes_acesso_cobranca_rs", rotulo: "Acesso à Cobrança R&S", grupo: "Configurações" },
  { chave: "configuracoes_avisos_aso", rotulo: "Avisos de ASO Periódico", grupo: "Configurações" },
  { chave: "configuracoes_supervisao", rotulo: "Configuração de Supervisão", grupo: "Configurações" },
  { chave: "configuracoes_usuarios", rotulo: "Usuários", grupo: "Configurações" },
  { chave: "configuracoes_audit_logs", rotulo: "Audit Logs", grupo: "Configurações" },
  { chave: "configuracoes_carta_conta_salario", rotulo: "Carta de Abertura de Conta", grupo: "Configurações" },
  { chave: "configuracoes_acesso_customizado", rotulo: "Acesso Customizado", grupo: "Configurações" },

  { chave: "relatorios", rotulo: "Relatórios", grupo: "Outros" },
  { chave: "dashboard", rotulo: "Dashboard", grupo: "Outros" },
  { chave: "reembolsos_quilometragem", rotulo: "Reembolsos / Quilometragem", grupo: "Outros" },
  { chave: "supervisao_postos", rotulo: "Supervisão de Postos", grupo: "Outros" },
  { chave: "documentos", rotulo: "Documentos", grupo: "Outros" },
];

export const ABAS_POR_CHAVE = new Map(ABAS_CONFIG.map((a) => [a.chave, a]));
