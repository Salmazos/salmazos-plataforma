// Função (cargo) que o candidato vê na admissão: tela do link, mensagem de WhatsApp e e-mail do link.
// Ordem: a função da própria admissão (admissoes.funcao, o que o RH informou ao iniciar) → o título da vaga → o cargo_pretendido do candidato.
// cargo_pretendido fica por último de propósito: no cadastro rápido ele guarda só a ÁREA ("Operacional", "Administrativo"...), então nunca deve
// aparecer quando existe função ou título. Texto vazio ou só com espaços não conta.
const preenchido = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export function funcaoParaExibirNaAdmissao(o: { funcao?: string | null; vagaTitulo?: string | null; cargoPretendido?: string | null }): string {
  return preenchido(o.funcao) ?? preenchido(o.vagaTitulo) ?? preenchido(o.cargoPretendido) ?? "";
}
