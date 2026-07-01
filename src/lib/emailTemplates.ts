export type EmailTemplateName =
  | "entrevista_salmazos"
  | "entrevista_cliente"
  | "aprovado_cliente"
  | "reprovado"
  | "solicitar_documentos"
  | "vaga_aprovada_cliente"
  | "candidato_entrevista_cliente"
  | "nova_vaga_criada"
  | "vaga_encerrada"
  | "admissao_link";

interface TemplateData {
  nome: string;
  cargo: string;
  nomeCliente?: string;
  nomeCandidato?: string;
  numPosicoes?: number;
  cidade?: string;
  empresa?: string;
  tipoServicoLabel?: string;
  estado?: string;
  responsavel?: string;
  salario?: string;
  horario?: string;
  requisitos?: string;
  beneficios?: string;
  observacoes?: string;
  vagaUrl?: string;
  statusEncerramento?: string;
  admissaoUrl?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  descricao: string;
}

export const TEMPLATE_OPTIONS: { value: EmailTemplateName; label: string }[] = [
  { value: "entrevista_salmazos", label: "Convite para Entrevista (Salmazos)" },
  { value: "entrevista_cliente", label: "Avanço para Entrevista com Cliente" },
  { value: "aprovado_cliente", label: "Aprovação no Processo Seletivo" },
  { value: "reprovado", label: "Reprovação no Processo Seletivo" },
  { value: "solicitar_documentos", label: "Solicitar Documentos" },
  { value: "vaga_aprovada_cliente", label: "Vaga Aprovada (para Cliente)" },
  { value: "candidato_entrevista_cliente", label: "Candidato Agendado para Entrevista (para Cliente)" },
  { value: "nova_vaga_criada", label: "Nova Vaga Cadastrada (notificação equipe)" },
  { value: "vaga_encerrada", label: "Vaga Encerrada (notificação equipe)" },
];

function layout(subtitle: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <div style="background:#000000;padding:32px;text-align:center;">
      <h1 style="color:#FFD700;margin:0;font-size:26px;font-weight:700;letter-spacing:3px;">SALMAZOS RH</h1>
      <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">${subtitle}</p>
    </div>
    <div style="padding:36px 32px;">
      ${body}
      <div style="border-top:1px solid #e5e7eb;margin-top:28px;padding-top:20px;">
        <p style="font-size:13px;color:#9ca3af;margin:0;">Atenciosamente,</p>
        <p style="font-size:14px;color:#111827;font-weight:700;margin:4px 0 0;">Equipe Salmazos RH &amp; Serviços</p>
        <p style="font-size:12px;color:#9ca3af;margin:4px 0 0;">Recrutamento e Seleção · Mão de Obra Temporária · Terceirização</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function getEmailTemplate(
  name: EmailTemplateName,
  { nome, cargo, nomeCliente, nomeCandidato, numPosicoes, cidade, empresa, tipoServicoLabel, estado, responsavel, salario, horario, requisitos, beneficios, observacoes, vagaUrl, statusEncerramento, admissaoUrl }: TemplateData
): EmailTemplate {
  switch (name) {
    case "entrevista_salmazos":
      return {
        subject: "Salmazos RH - Convite para Entrevista",
        descricao: `Convite para entrevista presencial na Salmazos RH para a vaga de ${cargo}.`,
        html: layout(
          "Convite para Entrevista",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Olá, <strong>${nome}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Temos o prazer de convidá-lo(a) para uma <strong>entrevista presencial na Salmazos RH</strong>
            para a vaga de <strong style="color:#d97706;">${cargo}</strong>.
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Seu perfil chamou nossa atenção e gostaríamos de conhecê-lo(a) melhor.
            Por favor, responda este e-mail ou entre em contato conosco para confirmar sua disponibilidade
            e agendarmos a entrevista.
          </p>
          <div style="background:#fffbeb;border-left:4px solid #FFD700;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#92400e;font-weight:700;font-size:14px;">Próximos passos:</p>
            <ul style="margin:0;padding-left:18px;color:#78350f;line-height:2;font-size:14px;">
              <li>Responda este e-mail ou nos contate para confirmar presença</li>
              <li>Traga documento de identidade com foto</li>
              <li>Chegue com 10 minutos de antecedência</li>
            </ul>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">
            Ficamos no aguardo da sua confirmação. Será um prazer recebê-lo(a)! 😊
          </p>`
        ),
      };

    case "entrevista_cliente":
      return {
        subject: "Salmazos RH - Próxima Etapa do Processo Seletivo",
        descricao: `Informativo de avanço para entrevista com a empresa contratante para a vaga de ${cargo}.`,
        html: layout(
          "Próxima Etapa do Processo Seletivo",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Olá, <strong>${nome}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Temos uma ótima notícia! Você foi <strong>aprovado(a) na entrevista com a Salmazos RH</strong>
            para a vaga de <strong style="color:#d97706;">${cargo}</strong> e avançou para a próxima fase do processo seletivo.
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            A próxima etapa consiste em uma <strong>entrevista diretamente com a empresa contratante</strong>.
            Nossa equipe entrará em contato em breve com todos os detalhes sobre data, horário e local.
          </p>
          <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#166534;font-weight:700;font-size:14px;">Dicas para essa etapa:</p>
            <ul style="margin:0;padding-left:18px;color:#15803d;line-height:2;font-size:14px;">
              <li>Pesquise sobre a empresa antes da entrevista</li>
              <li>Vista-se de forma adequada e profissional</li>
              <li>Seja pontual e demonstre entusiasmo pela oportunidade</li>
            </ul>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">
            Parabéns pela conquista! Continue assim e muito sucesso! 🚀
          </p>`
        ),
      };

    case "aprovado_cliente":
      return {
        subject: "Salmazos RH - Parabéns! Você foi aprovado(a)",
        descricao: `Confirmação de aprovação pelo cliente para a vaga de ${cargo}.`,
        html: layout(
          "🎉 Parabéns! Você foi aprovado(a)!",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Olá, <strong>${nome}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            É com muito prazer que comunicamos sua <strong>aprovação</strong> no processo seletivo
            para a vaga de <strong style="color:#d97706;">${cargo}</strong>! 🎉
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Você se destacou em todas as etapas do processo e a empresa contratante confirmou seu ingresso.
            Nossa equipe entrará em contato o mais breve possível com todas as informações sobre admissão,
            documentação necessária e data de início.
          </p>
          <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#166534;font-weight:700;font-size:14px;">Próximos passos:</p>
            <ul style="margin:0;padding-left:18px;color:#15803d;line-height:2;font-size:14px;">
              <li>Aguarde nosso contato com detalhes da admissão</li>
              <li>Separe seus documentos pessoais</li>
              <li>Em caso de dúvidas, entre em contato conosco</li>
            </ul>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">
            Parabéns e seja muito bem-vindo(a)! Desejamos muito sucesso nessa nova jornada! 🌟
          </p>`
        ),
      };

    case "reprovado":
      return {
        subject: "Salmazos RH - Atualização do seu Processo Seletivo",
        descricao: `Comunicado de encerramento do processo seletivo para a vaga de ${cargo}.`,
        html: layout(
          "Atualização do Processo Seletivo",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Olá, <strong>${nome}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Agradecemos imensamente sua participação e dedicação no processo seletivo da Salmazos RH
            para a vaga de <strong>${cargo}</strong>.
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Após análise cuidadosa de todos os candidatos, seguimos com outro perfil neste momento.
            Gostaríamos de ressaltar que sua participação foi muito valorosa e que você demonstrou
            qualidades importantes ao longo do processo.
          </p>
          <div style="background:#f9fafb;border-left:4px solid #d1d5db;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.8;">
              Seu currículo ficará em nosso <strong>banco de talentos</strong> e poderemos
              contatá-lo(a) para futuras oportunidades que se encaixem em seu perfil.
              Não hesite em nos enviar atualizações do seu currículo.
            </p>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">
            Desejamos muito sucesso na sua jornada profissional! Obrigado pela confiança na Salmazos RH. 😊
          </p>`
        ),
      };

    case "solicitar_documentos":
      return {
        subject: "Salmazos RH - Documentos Necessários para Contratação",
        descricao: `Solicitação de documentos para continuidade do processo de ${cargo}.`,
        html: layout(
          "Documentos Necessários para Contratação",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Olá, <strong>${nome}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Para darmos continuidade ao seu processo de contratação para a vaga de
            <strong style="color:#d97706;">${cargo}</strong>, precisamos que você nos envie os seguintes documentos:
          </p>
          <div style="background:#fffbeb;border-left:4px solid #FFD700;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#92400e;font-weight:700;font-size:14px;">Documentos necessários:</p>
            <ul style="margin:0;padding-left:18px;color:#78350f;line-height:2;font-size:14px;">
              <li>RG (Registro Geral)</li>
              <li>CPF (Cadastro de Pessoa Física)</li>
              <li>Carteira de Trabalho (física ou digital)</li>
              <li>Comprovante de Residência (últimos 3 meses)</li>
              <li>Foto 3x4 recente</li>
            </ul>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Por favor, envie os documentos o mais breve possível para não atrasar seu processo de admissão.
            Você pode enviá-los respondendo este e-mail ou trazê-los pessoalmente à nossa unidade.
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">
            Em caso de dúvidas, não hesite em nos contatar. Estamos à disposição! 😊
          </p>`
        ),
      };

    case "vaga_aprovada_cliente":
      return {
        subject: "Salmazos RH - Sua vaga foi aceita!",
        descricao: `Confirmação de aprovação da vaga de ${cargo} para o cliente.`,
        html: layout(
          "Sua Solicitação de Vaga foi Aprovada!",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Prezado(a), <strong>${nomeCliente}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Temos o prazer de informar que sua solicitação de vaga foi <strong>aprovada</strong>
            pela equipe Salmazos RH e já está em andamento!
          </p>
          <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#166534;font-weight:700;font-size:14px;">Detalhes da vaga:</p>
            <ul style="margin:0;padding-left:18px;color:#15803d;line-height:2;font-size:14px;">
              <li><strong>Cargo:</strong> ${cargo}</li>
              <li><strong>Nº de posições:</strong> ${numPosicoes ?? 1}</li>
              <li><strong>Localidade:</strong> ${cidade ?? "A definir"}</li>
            </ul>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Nossa equipe de recrutamento já iniciou a busca por candidatos qualificados
            para atender ao perfil solicitado. Manteremos você informado(a) sobre o andamento
            do processo seletivo e enviaremos os perfis mais aderentes para sua avaliação.
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">
            Em caso de dúvidas ou necessidade de ajustes, estamos à disposição. Conte com a Salmazos RH! 😊
          </p>`
        ),
      };

    case "candidato_entrevista_cliente":
      return {
        subject: "Salmazos RH - Candidato agendado para entrevista",
        descricao: `Informativo de candidato agendado para entrevista na empresa para a vaga de ${cargo}.`,
        html: layout(
          "Candidato Agendado para Entrevista",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Prezado(a), <strong>${nomeCliente}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Gostaríamos de informar que temos um candidato aprovado em nosso processo de triagem
            e pronto para a próxima etapa: a <strong>entrevista com a ${empresa ?? "sua empresa"}</strong>.
          </p>
          <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#1e40af;font-weight:700;font-size:14px;">Dados do candidato:</p>
            <ul style="margin:0;padding-left:18px;color:#1d4ed8;line-height:2;font-size:14px;">
              <li><strong>Nome:</strong> ${nomeCandidato}</li>
              <li><strong>Vaga:</strong> ${cargo}</li>
            </ul>
          </div>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Este candidato foi avaliado e aprovado pela equipe Salmazos RH, demonstrando
            perfil compatível com os requisitos da posição. Solicitamos que nos informe
            a melhor data e horário para agendarmos a entrevista.
          </p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">
            Estamos à disposição para quaisquer esclarecimentos. Agradecemos a parceria! 🤝
          </p>`
        ),
      };

    case "nova_vaga_criada": {
      const local = [cidade, estado].filter(Boolean).join(" / ") || "Não informado";
      const reqItems = requisitos
        ? requisitos.split(" * ").map((r) => `<li>${r.trim()}</li>`).join("")
        : "";
      const benItems = beneficios
        ? beneficios.split(" * ").map((b) => `<li>${b.trim()}</li>`).join("")
        : "";

      return {
        subject: `🆕 Nova Vaga Cadastrada: ${cargo}`,
        descricao: `Notificação de nova vaga cadastrada: ${cargo}.`,
        html: layout(
          "Nova Vaga Disponível",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Uma nova vaga foi cadastrada na plataforma!</p>
          <div style="background:#fffbeb;border-left:4px solid #FFD700;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#92400e;font-weight:700;font-size:14px;">Detalhes da vaga:</p>
            <ul style="margin:0;padding-left:18px;color:#78350f;line-height:2;font-size:14px;">
              <li><strong>Cargo:</strong> ${cargo}</li>
              <li><strong>Tipo:</strong> ${tipoServicoLabel ?? "—"}</li>
              <li><strong>Local:</strong> ${local}</li>
              <li><strong>Posições:</strong> ${numPosicoes ?? 1}</li>
              <li><strong>Salário:</strong> ${salario ?? "Não informado"}</li>
              <li><strong>Responsável:</strong> ${responsavel ?? "—"}</li>
            </ul>
          </div>
          ${horario ? `<div style="margin:0 0 16px;">
            <p style="font-size:14px;font-weight:700;color:#111827;margin:0 0 6px;">Horário:</p>
            <p style="font-size:14px;color:#374151;margin:0;">${horario}</p>
          </div>` : ""}
          ${reqItems ? `<div style="margin:0 0 16px;">
            <p style="font-size:14px;font-weight:700;color:#111827;margin:0 0 6px;">Requisitos:</p>
            <ul style="margin:0;padding-left:18px;color:#374151;line-height:2;font-size:14px;">${reqItems}</ul>
          </div>` : ""}
          ${benItems ? `<div style="margin:0 0 16px;">
            <p style="font-size:14px;font-weight:700;color:#111827;margin:0 0 6px;">Benefícios:</p>
            <ul style="margin:0;padding-left:18px;color:#374151;line-height:2;font-size:14px;">${benItems}</ul>
          </div>` : ""}
          ${observacoes ? `<div style="background:#f9fafb;border-left:4px solid #d1d5db;border-radius:4px;padding:14px 18px;margin:0 0 20px;">
            <p style="font-size:13px;font-weight:700;color:#6b7280;margin:0 0 4px;">Observações internas:</p>
            <p style="font-size:14px;color:#374151;margin:0;">${observacoes}</p>
          </div>` : ""}
          <div style="text-align:center;margin-top:24px;">
            <a href="${vagaUrl ?? "#"}" style="display:inline-block;background:#000000;color:#FFD700;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">
              Ver Vaga no Painel
            </a>
          </div>`
        ),
      };
    }

    case "vaga_encerrada": {
      const isCancelada = statusEncerramento === "cancelada";
      const subjectText = isCancelada ? `❌ Vaga Cancelada: ${cargo}` : `🔴 Vaga Fechada: ${cargo}`;
      const headerText = isCancelada ? "Vaga Cancelada pelo Cliente" : "Vaga Encerrada com Sucesso";
      const badgeBg = isCancelada ? "#ef4444" : "#6b7280";
      const badgeLabel = isCancelada ? "Cancelada" : "Fechada";
      const localEnc = [cidade, estado].filter(Boolean).join(" / ") || "Não informado";

      return {
        subject: subjectText,
        descricao: `Notificação de vaga ${badgeLabel.toLowerCase()}: ${cargo}.`,
        html: layout(
          headerText,
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">
            A seguinte vaga foi encerrada na plataforma:
          </p>
          <div style="text-align:center;margin:0 0 20px;">
            <span style="display:inline-block;background:${badgeBg};color:#ffffff;font-weight:700;font-size:14px;padding:6px 18px;border-radius:20px;">
              ${badgeLabel}
            </span>
          </div>
          <div style="background:#fffbeb;border-left:4px solid #FFD700;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#92400e;font-weight:700;font-size:14px;">Detalhes da vaga:</p>
            <ul style="margin:0;padding-left:18px;color:#78350f;line-height:2;font-size:14px;">
              <li><strong>Cargo:</strong> ${cargo}</li>
              <li><strong>Tipo:</strong> ${tipoServicoLabel ?? "—"}</li>
              <li><strong>Local:</strong> ${localEnc}</li>
              <li><strong>Responsável:</strong> ${responsavel ?? "—"}</li>
            </ul>
          </div>
          <div style="text-align:center;margin-top:24px;">
            <a href="${vagaUrl ?? "#"}" style="display:inline-block;background:#000000;color:#FFD700;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">
              Ver Vaga no Painel
            </a>
          </div>`
        ),
      };
    }

    case "admissao_link":
      return {
        subject: "Salmazos RH - Complete seus dados de admissão",
        descricao: `Link de admissão digital enviado para ${nome} referente à vaga de ${cargo}.`,
        html: layout(
          "Complete seus Dados de Admissão",
          `<p style="font-size:16px;color:#111827;margin:0 0 16px;">Olá, <strong>${nome}</strong>!</p>
          <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
            Parabéns novamente pela aprovação para a vaga de <strong style="color:#d97706;">${cargo}</strong>!
            Para darmos continuidade à sua contratação, precisamos que você preencha seus dados
            e envie alguns documentos pelo link abaixo.
          </p>
          <div style="background:#fffbeb;border-left:4px solid #FFD700;border-radius:4px;padding:18px 20px;margin:0 0 20px;">
            <p style="margin:0;color:#92400e;font-size:14px;line-height:1.8;">
              Você pode preencher pelo celular, em qualquer lugar. O link é válido por
              <strong>5 dias</strong> e você pode fechar e voltar a qualquer momento — seu
              progresso fica salvo automaticamente.
            </p>
          </div>
          <div style="text-align:center;margin-top:24px;">
            <a href="${admissaoUrl ?? "#"}" style="display:inline-block;background:#000000;color:#FFD700;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">
              Preencher meus dados
            </a>
          </div>`
        ),
      };
  }
}
