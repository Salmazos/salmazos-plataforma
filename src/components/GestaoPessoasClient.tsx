"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar, Pie } from "react-chartjs-2";
import { limitarCargos, LIMITE_POUCOS_ATIVOS, NOMES_DOS_MESES, type ClienteOpcao, type GestaoPessoas, type GestaoPessoasPortal } from "@/lib/gestaoPessoas";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const COR_MASCULINO = "#111827";
const COR_FEMININO = "#FFB800";
const COR_NAO_INFORMADO = "#D1D5DB";
const COR_BARRA = "#7F77DD";
const MAX_CARGOS_NO_GRAFICO = 12;

// "rh": painel interno (escolhe a empresa, avisos de uso interno). "portal": o cliente vendo só a própria empresa, sem texto interno do RH.
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
  // trocar a empresa sempre volta para o mês corrente.
  indiceMesInicial?: number;
}

function Cartao({ titulo, valor, detalhe, controle }: { titulo: string; valor: string; detalhe?: string; controle?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <p style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1.1 }}>{valor}</p>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", margin: "4px 0 0" }}>{titulo}</p>
      {detalhe && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{detalhe}</p>}
      {controle && <div style={{ marginTop: 10 }}>{controle}</div>}
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

export default function GestaoPessoasClient({ clientes, selecionadoId, dados, modo = "rh", indiceMesInicial = 0 }: Props) {
  const router = useRouter();
  const portal = modo === "portal";
  const T = TEXTOS[modo];
  const [indiceMes, setIndiceMes] = useState(indiceMesInicial);
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
  const aniversariantes = mesEscolhido?.aniversariantes ?? [];
  const cargos = limitarCargos(dados.cargos, MAX_CARGOS_NO_GRAFICO);
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
  const itensSexo = ([["Masculino", porSexo.masculino, COR_MASCULINO], ["Feminino", porSexo.feminino, COR_FEMININO], [T.naoInformado, porSexo.naoInformado, COR_NAO_INFORMADO]] as const)
    .filter(([rotulo, n]) => !(portal && rotulo === T.naoInformado && n === 0));
  const nomeDoMes = NOMES_DOS_MESES[dados.mesDeReferencia - 1] ?? "";
  const opcoesBarraHorizontal = { indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } };

  return (
    <div>
      {cabecalho}

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
        <Cartao titulo="Funcionários ativos" valor={String(totalAtivos)} detalhe={dados.cliente.nome} />
        <Cartao titulo="Admitidos no mês" valor={String(dados.admitidosNoMes)} detalhe={nomeDoMes} />
        <Cartao titulo="Tempo médio de casa" valor={dados.tempoMedioDeCasaMeses === null ? "—" : `${String(dados.tempoMedioDeCasaMeses).replace(".", ",")} meses`} />
        <Cartao
          titulo={`Aniversariantes de ${mesEscolhido?.rotulo ?? nomeDoMes}`}
          valor={String(aniversariantes.length)}
          detalhe={indiceMes === 0 ? "mês atual" : undefined}
          controle={
            <>
              <label htmlFor="mes-aniversariantes" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Mês</label>
              <select id="mes-aniversariantes" value={indiceMes} onChange={(e) => setIndiceMes(Number(e.target.value))} className="input-field" style={{ width: "100%" }}>
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
              data={{ labels: itensSexo.map(([r]) => r), datasets: [{ data: itensSexo.map(([, n]) => n), backgroundColor: itensSexo.map(([, , c]) => c) }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }}
            />
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", fontSize: 13, color: "#374151" }}>
            {itensSexo.map(([rotulo, n, cor]) => (
              <li key={rotulo} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: cor, marginRight: 8 }} />{rotulo}</span>
                <span>{n} ({pct(n, totalAtivos)})</span>
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
              data={{
                labels: faixasMostradas.map((f) => f.rotulo),
                datasets: [
                  { label: "Masculino", data: faixasMostradas.map((f) => f.masculino), backgroundColor: COR_MASCULINO },
                  { label: "Feminino", data: faixasMostradas.map((f) => f.feminino), backgroundColor: COR_FEMININO },
                  ...(mostrarColunaNI ? [{ label: T.naoInformado, data: faixasMostradas.map((f) => f.naoInformado), backgroundColor: COR_NAO_INFORMADO }] : []),
                ],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }}
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
                    <td style={{ padding: "4px 6px" }}>{f.masculino}</td>
                    <td style={{ padding: "4px 6px" }}>{f.feminino}</td>
                    {mostrarColunaNI && <td style={{ padding: "4px 6px", color: "#9CA3AF" }}>{f.naoInformado}</td>}
                    <td style={{ padding: "4px 6px", fontWeight: 700 }}>{f.total}</td>
                  </tr>
                ))}
                <tr style={{ textAlign: "right", borderTop: "2px solid #E5E7EB", fontWeight: 700 }}>
                  <td style={{ textAlign: "left", padding: "4px 6px" }}>Total</td>
                  <td style={{ padding: "4px 6px" }}>{porSexo.masculino}</td>
                  <td style={{ padding: "4px 6px" }}>{porSexo.feminino}</td>
                  {mostrarColunaNI && <td style={{ padding: "4px 6px", color: "#9CA3AF" }}>{porSexo.naoInformado}</td>}
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
              data={{ labels: escolaridadeMostrada.map((e) => (e.naoInformado ? T.naoInformado : e.rotulo)), datasets: [{ data: escolaridadeMostrada.map((e) => e.total), backgroundColor: escolaridadeMostrada.map((e) => (e.naoInformado ? COR_NAO_INFORMADO : COR_BARRA)), borderRadius: 4 }] }}
              options={opcoesBarraHorizontal}
            />
          </div>
          {portal && escolaridade.some((e) => e.naoInformado && e.total > 0) && nota(T.notaLegado)}
          </>}
        </Secao>

        <Secao titulo="Cargos">
          <div style={{ height: Math.max(220, cargos.length * 28 + 40) }}>
            <Bar
              data={{ labels: cargos.map((c) => c.cargo), datasets: [{ data: cargos.map((c) => c.total), backgroundColor: COR_BARRA, borderRadius: 4 }] }}
              options={opcoesBarraHorizontal}
            />
          </div>
        </Secao>
      </div>

      <Secao titulo={`Aniversariantes de ${mesEscolhido?.rotulo ?? nomeDoMes}`}>
        {aniversariantes.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Nenhum aniversariante em {mesEscolhido?.rotulo ?? nomeDoMes}.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {aniversariantes.map((a, i) => (
              <li key={`${a.nome}-${i}`} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid #F3F4F6", fontSize: 13 }}>
                <strong style={{ width: 48, color: "#111827" }}>{a.diaMes}</strong>
                <span style={{ flex: 1, color: "#111827", fontWeight: 600 }}>{a.nome}{a.cargo && <span style={{ fontWeight: 400, color: "#6B7280" }}> · {a.cargo}</span>}</span>
                <span style={{ color: "#6B7280", whiteSpace: "nowrap" }}>completa {a.completaAnos} anos</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
