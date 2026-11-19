"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar, Pie } from "react-chartjs-2";
import { limitarCargos, LIMITE_POUCOS_ATIVOS, MAX_CARGOS_NO_GRAFICO, NOMES_DOS_MESES, type ClienteOpcao, type FaixaEtaria, type GestaoPessoas, type GestaoPessoasPortal } from "@/lib/gestaoPessoas";
import {
  alternarFiltros, CARGO_DEMAIS, ESCOLARIDADE_NAO_INFORMADO, LIMPAR, ROTULO_SEXO, temFiltroAtivo, type DimensaoFiltro, type FiltrosGestao, type LinhaListaPortal, type LinhaListaRH, type SexoFiltro,
} from "@/lib/gestaoPessoasLista";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const COR_MASCULINO = "#111827";
const COR_FEMININO = "#FFB800";
const COR_NAO_INFORMADO = "#D1D5DB";
const COR_BARRA = "#7F77DD";

// "rh": painel interno (escolhe a empresa, avisos de uso interno, exporta a lista). "portal": o cliente vendo só a própria empresa, sem texto interno do RH.
export type ModoGestaoPessoas = "rh" | "portal";

// Textos que mudam por modo. O RH mantém exatamente os de sempre; o portal troca "Não informado" por "Dado não cadastrado" (não expõe um problema nosso)
// e nunca mostra os avisos internos (poucas pessoas, cadastro inconsistente, escolha de empresa).
const TEXTOS = {
  rh: { naoInformado: "Não informado", colunaNaoInformado: "N/I", semAtivos: null, semEmpresa: null, semDadoNenhum: null, notaLegado: null },
  portal: {
    naoInformado: "Dado não cadastrado",
    colunaNaoInformado: "Sem dado",
    semAtivos: "Sua empresa não tem funcionários ativos no momento.",
    semEmpresa: "Sua empresa não tem funcionários ativos no momento.",
    semDadoNenhum: "Dados ainda não cadastrados para esta empresa",
    notaLegado: "Alguns funcionários ainda não têm este dado no cadastro.",
  },
} as const;

interface Props {
  clientes: ClienteOpcao[];
  selecionadoId: string | null;
  // No portal o objeto vem sem o id do cliente (só o nome).
  dados: GestaoPessoas | GestaoPessoasPortal | null;
  modo?: ModoGestaoPessoas;
  // Posição (0 a 11) do mês aberto nos aniversariantes; 0 = o mês corrente, que é o padrão. A página troca a `key` do componente ao mudar de empresa, então
  // trocar a empresa sempre volta para o mês corrente (e limpa os filtros).
  indiceMesInicial?: number;
}

const ESTILO = `
.gp-btn{cursor:pointer}
.gp-btn:hover{background:#F9FAFB}
.gp-btn:focus-visible{outline:3px solid #2563EB;outline-offset:2px}
.gp-btn[aria-pressed="true"]{box-shadow:0 0 0 2px #111827}
.gp-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #D1D5DB;border-radius:999px;background:#fff;padding:3px 10px;font-size:12px;color:#111827}
.gp-chip[aria-pressed="true"]{background:#111827;color:#fff;border-color:#111827}
.card.gp-cartao{background:#f1f5f9;border:1px solid #cbd5e1;padding:0}
.card.gp-cartao:hover{background:#e2e8f0}
.card.gp-cartao[data-pressionado="true"]{border-color:#111827;box-shadow:0 0 0 2px #111827}
.gp-cartao-btn{cursor:pointer}
.gp-cartao-btn:focus-visible{outline:3px solid #2563EB;outline-offset:-3px}
.gp-celula{border:0;background:transparent;padding:4px 6px;font:inherit;color:inherit;border-radius:4px}
.gp-celula[aria-pressed="true"]{background:#111827;color:#fff}
`;

const par = <D extends DimensaoFiltro>(d: D, v: FiltrosGestao[D]) => [d, v] as [DimensaoFiltro, FiltrosGestao[DimensaoFiltro]];
const esmaecer = (cor: string, destacado: boolean, haFiltro: boolean) => (!haFiltro || destacado ? cor : `${cor}55`);

function Cartao({ titulo, valor, detalhe, controle, onClick, pressionado, dica }: { titulo: string; valor: string; detalhe?: string; controle?: React.ReactNode; onClick?: () => void; pressionado?: boolean; dica?: string }) {
  const conteudo = (
    <>
      <span style={{ display: "block", fontSize: 28, fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1.1 }}>{valor}</span>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", margin: "4px 0 0" }}>{titulo}</span>
      {detalhe && <span style={{ display: "block", fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{detalhe}</span>}
    </>
  );
  return (
    // Cartão clicável: fundo cinza-azulado claro e borda fina (indica que é botão), mais escuro no hover; selecionado = borda escura com o mesmo fundo.
    // O botão ocupa o cartão todo; o seletor de mês (controle) fica FORA do botão, então mexer nele não dispara o clique do cartão.
    <div className={onClick ? "card gp-cartao" : "card"} data-pressionado={onClick ? String(!!pressionado) : undefined} style={onClick ? undefined : { padding: "14px 16px" }}>
      {onClick ? (
        <button type="button" className="gp-cartao-btn" onClick={onClick} aria-pressed={pressionado} title={dica} style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: controle ? "14px 16px 0" : "14px 16px", borderRadius: "inherit" }}>
          {conteudo}
        </button>
      ) : <div>{conteudo}</div>}
      {controle && <div style={{ padding: onClick ? "10px 16px 14px" : undefined, marginTop: onClick ? 0 : 10 }}>{controle}</div>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>{titulo}</h2>
      {children}
    </section>
  );
}

const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : "0%");

type ListaCarregada = { total: number; linhas: (LinhaListaRH | LinhaListaPortal)[] };

export default function GestaoPessoasClient({ clientes, selecionadoId, dados, modo = "rh", indiceMesInicial = 0 }: Props) {
  const router = useRouter();
  const portal = modo === "portal";
  const T = TEXTOS[modo];
  const [indiceMes, setIndiceMes] = useState(indiceMesInicial);
  const [filtros, setFiltros] = useState<FiltrosGestao>(LIMPAR);
  const [lista, setLista] = useState<ListaCarregada | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [erroExportar, setErroExportar] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const listaRef = useRef<HTMLElement | null>(null);
  const rolarAoCarregar = useRef(false);
  const requisicao = useRef(0);

  const temDados = !!dados && dados.totalAtivos > 0;
  // Os gráficos mostram sempre o total da empresa; só a lista embaixo muda com os filtros. O navegador manda SÓ os filtros (no RH, também a empresa escolhida,
  // que o servidor valida contra a unidade; no portal a empresa vem da sessão, nunca daqui).
  const corpo = useCallback(() => (portal ? { filtros } : { clienteId: selecionadoId, filtros }), [portal, selecionadoId, filtros]);
  const urlLista = portal ? "/api/portal/gestao-pessoas/lista" : "/api/gestao-pessoas/lista";

  useEffect(() => {
    if (!temDados) return;
    const minha = ++requisicao.current;
    setCarregando(true);
    setErroLista(null);
    fetch(urlLista, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo()) })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as ListaCarregada;
      })
      .then((j) => {
        if (minha !== requisicao.current) return; // resposta de um clique antigo
        setLista(j);
        setCarregando(false);
        setAnuncio(`${descreverFiltrosParaVoz()} ${j.total} ${j.total === 1 ? "pessoa" : "pessoas"}.`);
        if (rolarAoCarregar.current) {
          rolarAoCarregar.current = false;
          if (typeof window !== "undefined" && window.innerWidth < 768) listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      })
      .catch(() => {
        if (minha !== requisicao.current) return;
        setCarregando(false);
        setErroLista("Não foi possível carregar a lista. Tente de novo.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temDados, urlLista, JSON.stringify(corpo())]);

  const aplicar = (...pares: [DimensaoFiltro, FiltrosGestao[DimensaoFiltro]][]) => { rolarAoCarregar.current = true; setFiltros((f) => alternarFiltros(f, pares)); };
  const limpar = () => { rolarAoCarregar.current = true; setFiltros(LIMPAR); };
  const escolherMes = (i: number) => { setIndiceMes(i); setFiltros((f) => (f.aniversario !== undefined ? { ...f, aniversario: i } : f)); };

  // A empresa escolhida pode não estar na lista (cliente sem ativo): ela é incluída para o seletor não ficar em branco.
  const idCliente = dados && "id" in dados.cliente ? dados.cliente.id : null;
  const opcoes = dados && idCliente && !clientes.some((c) => c.id === idCliente) ? [...clientes, { id: idCliente, nome: dados.cliente.nome }] : clientes;

  const seletor = (
    <select
      value={selecionadoId ?? ""}
      onChange={(e) => router.push(e.target.value ? `/painel/gestao-pessoas?cliente=${e.target.value}` : "/painel/gestao-pessoas")}
      className="input-field"
      style={{ maxWidth: 360, width: "100%" }}
      aria-label="Empresa"
    >
      <option value="">Escolha uma empresa…</option>
      {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
  );

  const cabecalho = portal ? (
    <div style={{ marginBottom: 16 }}>
      <h1 className="text-xl font-bold text-gray-900" style={{ marginBottom: dados ? 2 : 0 }}>Gestão de Pessoas</h1>
      {dados && <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>{dados.cliente.nome}</p>}
    </div>
  ) : (
    <div style={{ marginBottom: 16 }}>
      <h1 className="text-xl font-bold text-gray-900" style={{ marginBottom: 12 }}>Gestão de Pessoas</h1>
      {seletor}
    </div>
  );

  if (!dados) {
    return (
      <div>
        {cabecalho}
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
          {T.semEmpresa ?? (clientes.length === 0 ? "Nenhuma empresa com funcionários ativos." : "Escolha uma empresa para ver as pessoas dela: ativos, aniversariantes do mês, sexo, faixa etária, escolaridade e cargos.")}
        </div>
      </div>
    );
  }

  if (dados.totalAtivos === 0) {
    return (
      <div>
        {cabecalho}
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
          {T.semAtivos ?? <>{dados.cliente.nome} não tem funcionários ativos no momento.</>}
        </div>
      </div>
    );
  }

  const { porSexo, faixaPorSexo, escolaridade, totalAtivos } = dados;
  const mesesAniversario = dados.aniversariantesPorMes;
  const mesEscolhido = mesesAniversario[indiceMes] ?? mesesAniversario[0];
  const nAniversariantes = mesEscolhido?.aniversariantes.length ?? 0;
  const cargos = limitarCargos(dados.cargos, MAX_CARGOS_NO_GRAFICO);
  const chaveDaBarraDeCargo = (rotulo: string) => (rotulo.startsWith("Demais cargos (") ? CARGO_DEMAIS : rotulo);
  // Portal: sem barra/linha de "dado não cadastrado" quando for 0; nota quando houver legado; e o gráfico some (vira aviso) se NINGUÉM tem o dado.
  const idadeNaoInformada = faixaPorSexo.find((f) => f.faixa === "nao_informada");
  const faixasMostradas = faixaPorSexo.filter((f) => !(portal && f.faixa === "nao_informada" && f.total === 0));
  const escolaridadeMostrada = escolaridade.filter((e) => !(portal && e.naoInformado && e.total === 0));
  const semSexo = portal && porSexo.masculino + porSexo.feminino === 0;
  const semFaixa = portal && faixaPorSexo.every((f) => f.faixa === "nao_informada" || f.total === 0);
  const semEscolaridade = portal && escolaridade.every((e) => e.naoInformado || e.total === 0);
  const mostrarColunaNI = !portal || porSexo.naoInformado > 0;
  const nota = (texto: string | null) => (texto ? <p style={{ fontSize: 12, color: "#9CA3AF", margin: "10px 0 0" }}>{texto}</p> : null);
  const semDado = <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>{T.semDadoNenhum}</p>;
  const itensSexo = ([
    ["masculino", "Masculino", porSexo.masculino, COR_MASCULINO], ["feminino", "Feminino", porSexo.feminino, COR_FEMININO], ["naoInformado", T.naoInformado, porSexo.naoInformado, COR_NAO_INFORMADO],
  ] as [SexoFiltro, string, number, string][]).filter(([chave, , n]) => !(portal && chave === "naoInformado" && n === 0));
  const nomeDoMes = NOMES_DOS_MESES[dados.mesDeReferencia - 1] ?? "";
  const haFiltro = temFiltroAtivo(filtros);
  const haFiltroDeSexoOuFaixa = filtros.sexo !== undefined || filtros.faixa !== undefined;
  const segmentoAtivo = (faixa: FaixaEtaria, sexo: SexoFiltro) => (filtros.faixa === undefined || filtros.faixa === faixa) && (filtros.sexo === undefined || filtros.sexo === sexo);
  const rotuloEscolaridade = (grau: string) => (grau === ESCOLARIDADE_NAO_INFORMADO ? T.naoInformado : escolaridade.find((e) => e.grau === grau)?.rotulo ?? grau);
  const cursor = (e: { native?: Event | null }, els: unknown[]) => { const alvo = e.native?.target as HTMLElement | undefined; if (alvo) alvo.style.cursor = els.length ? "pointer" : "default"; };
  const opcoesBarraHorizontal = (aoClicar: (indice: number) => void) => ({
    indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    onClick: (_e: unknown, els: { index: number }[]) => { if (els.length) aoClicar(els[0].index); }, onHover: cursor,
  });

  // Etiquetas dos filtros ativos (texto na tela e para o leitor de tela). O remover reaproveita o próprio alternar.
  const etiquetas: { chave: string; texto: string; remover: () => void }[] = [];
  if (filtros.sexo) etiquetas.push({ chave: "sexo", texto: `Sexo: ${filtros.sexo === "naoInformado" ? T.naoInformado : ROTULO_SEXO[filtros.sexo]}`, remover: () => aplicar(par("sexo", filtros.sexo)) });
  if (filtros.faixa) etiquetas.push({ chave: "faixa", texto: `Faixa: ${faixaPorSexo.find((f) => f.faixa === filtros.faixa)?.rotulo ?? filtros.faixa}`, remover: () => aplicar(par("faixa", filtros.faixa)) });
  if (filtros.escolaridade) etiquetas.push({ chave: "escolaridade", texto: `Escolaridade: ${rotuloEscolaridade(filtros.escolaridade)}`, remover: () => aplicar(par("escolaridade", filtros.escolaridade)) });
  if (filtros.cargo) etiquetas.push({ chave: "cargo", texto: `Cargo: ${filtros.cargo === CARGO_DEMAIS ? (cargos.find((c) => c.cargo.startsWith("Demais cargos ("))?.cargo ?? "Demais cargos") : filtros.cargo}`, remover: () => aplicar(par("cargo", filtros.cargo)) });
  if (filtros.admitidoNoMes) etiquetas.push({ chave: "admitido", texto: "Admitidos no mês", remover: () => aplicar(par("admitidoNoMes", true)) });
  if (filtros.aniversario !== undefined) etiquetas.push({ chave: "aniversario", texto: `Aniversariantes de ${mesEscolhido?.rotulo ?? nomeDoMes}`, remover: () => aplicar(par("aniversario", filtros.aniversario)) });
  if (filtros.ordenarPorTempoDeCasa) etiquetas.push({ chave: "ordem", texto: "Ordenado por tempo de casa (maior primeiro)", remover: () => aplicar(par("ordenarPorTempoDeCasa", true)) });
  function descreverFiltrosParaVoz() {
    return etiquetas.length === 0 ? "Sem filtros." : `Filtro aplicado: ${etiquetas.map((e) => e.texto).join(", ")}.`;
  }

  const comAniversario = filtros.aniversario !== undefined;
  const totalLista = lista?.total ?? null;

  async function exportar() {
    setExportando(true);
    setErroExportar(null);
    try {
      const r = await fetch("/api/gestao-pessoas/exportar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clienteId: selecionadoId, filtros }) });
      if (!r.ok) throw new Error(String(r.status));
      const nomeArquivo = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "gestao-pessoas.csv";
      const url = URL.createObjectURL(await r.blob()); // blob: preserva o BOM UTF-8 do arquivo
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErroExportar("Não foi possível exportar a lista. Tente de novo.");
    } finally {
      setExportando(false);
    }
  }

  const th = { padding: "6px 8px", fontWeight: 600, textAlign: "left" as const, color: "#6B7280", whiteSpace: "nowrap" as const };
  const td = { padding: "6px 8px", verticalAlign: "top" as const };

  return (
    <div>
      <style>{ESTILO}</style>
      {cabecalho}
      <div role="status" aria-live="polite" className="sr-only">{anuncio}</div>

      {!portal && dados.poucosAtivos && (
        <div role="note" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          Agregado de poucas pessoas, uso interno do RH ({totalAtivos} {totalAtivos === 1 ? "ativo" : "ativos"}; menos de {LIMITE_POUCOS_ATIVOS}).
        </div>
      )}
      {!portal && dados.dadosInconsistentes > 0 && (
        <div role="note" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          {dados.dadosInconsistentes} {dados.dadosInconsistentes === 1 ? "cadastro com data de nascimento inconsistente" : "cadastros com data de nascimento inconsistente"} (idade fora de 14 a 90 anos): contado em &quot;Idade não informada&quot;. Corrija na admissão da pessoa.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Cartao titulo="Funcionários ativos" valor={String(totalAtivos)} detalhe={dados.cliente.nome} onClick={limpar} pressionado={!haFiltro} dica="Mostrar todos e limpar os filtros" />
        <Cartao titulo="Admitidos no mês" valor={String(dados.admitidosNoMes)} detalhe={nomeDoMes} onClick={() => aplicar(par("admitidoNoMes", true))} pressionado={!!filtros.admitidoNoMes} dica="Listar quem foi admitido neste mês" />
        <Cartao
          titulo="Tempo médio de casa"
          valor={dados.tempoMedioDeCasaMeses === null ? "—" : `${String(dados.tempoMedioDeCasaMeses).replace(".", ",")} meses`}
          onClick={() => aplicar(par("ordenarPorTempoDeCasa", true))}
          pressionado={!!filtros.ordenarPorTempoDeCasa}
          dica="Ordenar a lista por tempo de casa, do maior para o menor"
        />
        <Cartao
          titulo={`Aniversariantes de ${mesEscolhido?.rotulo ?? nomeDoMes}`}
          valor={String(nAniversariantes)}
          detalhe={indiceMes === 0 ? "mês atual" : undefined}
          onClick={() => aplicar(par("aniversario", indiceMes))}
          pressionado={filtros.aniversario !== undefined}
          dica="Listar os aniversariantes do mês escolhido"
          controle={
            <>
              <label htmlFor="mes-aniversariantes" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Mês</label>
              <select id="mes-aniversariantes" value={indiceMes} onChange={(e) => escolherMes(Number(e.target.value))} className="input-field" style={{ width: "100%" }}>
                {mesesAniversario.map((m, i) => <option key={`${m.mes}-${m.ano}`} value={i}>{m.rotulo}</option>)}
              </select>
            </>
          }
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Secao titulo="Distribuição por sexo">
          {semSexo ? semDado : <>
          <div style={{ height: 220 }}>
            <Pie
              role="img"
              aria-label={`Distribuição por sexo: ${itensSexo.map(([, r, n]) => `${r} ${n}`).join(", ")}. Use a legenda abaixo para filtrar a lista.`}
              data={{
                labels: itensSexo.map(([, r]) => r),
                datasets: [{ data: itensSexo.map(([, , n]) => n), backgroundColor: itensSexo.map(([chave, , , c]) => esmaecer(c, filtros.sexo === chave, filtros.sexo !== undefined)), offset: itensSexo.map(([chave]) => (filtros.sexo === chave ? 12 : 0)) }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, onClick: (_e: unknown, els: { index: number }[]) => { if (els.length) aplicar(par("sexo", itensSexo[els[0].index][0])); }, onHover: cursor }}
            />
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", fontSize: 13, color: "#374151" }}>
            {itensSexo.map(([chave, rotulo, n, cor]) => (
              <li key={chave}>
                <button type="button" className="gp-btn" aria-pressed={filtros.sexo === chave} onClick={() => aplicar(par("sexo", chave))} style={{ display: "flex", justifyContent: "space-between", width: "100%", border: 0, background: "transparent", padding: "3px 4px", font: "inherit", color: "inherit", borderRadius: 4, opacity: filtros.sexo !== undefined && filtros.sexo !== chave ? 0.55 : 1 }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: cor, marginRight: 8 }} />{rotulo}</span>
                  <span>{n} ({pct(n, totalAtivos)})</span>
                </button>
              </li>
            ))}
          </ul>
          {portal && porSexo.naoInformado > 0 && nota(T.notaLegado)}
          </>}
        </Secao>

        <Secao titulo="Faixa etária por sexo">
          {semFaixa ? semDado : <>
          <div style={{ height: 240 }}>
            <Bar
              role="img"
              aria-label="Faixa etária por sexo. Use a tabela abaixo para filtrar a lista."
              data={{
                labels: faixasMostradas.map((f) => f.rotulo),
                datasets: [
                  { label: "Masculino", data: faixasMostradas.map((f) => f.masculino), backgroundColor: faixasMostradas.map((f) => esmaecer(COR_MASCULINO, segmentoAtivo(f.faixa, "masculino"), haFiltroDeSexoOuFaixa)) },
                  { label: "Feminino", data: faixasMostradas.map((f) => f.feminino), backgroundColor: faixasMostradas.map((f) => esmaecer(COR_FEMININO, segmentoAtivo(f.faixa, "feminino"), haFiltroDeSexoOuFaixa)) },
                  ...(mostrarColunaNI ? [{ label: T.naoInformado, data: faixasMostradas.map((f) => f.naoInformado), backgroundColor: faixasMostradas.map((f) => esmaecer(COR_NAO_INFORMADO, segmentoAtivo(f.faixa, "naoInformado"), haFiltroDeSexoOuFaixa)) }] : []),
                ],
              }}
              options={{
                responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
                onClick: (_e: unknown, els: { index: number; datasetIndex: number }[]) => { if (els.length) aplicar(par("faixa", faixasMostradas[els[0].index].faixa), par("sexo", (["masculino", "feminino", "naoInformado"] as SexoFiltro[])[els[0].datasetIndex])); },
                onHover: cursor,
              }}
            />
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#6B7280", textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Faixa</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600 }}>M</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600 }}>F</th>
                  {mostrarColunaNI && <th style={{ padding: "4px 6px", fontWeight: 600 }}>{T.colunaNaoInformado}</th>}
                  <th style={{ padding: "4px 6px", fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {faixasMostradas.map((f) => (
                  <tr key={f.faixa} style={{ textAlign: "right", borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ textAlign: "left", padding: "4px 6px", color: "#374151" }}>{f.rotulo}</td>
                    <td><button type="button" className="gp-btn gp-celula" aria-pressed={filtros.faixa === f.faixa && filtros.sexo === "masculino"} aria-label={`${f.rotulo}, masculino: ${f.masculino}`} onClick={() => aplicar(par("faixa", f.faixa), par("sexo", "masculino"))}>{f.masculino}</button></td>
                    <td><button type="button" className="gp-btn gp-celula" aria-pressed={filtros.faixa === f.faixa && filtros.sexo === "feminino"} aria-label={`${f.rotulo}, feminino: ${f.feminino}`} onClick={() => aplicar(par("faixa", f.faixa), par("sexo", "feminino"))}>{f.feminino}</button></td>
                    {mostrarColunaNI && <td style={{ color: "#9CA3AF" }}><button type="button" className="gp-btn gp-celula" aria-pressed={filtros.faixa === f.faixa && filtros.sexo === "naoInformado"} aria-label={`${f.rotulo}, ${T.naoInformado}: ${f.naoInformado}`} onClick={() => aplicar(par("faixa", f.faixa), par("sexo", "naoInformado"))}>{f.naoInformado}</button></td>}
                    <td style={{ fontWeight: 700 }}><button type="button" className="gp-btn gp-celula" aria-pressed={filtros.faixa === f.faixa && filtros.sexo === undefined} aria-label={`${f.rotulo}, total: ${f.total}`} onClick={() => aplicar(par("faixa", f.faixa))}>{f.total}</button></td>
                  </tr>
                ))}
                <tr style={{ textAlign: "right", borderTop: "2px solid #E5E7EB", fontWeight: 700 }}>
                  <td style={{ textAlign: "left", padding: "4px 6px" }}>Total</td>
                  <td><button type="button" className="gp-btn gp-celula" aria-pressed={filtros.sexo === "masculino" && filtros.faixa === undefined} aria-label={`Total masculino: ${porSexo.masculino}`} onClick={() => aplicar(par("sexo", "masculino"))}>{porSexo.masculino}</button></td>
                  <td><button type="button" className="gp-btn gp-celula" aria-pressed={filtros.sexo === "feminino" && filtros.faixa === undefined} aria-label={`Total feminino: ${porSexo.feminino}`} onClick={() => aplicar(par("sexo", "feminino"))}>{porSexo.feminino}</button></td>
                  {mostrarColunaNI && <td style={{ color: "#9CA3AF" }}><button type="button" className="gp-btn gp-celula" aria-pressed={filtros.sexo === "naoInformado" && filtros.faixa === undefined} aria-label={`Total ${T.naoInformado}: ${porSexo.naoInformado}`} onClick={() => aplicar(par("sexo", "naoInformado"))}>{porSexo.naoInformado}</button></td>}
                  <td style={{ padding: "4px 6px" }}>{totalAtivos}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {portal && ((idadeNaoInformada?.total ?? 0) > 0 || porSexo.naoInformado > 0) && nota(T.notaLegado)}
          </>}
        </Secao>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Secao titulo="Grau de escolaridade">
          {semEscolaridade ? semDado : <>
          <div style={{ height: 280 }}>
            <Bar
              role="img"
              aria-label="Grau de escolaridade. Use os botões abaixo para filtrar a lista."
              data={{
                labels: escolaridadeMostrada.map((e) => (e.naoInformado ? T.naoInformado : e.rotulo)),
                datasets: [{ data: escolaridadeMostrada.map((e) => e.total), backgroundColor: escolaridadeMostrada.map((e) => esmaecer(e.naoInformado ? COR_NAO_INFORMADO : COR_BARRA, filtros.escolaridade === e.grau, filtros.escolaridade !== undefined)), borderRadius: 4 }],
              }}
              options={opcoesBarraHorizontal((i) => aplicar(par("escolaridade", escolaridadeMostrada[i].grau)))}
            />
          </div>
          <div role="group" aria-label="Filtrar por escolaridade" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {escolaridadeMostrada.map((e) => (
              <button key={e.grau} type="button" className="gp-btn gp-chip" aria-pressed={filtros.escolaridade === e.grau} onClick={() => aplicar(par("escolaridade", e.grau))}>
                {e.naoInformado ? T.naoInformado : e.rotulo} <strong>{e.total}</strong>
              </button>
            ))}
          </div>
          {portal && escolaridade.some((e) => e.naoInformado && e.total > 0) && nota(T.notaLegado)}
          </>}
        </Secao>

        <Secao titulo="Cargos">
          <div style={{ height: Math.max(220, cargos.length * 28 + 40) }}>
            <Bar
              role="img"
              aria-label="Cargos. Use os botões abaixo para filtrar a lista."
              data={{ labels: cargos.map((c) => c.cargo), datasets: [{ data: cargos.map((c) => c.total), backgroundColor: cargos.map((c) => esmaecer(COR_BARRA, filtros.cargo === chaveDaBarraDeCargo(c.cargo), filtros.cargo !== undefined)), borderRadius: 4 }] }}
              options={opcoesBarraHorizontal((i) => aplicar(par("cargo", chaveDaBarraDeCargo(cargos[i].cargo))))}
            />
          </div>
          <div role="group" aria-label="Filtrar por cargo" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {cargos.map((c) => (
              <button key={c.cargo} type="button" className="gp-btn gp-chip" aria-pressed={filtros.cargo === chaveDaBarraDeCargo(c.cargo)} onClick={() => aplicar(par("cargo", chaveDaBarraDeCargo(c.cargo)))}>
                {c.cargo} <strong>{c.total}</strong>
              </button>
            ))}
          </div>
        </Secao>
      </div>

      <section className="card" style={{ padding: 16 }} ref={listaRef} aria-labelledby="gp-titulo-lista">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <h2 id="gp-titulo-lista" style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>
            Funcionários · {totalLista === null ? "…" : `${totalLista} ${totalLista === 1 ? "pessoa" : "pessoas"}`}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {haFiltro && <button type="button" className="gp-btn btn-outline" onClick={limpar} style={{ fontSize: 12, padding: "6px 12px" }}>Limpar filtros</button>}
            {!portal && <button type="button" className="gp-btn btn-outline" onClick={exportar} disabled={exportando || totalLista === null} style={{ fontSize: 12, padding: "6px 12px" }}>{exportando ? "Exportando…" : "Exportar lista"}</button>}
          </div>
        </div>
        {etiquetas.length > 0 && (
          <ul aria-label="Filtros ativos" style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: 0, margin: "0 0 10px" }}>
            {etiquetas.map((e) => (
              <li key={e.chave}>
                <button type="button" className="gp-btn gp-chip" onClick={e.remover} aria-label={`Remover filtro ${e.texto}`}>{e.texto} <span aria-hidden="true">×</span></button>
              </li>
            ))}
          </ul>
        )}
        {erroExportar && <p role="alert" style={{ fontSize: 13, color: "#991B1B", margin: "0 0 8px" }}>{erroExportar}</p>}
        {erroLista ? (
          <p role="alert" style={{ fontSize: 13, color: "#991B1B", margin: 0 }}>{erroLista}</p>
        ) : lista === null ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Carregando a lista…</p>
        ) : lista.total === 0 ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Nenhum funcionário com esses filtros</p>
        ) : (
          <div style={{ overflowX: "auto", opacity: carregando ? 0.6 : 1 }} aria-busy={carregando}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", minWidth: portal ? 420 : 760 }}>
              <thead>
                <tr>
                  <th style={th}>Nome</th><th style={th}>Cargo</th><th style={th}>Admissão</th><th style={th}>Tempo de casa</th>
                  {!portal && <><th style={th}>Idade</th><th style={th}>Sexo</th><th style={th}>Escolaridade</th></>}
                  {comAniversario && <><th style={th}>Aniversário</th><th style={th}>Completa</th></>}
                </tr>
              </thead>
              <tbody>
                {lista.linhas.map((l, i) => {
                  const rh = l as LinhaListaRH;
                  return (
                    <tr key={`${l.nome}-${i}`} style={{ borderTop: "1px solid #F3F4F6" }}>
                      <td style={{ ...td, fontWeight: 600, color: "#111827" }}>{l.nome}</td>
                      <td style={{ ...td, color: "#374151" }}>{l.cargo ?? "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{l.dataAdmissao}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{l.tempoDeCasa}</td>
                      {!portal && <><td style={td}>{rh.idade ?? "—"}</td><td style={td}>{rh.sexo}</td><td style={td}>{rh.escolaridade}</td></>}
                      {comAniversario && <><td style={{ ...td, whiteSpace: "nowrap" }}>{l.diaMes ?? "—"}</td><td style={{ ...td, whiteSpace: "nowrap" }}>{l.completaAnos === undefined ? "—" : `completa ${l.completaAnos} anos`}</td></>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
