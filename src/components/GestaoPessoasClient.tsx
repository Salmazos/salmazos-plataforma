"use client";

import { useRouter } from "next/navigation";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar, Pie } from "react-chartjs-2";
import { limitarCargos, LIMITE_POUCOS_ATIVOS, type ClienteOpcao, type GestaoPessoas } from "@/lib/gestaoPessoas";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const COR_MASCULINO = "#111827";
const COR_FEMININO = "#FFB800";
const COR_NAO_INFORMADO = "#D1D5DB";
const COR_BARRA = "#7F77DD";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MAX_CARGOS_NO_GRAFICO = 12;

interface Props {
  clientes: ClienteOpcao[];
  selecionadoId: string | null;
  dados: GestaoPessoas | null;
}

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <p style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1.1 }}>{valor}</p>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", margin: "4px 0 0" }}>{titulo}</p>
      {detalhe && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{detalhe}</p>}
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

export default function GestaoPessoasClient({ clientes, selecionadoId, dados }: Props) {
  const router = useRouter();
  // A empresa escolhida pode não estar na lista (cliente sem ativo): ela é incluída para o seletor não ficar em branco.
  const opcoes = dados && !clientes.some((c) => c.id === dados.cliente.id) ? [...clientes, { id: dados.cliente.id, nome: dados.cliente.nome }] : clientes;

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

  const cabecalho = (
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
          {clientes.length === 0 ? "Nenhuma empresa com funcionários ativos." : "Escolha uma empresa para ver as pessoas dela: ativos, aniversariantes do mês, sexo, faixa etária, escolaridade e cargos."}
        </div>
      </div>
    );
  }

  if (dados.totalAtivos === 0) {
    return (
      <div>
        {cabecalho}
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 14 }}>
          {dados.cliente.nome} não tem funcionários ativos no momento.
        </div>
      </div>
    );
  }

  const { porSexo, faixaPorSexo, escolaridade, aniversariantesDoMes, totalAtivos } = dados;
  const cargos = limitarCargos(dados.cargos, MAX_CARGOS_NO_GRAFICO);
  const nomeDoMes = MESES[dados.mesDeReferencia - 1] ?? "";
  const opcoesBarraHorizontal = { indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } };

  return (
    <div>
      {cabecalho}

      {dados.poucosAtivos && (
        <div role="note" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          Agregado de poucas pessoas, uso interno do RH ({totalAtivos} {totalAtivos === 1 ? "ativo" : "ativos"}; menos de {LIMITE_POUCOS_ATIVOS}).
        </div>
      )}
      {dados.dadosInconsistentes > 0 && (
        <div role="note" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          {dados.dadosInconsistentes} {dados.dadosInconsistentes === 1 ? "cadastro com data de nascimento inconsistente" : "cadastros com data de nascimento inconsistente"} (idade fora de 14 a 90 anos): contado em &quot;Idade não informada&quot;. Corrija na admissão da pessoa.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Cartao titulo="Funcionários ativos" valor={String(totalAtivos)} detalhe={dados.cliente.nome} />
        <Cartao titulo="Admitidos no mês" valor={String(dados.admitidosNoMes)} detalhe={nomeDoMes} />
        <Cartao titulo="Tempo médio de casa" valor={dados.tempoMedioDeCasaMeses === null ? "—" : `${String(dados.tempoMedioDeCasaMeses).replace(".", ",")} meses`} />
        <Cartao titulo="Aniversariantes do mês" valor={String(aniversariantesDoMes.length)} detalhe={nomeDoMes} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Secao titulo="Distribuição por sexo">
          <div style={{ height: 220 }}>
            <Pie
              data={{ labels: ["Masculino", "Feminino", "Não informado"], datasets: [{ data: [porSexo.masculino, porSexo.feminino, porSexo.naoInformado], backgroundColor: [COR_MASCULINO, COR_FEMININO, COR_NAO_INFORMADO] }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }}
            />
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", fontSize: 13, color: "#374151" }}>
            {([["Masculino", porSexo.masculino, COR_MASCULINO], ["Feminino", porSexo.feminino, COR_FEMININO], ["Não informado", porSexo.naoInformado, COR_NAO_INFORMADO]] as const).map(([rotulo, n, cor]) => (
              <li key={rotulo} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: cor, marginRight: 8 }} />{rotulo}</span>
                <span>{n} ({pct(n, totalAtivos)})</span>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Faixa etária por sexo">
          <div style={{ height: 240 }}>
            <Bar
              data={{
                labels: faixaPorSexo.map((f) => f.rotulo),
                datasets: [
                  { label: "Masculino", data: faixaPorSexo.map((f) => f.masculino), backgroundColor: COR_MASCULINO },
                  { label: "Feminino", data: faixaPorSexo.map((f) => f.feminino), backgroundColor: COR_FEMININO },
                  { label: "Não informado", data: faixaPorSexo.map((f) => f.naoInformado), backgroundColor: COR_NAO_INFORMADO },
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
                  <th style={{ padding: "4px 6px", fontWeight: 600 }}>N/I</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {faixaPorSexo.map((f) => (
                  <tr key={f.faixa} style={{ textAlign: "right", borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ textAlign: "left", padding: "4px 6px", color: "#374151" }}>{f.rotulo}</td>
                    <td style={{ padding: "4px 6px" }}>{f.masculino}</td>
                    <td style={{ padding: "4px 6px" }}>{f.feminino}</td>
                    <td style={{ padding: "4px 6px", color: "#9CA3AF" }}>{f.naoInformado}</td>
                    <td style={{ padding: "4px 6px", fontWeight: 700 }}>{f.total}</td>
                  </tr>
                ))}
                <tr style={{ textAlign: "right", borderTop: "2px solid #E5E7EB", fontWeight: 700 }}>
                  <td style={{ textAlign: "left", padding: "4px 6px" }}>Total</td>
                  <td style={{ padding: "4px 6px" }}>{porSexo.masculino}</td>
                  <td style={{ padding: "4px 6px" }}>{porSexo.feminino}</td>
                  <td style={{ padding: "4px 6px", color: "#9CA3AF" }}>{porSexo.naoInformado}</td>
                  <td style={{ padding: "4px 6px" }}>{totalAtivos}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Secao>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Secao titulo="Grau de escolaridade">
          <div style={{ height: 280 }}>
            <Bar
              data={{ labels: escolaridade.map((e) => e.rotulo), datasets: [{ data: escolaridade.map((e) => e.total), backgroundColor: escolaridade.map((e) => (e.naoInformado ? COR_NAO_INFORMADO : COR_BARRA)), borderRadius: 4 }] }}
              options={opcoesBarraHorizontal}
            />
          </div>
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

      <Secao titulo={`Aniversariantes de ${nomeDoMes}`}>
        {aniversariantesDoMes.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Ninguém faz aniversário neste mês (entre quem tem a data de nascimento informada).</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {aniversariantesDoMes.map((a, i) => (
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
