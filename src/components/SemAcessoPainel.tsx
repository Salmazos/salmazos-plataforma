// Mostrado no lugar do 404 quando quem está logado não tem perfil de analista com unidade
// (ex: login criado sem perfil, ou login de cliente do Portal entrando pelo painel). O 404
// fazia parecer que o painel tinha saído do ar.
export default function SemAcessoPainel() {
  return (
    <div className="max-w-lg mx-auto mt-16 bg-white rounded-2xl shadow-sm p-8 text-center">
      <p className="text-4xl mb-3">🔒</p>
      <h1 className="text-lg font-bold text-gray-900 mb-2">Seu usuário não tem acesso ao painel</h1>
      <p className="text-sm text-gray-600">
        Este login não está configurado como usuário da equipe Salmazos (sem perfil ou sem
        unidade vinculada). Fale com o administrador da plataforma para liberar o acesso.
      </p>
      <p className="text-xs text-gray-400 mt-4">
        Se você é cliente, acesse pelo Portal do Cliente em <strong>/portal</strong>.
      </p>
    </div>
  );
}
