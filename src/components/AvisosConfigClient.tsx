"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { grupoTemPadrao } from "@/lib/avisosPadrao";
import {
  NOTA_EVENTO,
  canaisDoEvento,
  EVENTOS_POR_GRUPO,
  ROTULO_CANAL,
  ROTULO_EVENTO,
  ROTULO_GRUPO,
  descricaoPadraoDoSistema,
  type GrupoAviso,
} from "@/lib/avisosCatalogo";

interface Destinatario {
  id: string;
  evento: string;
  canal: string;
  tipo_destinatario: "usuario" | "email";
  usuario_id: string | null;
  email: string | null;
  nome: string | null;
  ativo: boolean;
}
interface CanalCfg { evento: string; canal: string; ativo: boolean }
interface Usuario { user_id: string; nome_completo: string; email: string | null }
interface Dados { canais: CanalCfg[]; destinatarios: Destinatario[]; usuarios: Usuario[] }

const GRUPOS: GrupoAviso[] = ["vagas", "rescisao", "aso", "portal_cliente"];

// Texto de reserva quando a API bloqueia (409) sem devolver mensagem: é a regra do último destinatário.
const MSG_ULTIMO_DESTINATARIO =
  "Não é possível: este é o último destinatário ativo do canal. Adicione outra pessoa antes ou desligue o canal.";
// Quanto tempo o erro inline fica na tela antes de sumir sozinho.
const TEMPO_ERRO_INLINE_MS = 8000;

interface Resultado { ok: boolean; erro?: string; rede?: boolean }

async function chamar(url: string, method: string, body?: unknown): Promise<Resultado> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => ({}));
    const padrao = res.status === 409 ? MSG_ULTIMO_DESTINATARIO : "Não foi possível concluir a ação.";
    return { ok: false, erro: typeof json.error === "string" && json.error ? json.error : padrao };
  } catch {
    return { ok: false, erro: "Falha de conexão. Tente novamente.", rede: true };
  }
}

// Erro de uma ação, mostrado junto de onde o usuário clicou (`escopo`: id da linha, "evento:canal" do
// bloco ou "restaurar"). A mensagem global do topo fica só para falha de rede.
function ErroInline({ texto, onFechar }: { texto: string; onFechar: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 text-xs rounded-md px-2.5 py-1.5 my-2"
      style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}
    >
      <span style={{ flex: 1 }}>{texto}</span>
      <button type="button" aria-label="Fechar mensagem" onClick={onFechar} className="underline" style={{ color: "#B91C1C" }}>
        fechar
      </button>
    </div>
  );
}

export default function AvisosConfigClient() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [aba, setAba] = useState<GrupoAviso>("vagas");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [erroInline, setErroInline] = useState<{ escopo: string; texto: string } | null>(null);

  // O erro inline some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!erroInline) return;
    const t = setTimeout(() => setErroInline(null), TEMPO_ERRO_INLINE_MS);
    return () => clearTimeout(t);
  }, [erroInline]);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/avisos-config", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setMigracaoPendente(!!json.migracaoPendente);
        setErroCarga(json.error ?? "Erro ao carregar.");
        return;
      }
      setErroCarga(null);
      setMigracaoPendente(false);
      setDados({ canais: json.canais, destinatarios: json.destinatarios, usuarios: json.usuarios });
    } catch {
      setErroCarga("Falha de conexão ao carregar os avisos.");
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeUsuario = useMemo(() => new Map((dados?.usuarios ?? []).map((u) => [u.user_id, u])), [dados]);

  // `escopo` diz onde mostrar o erro da ação (a linha ou o bloco clicado). Só falha de rede vai para a
  // mensagem global do topo, para a tela não "pular" quando a API bloqueia uma ação.
  async function executar(chave: string, req: Promise<Resultado>, escopo: string) {
    setOcupado(chave);
    setMensagem(null);
    setErroInline(null);
    const r = await req;
    if (r.ok) await carregar();
    else if (r.rede) setMensagem({ tipo: "erro", texto: r.erro ?? "Falha de conexão. Tente novamente." });
    else setErroInline({ escopo, texto: r.erro ?? "Não foi possível concluir a ação." });
    setOcupado(null);
    return r.ok;
  }

  if (migracaoPendente) {
    return (
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Avisos</h1>
        <p className="text-sm text-gray-700">
          As tabelas de Avisos ainda não foram criadas no banco (migration <code>supabase/migration_avisos_unificados.sql</code> pendente).
          Enquanto isso, os avisos seguem funcionando pelas telas antigas.
        </p>
      </div>
    );
  }
  if (erroCarga) return <div className="card"><p className="text-sm text-red-600">{erroCarga}</p></div>;
  if (!dados) return <div className="card"><p className="text-sm text-gray-500">Carregando…</p></div>;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Avisos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quem recebe cada aviso, por canal. Com o canal ligado e sem destinatários, vale o padrão do sistema indicado em cada linha.
        </p>
      </div>

      {mensagem && (
        <div className="mb-4 text-sm rounded-lg px-4 py-3" style={{ background: mensagem.tipo === "erro" ? "#FEF2F2" : "#F0FDF4", color: mensagem.tipo === "erro" ? "#991B1B" : "#166534" }}>
          {mensagem.texto}
        </div>
      )}

      <div className="card mb-6">
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", overflowX: "auto" }}>
          {GRUPOS.map((g) => (
            <button
              key={g}
              onClick={() => setAba(g)}
              style={{
                flex: "0 0 auto",
                padding: "12px 16px",
                borderBottom: aba === g ? "2px solid #FFD700" : "2px solid transparent",
                backgroundColor: aba === g ? "#FFFBEB" : "transparent",
                color: aba === g ? "#000" : "#6B7280",
                fontWeight: aba === g ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {ROTULO_GRUPO[g]}
            </button>
          ))}
        </div>

        <div style={{ paddingTop: 16 }}>
          {grupoTemPadrao(aba) && (
            <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-100">
              <div style={{ flex: 1 }}>
                <p className="text-xs text-gray-500">Volta os destinatários e os canais ligados deste grupo para o padrão do sistema.</p>
                {erroInline?.escopo === "restaurar" && <ErroInline texto={erroInline.texto} onFechar={() => setErroInline(null)} />}
              </div>
              <button
                className="btn-outline"
                disabled={ocupado !== null}
                onClick={async () => {
                  if (!window.confirm(`Isso substitui a configuração atual de ${ROTULO_GRUPO[aba]} pelo padrão do sistema. Continuar?`)) return;
                  setOcupado("restaurar");
                  setMensagem(null);
                  setErroInline(null);
                  try {
                    const res = await fetch("/api/avisos-config/restaurar-padrao", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ grupo: aba }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) setErroInline({ escopo: "restaurar", texto: json.error ?? "Não foi possível restaurar o padrão." });
                    else {
                      const ign = (json.data?.ignorados ?? []).length;
                      setMensagem({ tipo: "ok", texto: `Padrão de ${ROTULO_GRUPO[aba]} restaurado.${ign > 0 ? ` ${ign} usuário(s) do padrão estão inativos e ficaram de fora.` : ""}` });
                      await carregar();
                    }
                  } catch {
                    setMensagem({ tipo: "erro", texto: "Falha de conexão. Tente novamente." });
                  }
                  setOcupado(null);
                }}
              >
                Restaurar padrão do sistema
              </button>
            </div>
          )}
          {EVENTOS_POR_GRUPO[aba].map((evento) => (
            <div key={evento} className="mb-6 pb-6 border-b border-gray-100 last:border-0">
              <h2 className="text-sm font-bold text-gray-900 mb-1">{ROTULO_EVENTO[evento] ?? evento}</h2>
              {NOTA_EVENTO[evento] && <p className="text-xs text-gray-500 mb-3">{NOTA_EVENTO[evento]}</p>}
              {!NOTA_EVENTO[evento] && <div className="mb-2" />}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                {canaisDoEvento(evento).map((canal) => (
                  <CanalBloco
                    key={canal}
                    grupo={aba}
                    evento={evento}
                    canal={canal}
                    cfg={dados.canais.find((c) => c.evento === evento && c.canal === canal)}
                    lista={dados.destinatarios.filter((d) => d.evento === evento && d.canal === canal)}
                    usuarios={dados.usuarios}
                    nomeUsuario={nomeUsuario}
                    ocupado={ocupado}
                    executar={executar}
                    erroInline={erroInline}
                    fecharErro={() => setErroInline(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface BlocoProps {
  grupo: GrupoAviso;
  evento: string;
  canal: "email" | "sino" | "popup";
  cfg?: CanalCfg;
  lista: Destinatario[];
  usuarios: Usuario[];
  nomeUsuario: Map<string, Usuario>;
  ocupado: string | null;
  executar: (chave: string, req: Promise<Resultado>, escopo: string) => Promise<boolean>;
  erroInline: { escopo: string; texto: string } | null;
  fecharErro: () => void;
}

function CanalBloco({ grupo, evento, canal, cfg, lista, usuarios, nomeUsuario, ocupado, executar, erroInline, fecharErro }: BlocoProps) {
  const ligado = cfg ? cfg.ativo : true;
  const ativos = lista.filter((d) => d.ativo).length;
  const chaveCanal = `${evento}:${canal}`;
  const [modoNovo, setModoNovo] = useState<"usuario" | "email">("usuario");
  const [usuarioNovo, setUsuarioNovo] = useState("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [emailNovo, setEmailNovo] = useState("");

  const usuariosDisponiveis = usuarios.filter(
    (u) => (canal !== "email" || !!u.email) && !lista.some((d) => d.usuario_id === u.user_id)
  );

  // Ordem estável: por nome (pt-BR, sem diferenciar maiúsculas), depois e-mail e id. Não depende de
  // `ativo` nem da ordem em que a API devolve as linhas, então a posição de uma pessoa não muda
  // depois de Ativar, Desativar ou Remover outra.
  const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  const linhas = lista
    .map((d) => {
      const u = d.usuario_id ? nomeUsuario.get(d.usuario_id) : null;
      const titulo = (d.tipo_destinatario === "usuario" ? u?.nome_completo ?? "Usuário inativo ou removido" : d.nome) ?? "";
      const detalhe = (d.tipo_destinatario === "usuario" ? u?.email ?? "" : d.email) ?? "";
      return { d, titulo, detalhe };
    })
    .sort((a, b) => comparar(a.titulo, b.titulo) || comparar(a.detalhe, b.detalhe) || (a.d.id < b.d.id ? -1 : a.d.id > b.d.id ? 1 : 0));

  let situacao: string;
  if (!ligado) situacao = "Desligado: ninguém recebe por este canal.";
  else if (ativos === 0) situacao = descricaoPadraoDoSistema(grupo, canal, evento);
  else situacao = `${ativos} destinatário${ativos > 1 ? "s" : ""} ativo${ativos > 1 ? "s" : ""}.`;

  async function adicionar() {
    const corpo =
      modoNovo === "usuario" || canal !== "email"
        ? { evento, canal, tipo_destinatario: "usuario", usuario_id: usuarioNovo }
        : { evento, canal, tipo_destinatario: "email", nome: nomeNovo, email: emailNovo };
    const ok = await executar(`${chaveCanal}:add`, chamar("/api/avisos-config/destinatarios", "POST", corpo), chaveCanal);
    if (ok) { setUsuarioNovo(""); setNomeNovo(""); setEmailNovo(""); }
  }

  const bloqueado = ocupado !== null;
  const podeAdicionar = modoNovo === "usuario" || canal !== "email" ? !!usuarioNovo : !!nomeNovo.trim() && !!emailNovo.trim();

  return (
    <div style={{ border: "1px solid #F3F4F6", borderRadius: 8, padding: 12, opacity: ligado ? 1 : 0.85 }}>
      <label className="flex items-center gap-2 mb-1 cursor-pointer">
        <input
          type="checkbox"
          checked={ligado}
          disabled={bloqueado}
          onChange={(e) => executar(`${chaveCanal}:canal`, chamar("/api/avisos-config/canal", "PATCH", { evento, canal, ativo: e.target.checked }), chaveCanal)}
        />
        <span className="text-sm font-semibold text-gray-900">{ROTULO_CANAL[canal]}</span>
        <span className="text-xs" style={{ color: ligado ? "#166534" : "#6B7280" }}>{ligado ? "ligado" : "desligado"}</span>
      </label>
      <p className="text-xs text-gray-500 mb-3">{situacao}</p>
      {erroInline?.escopo === chaveCanal && <ErroInline texto={erroInline.texto} onFechar={fecharErro} />}

      {lista.length > 0 && (
        <div style={{ border: "1px solid #F3F4F6", borderRadius: 6 }} className="mb-3">
          {linhas.map(({ d, titulo, detalhe }) => {
            return (
              <div key={d.id} className="px-3 border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-2 py-2" style={{ opacity: d.ativo ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm text-gray-900 truncate">{titulo} <span className="text-xs text-gray-400">({d.tipo_destinatario === "usuario" ? "usuário" : "e-mail livre"})</span></div>
                  {detalhe && <div className="text-xs text-gray-500 truncate">{detalhe}</div>}
                </div>
                <button
                  className="text-xs underline text-gray-600"
                  aria-label={`${d.ativo ? "Desativar" : "Ativar"} ${titulo}`}
                  title={`${d.ativo ? "Desativar" : "Ativar"} ${titulo}`}
                  disabled={bloqueado}
                  onClick={() => executar(`${d.id}:ativo`, chamar(`/api/avisos-config/destinatarios/${d.id}`, "PATCH", { ativo: !d.ativo }), d.id)}
                >
                  {d.ativo ? "Desativar" : "Ativar"}
                </button>
                <button
                  className="text-xs underline text-red-600"
                  aria-label={`Remover ${titulo}`}
                  title={`Remover ${titulo}`}
                  disabled={bloqueado}
                  onClick={() => {
                    const quem = detalhe ? `${titulo} (${detalhe})` : titulo;
                    if (window.confirm(`Remover "${quem}" do canal ${ROTULO_CANAL[canal]} neste aviso? Esta ação não pode ser desfeita.`)) executar(`${d.id}:rm`, chamar(`/api/avisos-config/destinatarios/${d.id}`, "DELETE"), d.id);
                  }}
                >
                  Remover
                </button>
              </div>
              {erroInline?.escopo === d.id && <ErroInline texto={erroInline.texto} onFechar={fecharErro} />}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canal === "email" && (
          <select className="input-field" style={{ width: "auto" }} value={modoNovo} onChange={(e) => setModoNovo(e.target.value as "usuario" | "email")}>
            <option value="usuario">Usuário da plataforma</option>
            <option value="email">E-mail livre</option>
          </select>
        )}
        {modoNovo === "usuario" || canal !== "email" ? (
          <select className="input-field" style={{ flex: 1, minWidth: 160 }} value={usuarioNovo} onChange={(e) => setUsuarioNovo(e.target.value)}>
            <option value="">Selecione…</option>
            {usuariosDisponiveis.map((u) => (
              <option key={u.user_id} value={u.user_id}>{u.nome_completo}</option>
            ))}
          </select>
        ) : (
          <>
            <input className="input-field" style={{ flex: 1, minWidth: 110 }} placeholder="Nome" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} />
            <input className="input-field" style={{ flex: 1, minWidth: 150 }} placeholder="E-mail" value={emailNovo} onChange={(e) => setEmailNovo(e.target.value)} />
          </>
        )}
        <button className="btn-primary" disabled={bloqueado || !podeAdicionar} onClick={adicionar}>Adicionar</button>
      </div>
    </div>
  );
}
