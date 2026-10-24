import Link from "next/link";
import { MARCA } from "./marca";

// Faixa de confiança: só fatos que já existem no projeto (ver marca.ts). Amarelo da marca com texto preto (contraste AA).
export function FaixaConfianca() {
  const itens = [
    { titulo: MARCA.desde, texto: "de recrutamento e seleção" },
    { titulo: "Atendimento regional", texto: MARCA.cidades },
    { titulo: "Captação ampla", texto: MARCA.canais },
  ];
  return (
    <section aria-label="Por que a Salmazos" className="bg-[#FFD700] text-black">
      <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-3 md:px-8">
        {itens.map((item) => (
          <li key={item.titulo} className="flex items-start gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <div>
              <p className="text-base font-extrabold leading-tight">{item.titulo}</p>
              <p className="text-sm font-medium">{item.texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Icone({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black text-[#FFD700]">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

export function ComoFunciona({ prazoDiasUteis }: { prazoDiasUteis: number | null }) {
  const prazo = prazoDiasUteis ?? 8;
  const passos = [
    {
      titulo: "Você conta a vaga",
      texto: "Preenche os dados da empresa e do cargo em poucos minutos, direto pelo celular.",
      icone: (
        <>
          <path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" />
          <path d="M8 6H6a1 1 0 00-1 1v13a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2" />
          <path d="M9 12h6M9 16h4" />
        </>
      ),
    },
    {
      titulo: "Nós analisamos e publicamos",
      texto: "Nossa equipe revisa a solicitação e divulga a vaga nos canais de captação.",
      icone: (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.2-4.2" />
        </>
      ),
    },
    {
      titulo: `Você recebe os currículos em até ${prazo} dias úteis`,
      texto: "Enviamos os candidatos que combinam com o perfil que você pediu.",
      icone: (
        <>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 5.5a3 3 0 010 5.6M18 14.5c1.8.8 3 2.6 3 5.5" />
        </>
      ),
    },
  ];
  return (
    <section aria-labelledby="como-funciona" className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <h2 id="como-funciona" className="mb-6 text-2xl font-extrabold text-gray-900">Como funciona</h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {passos.map((p, i) => (
          <li key={p.titulo} className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <Icone>{p.icone}</Icone>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Passo {i + 1}</p>
              <h3 className="text-base font-bold leading-snug text-gray-900">{p.titulo}</h3>
              <p className="mt-1 text-sm text-gray-700">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RodapePublico() {
  return (
    <footer className="bg-black px-4 py-8 text-center text-sm text-gray-300">
      <p className="font-semibold text-white">{MARCA.nome}</p>
      <p className="mx-auto mt-2 max-w-xl">
        Usamos os dados informados somente para o atendimento desta solicitação.{" "}
        <Link href="/politica-de-privacidade" className="font-semibold text-[#FFD700] underline underline-offset-2">
          Política de privacidade
        </Link>
      </p>
    </footer>
  );
}
