import Link from "next/link";

export default function ObrigadoPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-800 mb-3">
          Candidatura enviada!
        </h1>
        <p className="text-gray-500 text-base leading-relaxed mb-2">
          Recebemos seu cadastro com sucesso. Verifique seu e-mail — enviamos
          uma confirmação com os próximos passos.
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Nossa equipe analisará seu perfil e entrará em contato em breve.
        </p>

        <div className="bg-[#FFB800]/10 border border-[#FFB800]/30 rounded-xl p-5 text-left mb-8">
          <p className="font-semibold text-black text-sm mb-2">
            O que acontece agora?
          </p>
          <ul className="text-sm text-gray-700 space-y-1.5">
            <li>✅ Seu currículo foi adicionado ao nosso banco de talentos</li>
            <li>📧 Você receberá um e-mail de confirmação</li>
            <li>📞 Nosso time entrará em contato quando houver uma vaga</li>
          </ul>
        </div>

        <Link
          href="/"
          className="text-[#FFB800] hover:text-black text-sm font-medium underline-offset-2 hover:underline transition-colors"
        >
          Voltar à página inicial
        </Link>

        <p className="text-gray-300 text-xs mt-8">
          Salmazos RH &amp; Serviços
        </p>
      </div>
    </div>
  );
}
