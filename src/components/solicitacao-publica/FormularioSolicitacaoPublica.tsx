"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ItemProposta } from "@/lib/propostaModelos";
import {
  TITULOS_ETAPA, formularioInicial, formularioPreenchido, montarCorpoEnvio, validarEtapa, validarTudo,
  type Etapa, type ErrosForm, type FormPublico,
} from "@/lib/solicitacaoVagaPublicaForm";
import { ComoFunciona, FaixaConfianca, RodapePublico } from "./BlocosInformativos";
import EtapaContratante from "./EtapaContratante";
import EtapaEnvio from "./EtapaEnvio";
import EtapaPerfil from "./EtapaPerfil";
import EtapaVaga from "./EtapaVaga";
import Hero from "./Hero";
import TelaLinkIndisponivel from "./TelaLinkIndisponivel";
import TelaSucesso from "./TelaSucesso";

interface DadosLink {
  nome_empresa: string | null;
  itens: ItemProposta[];
  prazoDiasUteis: number;
}

type Fase = "carregando" | "indisponivel" | "formulario" | "enviado";

const ETAPAS: Etapa[] = [1, 2, 3, 4];

// Animações curtas da tela de sucesso; desligadas para quem pede menos movimento.
const ESTILOS = `
@keyframes sp-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes sp-draw{to{stroke-dashoffset:0}}
@keyframes sp-subir{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.sp-pop{animation:sp-pop .5s ease-out both}
.sp-draw{stroke-dasharray:48;stroke-dashoffset:48;animation:sp-draw .5s .35s ease-out forwards}
.sp-subir{animation:sp-subir .5s ease-out both}
@media (prefers-reduced-motion:reduce){.sp-pop,.sp-subir{animation:none!important}.sp-draw{animation:none!important;stroke-dashoffset:0}}
`;

function reduzMovimento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export default function FormularioSolicitacaoPublica({ token }: { token: string }) {
  const [fase, setFase] = useState<Fase>("carregando");
  const [dados, setDados] = useState<DadosLink | null>(null);
  const [form, setForm] = useState<FormPublico>(() => formularioInicial(null));
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [erros, setErros] = useState<ErrosForm>({});
  const [enviando, setEnviando] = useState(false);
  // O estado só muda no próximo render: o ref fecha a janela de um duplo clique ou Enter repetido gerar dois POSTs.
  const enviandoRef = useRef(false);
  const [erroEnvio, setErroEnvio] = useState("");
  const tituloEtapa = useRef<HTMLHeadingElement>(null);
  const primeiraRenderizacao = useRef(true);

  // Estado só em memória (nada de localStorage): fechar a página descarta o que foi digitado.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/solicitacao-vaga-publica/${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelado) setFase("indisponivel");
          return;
        }
        const json = await res.json();
        if (cancelado) return;
        const d = json.data;
        setDados({
          nome_empresa: d.nome_empresa ?? null,
          itens: d.itens ?? [],
          prazoDiasUteis: d.condicoes?.prazo_envio_curriculos_dias_uteis ?? 8,
        });
        // A empresa do link pré-preenche o nome (o cliente pode corrigir).
        setForm(formularioInicial(d.nome_empresa ?? null));
        setFase("formulario");
      } catch {
        if (!cancelado) setFase("indisponivel");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token]);

  // Avisa antes de sair se há dados preenchidos.
  const preenchido = useMemo(() => fase === "formulario" && formularioPreenchido(form, dados?.nome_empresa), [fase, form, dados]);
  useEffect(() => {
    if (!preenchido) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [preenchido]);

  // Ao mudar de etapa, o título da nova etapa recebe o foco (leitor de tela anuncia e o teclado continua dali).
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    const titulo = tituloEtapa.current;
    if (!titulo) return;
    titulo.focus({ preventScroll: true });
    titulo.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "start" });
  }, [etapa]);

  const atualizar = useCallback(<K extends keyof FormPublico>(campo: K, valor: FormPublico[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => {
      if (!(campo in e)) return e;
      const resto = { ...e };
      delete resto[campo as string];
      return resto;
    });
  }, []);

  function focarPrimeiroErro(e: ErrosForm) {
    const primeiro = Object.keys(e)[0];
    if (!primeiro) return;
    // Espera o React pintar as mensagens de erro antes de mover o foco.
    setTimeout(() => (document.getElementById(`campo-${primeiro}`) as HTMLElement | null)?.focus(), 0);
  }

  function continuar() {
    const e = validarEtapa(etapa, form);
    setErros(e);
    if (Object.keys(e).length > 0) {
      focarPrimeiroErro(e);
      return;
    }
    setEtapa((etapa + 1) as Etapa);
  }

  function voltar() {
    if (etapa > 1) {
      setErros({});
      setEtapa((etapa - 1) as Etapa);
    }
  }

  async function enviar() {
    if (enviandoRef.current) return;
    setErroEnvio("");
    const problema = validarTudo(form);
    if (problema) {
      setEtapa(problema.etapa);
      setErros(problema.erros);
      focarPrimeiroErro(problema.erros);
      return;
    }
    enviandoRef.current = true;
    setEnviando(true);
    try {
      const res = await fetch(`/api/solicitacao-vaga-publica/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(montarCorpoEnvio(form)),
      });
      if (res.status === 201 || res.ok) {
        setFase("enviado");
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.status === 404 || res.status === 410) {
        setFase("indisponivel");
        return;
      }
      if (res.status === 429) {
        setErroEnvio("Recebemos muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.");
        return;
      }
      const json = await res.json().catch(() => null);
      setErroEnvio(
        res.status === 400 && json?.error
          ? `Confira os dados: ${json.error}`
          : "Não conseguimos enviar agora. Tente novamente em instantes."
      );
    } catch {
      setErroEnvio("Sem conexão no momento. Confira a internet e tente de novo; o que você preencheu continua aqui.");
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  if (fase === "indisponivel") return <TelaLinkIndisponivel />;
  if (fase === "enviado") {
    return (
      <>
        <style>{ESTILOS}</style>
        <TelaSucesso prazoDiasUteis={dados?.prazoDiasUteis ?? 8} />
      </>
    );
  }

  const quantidadeErros = Object.keys(erros).length;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <style>{ESTILOS}</style>
      <Hero nomeEmpresa={dados?.nome_empresa ?? null} carregando={fase === "carregando"} />
      <FaixaConfianca />
      <ComoFunciona prazoDiasUteis={dados?.prazoDiasUteis ?? null} />

      <section id="formulario" aria-labelledby="titulo-formulario" className="scroll-mt-0 pb-12">
        {fase === "carregando" ? (
          <p role="status" className="px-4 py-16 text-center text-base text-gray-700">Carregando o formulário…</p>
        ) : (
          <>
            {/* Progresso fixo no topo enquanto o formulário está na tela */}
            <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
              <div className="mx-auto max-w-2xl px-4 py-3">
                <ol className="flex gap-1.5" aria-label="Etapas do formulário">
                  {ETAPAS.map((n) => (
                    <li
                      key={n}
                      aria-current={n === etapa ? "step" : undefined}
                      className={`h-2 flex-1 rounded-full ${n < etapa ? "bg-black" : n === etapa ? "bg-[#FFB800] ring-1 ring-black" : "bg-gray-200"}`}
                    >
                      <span className="sr-only">Etapa {n}: {TITULOS_ETAPA[n]}{n < etapa ? " (concluída)" : n === etapa ? " (etapa atual)" : ""}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-sm font-bold text-gray-900">
                  Etapa {etapa} de 4 <span aria-hidden="true">·</span> <span className="font-semibold text-gray-700">{TITULOS_ETAPA[etapa]}</span>
                </p>
              </div>
            </div>
            <div className="sr-only" aria-live="polite" role="status">Etapa {etapa} de 4: {TITULOS_ETAPA[etapa]}</div>

            <div className="mx-auto mt-6 max-w-2xl px-4">
              <h2 id="titulo-formulario" className="sr-only">Formulário de solicitação de vaga</h2>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (etapa === 4) enviar();
                  else continuar();
                }}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8"
              >
                <h3 ref={tituloEtapa} tabIndex={-1} className="mb-5 scroll-mt-24 text-2xl font-extrabold text-gray-900 outline-none">
                  {TITULOS_ETAPA[etapa]}
                </h3>

                {quantidadeErros > 0 && (
                  <div role="alert" className="mb-5 rounded-xl border-2 border-red-600 bg-red-50 p-4 text-sm font-semibold text-red-800">
                    {quantidadeErros === 1 ? "Há 1 campo para corrigir abaixo." : `Há ${quantidadeErros} campos para corrigir abaixo.`}
                  </div>
                )}

                {etapa === 1 && <EtapaContratante form={form} atualizar={atualizar} erros={erros} />}
                {etapa === 2 && <EtapaVaga form={form} atualizar={atualizar} erros={erros} />}
                {etapa === 3 && <EtapaPerfil form={form} atualizar={atualizar} erros={erros} />}
                {etapa === 4 && (
                  <EtapaEnvio
                    form={form}
                    itens={dados?.itens ?? []}
                    aceite={form.aceite}
                    onAceite={(v) => atualizar("aceite", v)}
                    erroAceite={erros.aceite}
                  />
                )}

                {/* Honeypot: fora da tela (NÃO display:none, que os robôs ignoram), fora da ordem de tabulação, escondido de leitor de tela
                    e com autocomplete desligado (inclusive para gerenciadores de senha), para o preenchimento automático do navegador não
                    disparar falso positivo e descartar um cliente de verdade. */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                  <label>
                    Site
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      value={form.website}
                      onChange={(e) => atualizar("website", e.target.value)}
                    />
                  </label>
                </div>

                {erroEnvio && (
                  <div role="alert" className="mt-5 rounded-xl border-2 border-red-600 bg-red-50 p-4 text-sm font-semibold text-red-800">
                    {erroEnvio}
                  </div>
                )}

                <div className="mt-8 grid grid-cols-2 gap-3">
                  {etapa > 1 ? (
                    <button
                      type="button"
                      onClick={voltar}
                      disabled={enviando}
                      className="min-h-[52px] rounded-xl border-2 border-black bg-white px-4 text-base font-bold text-black hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-50"
                    >
                      Voltar
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="submit"
                    disabled={enviando}
                    className="min-h-[52px] rounded-xl bg-black px-4 text-base font-bold text-[#FFD700] hover:bg-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-60"
                  >
                    {etapa === 4 ? (enviando ? "Enviando…" : "Enviar solicitação") : "Continuar"}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </section>

      <RodapePublico />
    </div>
  );
}
