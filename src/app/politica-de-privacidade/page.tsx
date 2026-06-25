import Link from "next/link";

export const metadata = {
  title: "Política de Privacidade | Salmazos RH",
  description: "Política de Privacidade e proteção de dados da Salmazos RH & Serviços, em conformidade com a LGPD.",
};

export default function PoliticaPrivacidadePage() {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#111827" }}>
      {/* Header */}
      <header style={{ borderBottom: "3px solid #FFD700", background: "#000" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Salmazos_logo_Amarelo.png" alt="Salmazos RH" style={{ height: 44, width: "auto", objectFit: "contain" }} />
          <Link
            href="/vagas"
            style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, textDecoration: "none" }}
          >
            ← Voltar às vagas
          </Link>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
          Política de Privacidade
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 40 }}>
          Última atualização: junho de 2026 &nbsp;|&nbsp; Em conformidade com a Lei nº 13.709/2018 (LGPD)
        </p>

        <Section title="1. Quem somos">
          <p>
            A <strong>Salmazos RH & Serviços</strong> é uma empresa especializada em recrutamento, seleção e gestão de mão de obra. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos os dados pessoais dos candidatos que utilizam nossa plataforma.
          </p>
          <p style={{ marginTop: 12 }}>
            Para exercer seus direitos ou esclarecer dúvidas, entre em contato com nosso Encarregado de Proteção de Dados (DPO) pelo e-mail <a href="mailto:privacidade@salmazos.com.br" style={linkStyle}>privacidade@salmazos.com.br</a>.
          </p>
        </Section>

        <Section title="2. Dados que coletamos">
          <p>Ao se candidatar a uma vaga ou se cadastrar em nosso banco de talentos, podemos coletar:</p>
          <ul style={listStyle}>
            <li><strong>Identificação:</strong> nome completo e CPF</li>
            <li><strong>Contato:</strong> e-mail, telefone/WhatsApp</li>
            <li><strong>Localização:</strong> cidade e estado</li>
            <li><strong>Perfil profissional:</strong> cargo pretendido, tempo de experiência, formação acadêmica, habilidades, pretensão salarial e turno disponível</li>
            <li><strong>Currículo:</strong> documento enviado em formato PDF, Word ou imagem</li>
            <li><strong>Experiências:</strong> histórico profissional extraído do currículo via inteligência artificial</li>
            <li><strong>Dados LGPD:</strong> registro de consentimento e data de aceite desta política</li>
          </ul>
        </Section>

        <Section title="3. Como usamos seus dados">
          <p>Seus dados são utilizados exclusivamente para:</p>
          <ul style={listStyle}>
            <li>Avaliação e triagem de candidatos para vagas em aberto</li>
            <li>Formação e manutenção de banco de talentos para oportunidades futuras</li>
            <li>Encaminhamento de candidaturas a empresas clientes da Salmazos para fins de seleção</li>
            <li>Comunicação sobre o andamento de processos seletivos</li>
            <li>Cumprimento de obrigações legais e regulatórias</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Não utilizamos seus dados para fins de marketing, publicidade ou qualquer finalidade não relacionada a recrutamento e seleção.
          </p>
        </Section>

        <Section title="4. Com quem compartilhamos">
          <p>Seus dados podem ser compartilhados com:</p>
          <ul style={listStyle}>
            <li><strong>Empresas clientes da Salmazos:</strong> exclusivamente quando você for encaminhado como candidato a uma vaga específica desse cliente, para fins de análise e seleção</li>
            <li><strong>Prestadores de serviços tecnológicos:</strong> plataformas de hospedagem, armazenamento em nuvem e infraestrutura de TI, sob obrigação contratual de sigilo</li>
            <li><strong>Autoridades públicas:</strong> quando exigido por lei, ordem judicial ou regulamentação aplicável</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Não vendemos, cedemos ou comercializamos seus dados pessoais a terceiros.
          </p>
        </Section>

        <Section title="5. Base legal para o tratamento">
          <p>O tratamento dos seus dados pessoais é realizado com base nas seguintes hipóteses previstas no Art. 7º da LGPD:</p>
          <ul style={listStyle}>
            <li><strong>Consentimento (Art. 7º, I):</strong> dado expressamente por você ao marcar a caixa de consentimento no formulário de candidatura</li>
            <li><strong>Legítimo interesse (Art. 7º, IX):</strong> para gestão interna dos processos seletivos e segurança da plataforma</li>
            <li><strong>Cumprimento de obrigação legal (Art. 7º, II):</strong> quando necessário para atender exigências legais ou regulatórias</li>
          </ul>
        </Section>

        <Section title="6. Prazo de retenção">
          <p>
            Seus dados serão mantidos em nossa base pelo prazo de <strong>2 (dois) anos</strong> contados a partir do último processo seletivo em que você tenha participado ou da data do seu cadastro, o que ocorrer por último.
          </p>
          <p style={{ marginTop: 12 }}>
            Ao término desse prazo, seus dados serão anonimizados ou excluídos de forma segura, salvo obrigação legal que exija retenção por período maior.
          </p>
          <p style={{ marginTop: 12 }}>
            Você pode solicitar a exclusão antecipada dos seus dados a qualquer momento, conforme descrito na seção de Direitos do Titular.
          </p>
        </Section>

        <Section title="7. Seus direitos como titular">
          <p>Nos termos da LGPD, você tem direito a:</p>
          <ul style={listStyle}>
            <li><strong>Acesso:</strong> obter confirmação de que tratamos seus dados e solicitar cópia das informações armazenadas</li>
            <li><strong>Correção:</strong> solicitar a correção de dados incompletos, inexatos ou desatualizados</li>
            <li><strong>Exclusão:</strong> solicitar a eliminação dos seus dados pessoais de nossa base</li>
            <li><strong>Revogação do consentimento:</strong> retirar o consentimento a qualquer momento, sem prejuízo da licitude do tratamento realizado antes da revogação</li>
            <li><strong>Portabilidade:</strong> solicitar a transferência dos seus dados a outro fornecedor de serviço</li>
            <li><strong>Oposição:</strong> opor-se a tratamentos realizados com base em legítimo interesse</li>
            <li><strong>Informação:</strong> ser informado sobre as entidades com as quais seus dados foram compartilhados</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Para exercer qualquer um desses direitos, envie um e-mail para <a href="mailto:privacidade@salmazos.com.br" style={linkStyle}>privacidade@salmazos.com.br</a> com o assunto "Direitos LGPD" e identificação completa. Responderemos em até 15 dias úteis.
          </p>
        </Section>

        <Section title="8. Segurança dos dados">
          <p>
            Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais contra acesso não autorizado, perda, alteração ou divulgação indevida, incluindo criptografia em trânsito (TLS/HTTPS), controle de acesso por função e autenticação segura.
          </p>
        </Section>

        <Section title="9. Cookies e dados de navegação">
          <p>
            Nossa plataforma pública de candidatura não utiliza cookies de rastreamento de terceiros. Podemos utilizar dados de sessão estritamente necessários para o funcionamento do formulário.
          </p>
        </Section>

        <Section title="10. Contato e DPO">
          <p>
            Nosso Encarregado pelo Tratamento de Dados Pessoais (DPO) está disponível para atender suas solicitações e esclarecer dúvidas sobre esta política:
          </p>
          <div style={{ marginTop: 16, padding: "16px 20px", background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#111827" }}>Salmazos RH & Serviços</p>
            <p style={{ margin: "4px 0 0", color: "#374151" }}>
              E-mail DPO: <a href="mailto:privacidade@salmazos.com.br" style={linkStyle}>privacidade@salmazos.com.br</a>
            </p>
          </div>
        </Section>

        <Section title="11. Alterações a esta política">
          <p>
            Esta Política de Privacidade pode ser atualizada periodicamente. Em caso de alterações relevantes, notificaremos os candidatos cadastrados por e-mail. Recomendamos que você consulte esta página regularmente.
          </p>
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #E5E7EB", textAlign: "center" }}>
          <Link
            href="/vagas"
            style={{
              display: "inline-block",
              padding: "12px 32px",
              background: "#111827",
              color: "#FFD700",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            ← Voltar às vagas
          </Link>
          <p style={{ marginTop: 16, fontSize: 12, color: "#9CA3AF" }}>
            © {new Date().getFullYear()} Salmazos RH & Serviços. Todos os direitos reservados.
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid #FEF3C7" }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: "#374151", lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

const linkStyle: React.CSSProperties = {
  color: "#534AB7",
  textDecoration: "underline",
  fontWeight: 500,
};

const listStyle: React.CSSProperties = {
  paddingLeft: 24,
  marginTop: 8,
  lineHeight: 2,
};
