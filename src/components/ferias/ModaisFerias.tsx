"use client";

// Janelas da aba Férias: programar, em gozo / gozada, reabrir, ajustar data-base e informar saldo inicial. Cada janela chama a rota /api/ferias/[funcionarioId]/...
// correspondente; as validações daqui (feriasLinhas.ts) só avisam antes — a rota continua sendo a trava de verdade, e o texto de erro dela (em português) é mostrado como veio.
import { useState } from "react";
import { fundoDeFormulario } from "@/lib/fundoDaJanela";
import { dataBR } from "@/lib/dataBR";
import { adicionarDiasISO, ROTULO_SITUACAO_FERIAS } from "@/lib/feriasRegras";
import { validarGozo, validarProgramacao, type LinhaFerias } from "@/lib/feriasLinhas";

const ERRO_PADRAO = "Não foi possível concluir a operação. Tente novamente.";

export interface RespostaApi {
  ok: boolean;
  status: number;
  json: any;
}

// POST de JSON; falha de rede vira uma resposta de erro com texto em português (a janela nunca quebra).
export async function postar(url: string, corpo: unknown): Promise<RespostaApi> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: { error: "Falha de conexão. Tente novamente." } };
  }
}

export const textoDoErro = (r: RespostaApi): string => (typeof r.json?.error === "string" && r.json.error ? r.json.error : ERRO_PADRAO);

export interface PropsModal {
  linha: LinhaFerias;
  hojeISO: string;
  onClose: () => void;
  // Chamado quando a rota aceitou; a tela fecha a janela, mostra o aviso e recarrega a lista.
  onConcluido: (mensagem: string) => void;
}

function Janela({ titulo, linha, onClose, children, rotulo }: { titulo: string; linha: LinhaFerias; onClose: () => void; children: React.ReactNode; rotulo: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} {...fundoDeFormulario()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" style={{ maxHeight: "92vh", overflowY: "auto" }} role="dialog" aria-modal="true" aria-label={rotulo}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, lineHeight: 1, cursor: "pointer", color: "#6B7280" }}>×</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{linha.nome_completo} — {linha.cliente_nome}</p>
        {children}
      </div>
    </div>
  );
}

function Rodape({ salvando, desabilitado, rotuloOk, rotuloSalvando, onClose, onOk }: { salvando: boolean; desabilitado: boolean; rotuloOk: string; rotuloSalvando: string; onClose: () => void; onOk: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>
      <button type="button" className="btn-primary" disabled={salvando || desabilitado} onClick={onOk}>{salvando ? rotuloSalvando : rotuloOk}</button>
    </div>
  );
}

const Erro = ({ texto }: { texto: string }) => (texto ? <p className="text-sm mb-3" style={{ color: "#B91C1C" }} role="alert">{texto}</p> : null);
const Aviso = ({ texto }: { texto: string | null }) => (texto ? <p className="text-sm mb-3" style={{ color: "#92400E" }} role="status">{texto}</p> : null);
const Rotulo = ({ id, children }: { id: string; children: React.ReactNode }) => <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor={id}>{children}</label>;

// ── Programar ───────────────────────────────────────────────────────────────
export function ModalProgramar({ linha, hojeISO, onClose, onConcluido }: PropsModal) {
  const p = linha.periodo!;
  const reprogramando = p.situacao === "programada";
  const [inicio, setInicio] = useState(reprogramando ? p.gozo_inicio ?? "" : "");
  const [fim, setFim] = useState(reprogramando ? p.gozo_fim ?? "" : "");
  const [obs, setObs] = useState(p.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const validacao = validarProgramacao(p, inicio, fim, hojeISO);
  // O erro de data só aparece depois de preencher as duas datas (antes disso o botão só fica desabilitado).
  const mostrarErro = !!inicio && !!fim && validacao.erro ? validacao.erro : "";
  const minimoInicio = [hojeISO, adicionarDiasISO(p.aquisitivo_fim, 1)].sort().at(-1)!;

  async function enviar() {
    if (salvando || validacao.erro) return;
    setSalvando(true);
    setErro("");
    const r = await postar(`/api/ferias/${linha.funcionario_id}/programar`, { periodo_id: p.id, gozo_inicio: inicio, gozo_fim: fim, observacao: obs.trim() || null });
    setSalvando(false);
    if (!r.ok) return setErro(textoDoErro(r));
    onConcluido(reprogramando ? "Datas das férias alteradas." : "Férias programadas.");
  }

  return (
    <Janela titulo={reprogramando ? "Alterar datas das férias" : "Programar férias"} rotulo="Programar férias" linha={linha} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        Período aquisitivo {dataBR(p.aquisitivo_inicio)} a {dataBR(p.aquisitivo_fim)}. Data-limite para tirar as férias: <strong>{dataBR(p.data_limite)}</strong>.
      </p>
      <Rotulo id="ferias-inicio">Início das férias</Rotulo>
      <input id="ferias-inicio" type="date" className="input-field mb-3" value={inicio} min={minimoInicio} max={p.data_limite} onChange={(e) => setInicio(e.target.value)} />
      <Rotulo id="ferias-fim">Fim das férias</Rotulo>
      <input id="ferias-fim" type="date" className="input-field mb-3" value={fim} min={inicio || minimoInicio} max={p.data_limite} onChange={(e) => setFim(e.target.value)} />
      <Rotulo id="ferias-obs">Observação (opcional)</Rotulo>
      <textarea id="ferias-obs" className="input-field mb-3" rows={3} maxLength={2000} value={obs} onChange={(e) => setObs(e.target.value)} />
      <p className="text-xs text-gray-500 mb-3">Registre aqui as datas combinadas com a contabilidade. Os avisos de vencimento param enquanto as férias estiverem programadas.</p>
      <p className="text-xs text-gray-500 mb-3">No dia do início, a situação passa sozinha para Em férias; depois do último dia, para Férias tiradas. Se as datas mudarem, use Alterar datas ou Reabrir.</p>
      <Erro texto={mostrarErro || erro} />
      <Aviso texto={validacao.aviso} />
      <Rodape salvando={salvando} desabilitado={!!validacao.erro} rotuloOk={reprogramando ? "Salvar novas datas" : "Programar"} rotuloSalvando="Salvando..." onClose={onClose} onOk={enviar} />
    </Janela>
  );
}

// ── Em gozo / Gozada ────────────────────────────────────────────────────────
export function ModalSituacao({ linha, hojeISO, onClose, onConcluido, acao }: PropsModal & { acao: "em_gozo" | "gozada" }) {
  const p = linha.periodo!;
  const [inicio, setInicio] = useState(p.gozo_inicio ?? "");
  const [fim, setFim] = useState(p.gozo_fim ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const validacao = validarGozo(p, acao, inicio, fim, hojeISO);
  const mostrarErro = !!inicio && !!fim && validacao.erro ? validacao.erro : "";
  const ehGozada = acao === "gozada";

  async function enviar() {
    if (salvando || validacao.erro) return;
    setSalvando(true);
    setErro("");
    const r = await postar(`/api/ferias/${linha.funcionario_id}/situacao`, { periodo_id: p.id, acao, gozo_inicio: inicio, gozo_fim: fim });
    setSalvando(false);
    if (!r.ok) return setErro(textoDoErro(r));
    onConcluido(ehGozada ? "Férias concluídas. O funcionário passou ao próximo período." : "Início das férias registrado.");
  }

  return (
    <Janela titulo={ehGozada ? "Concluir férias" : "Iniciou férias"} rotulo={ehGozada ? "Concluir férias" : "Iniciou férias"} linha={linha} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        {ehGozada
          ? "Confirma que as férias deste período já foram tiradas? Isso fecha o período e o funcionário passa ao próximo."
          : "Confirma que as férias deste período já começaram?"}
      </p>
      <Rotulo id="gozo-inicio">Início das férias</Rotulo>
      <input id="gozo-inicio" type="date" className="input-field mb-3" value={inicio} max={hojeISO} onChange={(e) => setInicio(e.target.value)} />
      <Rotulo id="gozo-fim">Fim das férias</Rotulo>
      <input id="gozo-fim" type="date" className="input-field mb-3" value={fim} min={inicio || undefined} max={ehGozada ? hojeISO : undefined} onChange={(e) => setFim(e.target.value)} />
      <Erro texto={mostrarErro || erro} />
      <Rodape salvando={salvando} desabilitado={!!validacao.erro} rotuloOk={ehGozada ? "Confirmar férias tiradas" : "Confirmar início das férias"} rotuloSalvando="Salvando..." onClose={onClose} onOk={enviar} />
    </Janela>
  );
}

// ── Reabrir ─────────────────────────────────────────────────────────────────
export function ModalReabrir({ linha, onClose, onConcluido }: PropsModal) {
  const alvo = linha.reabrivel!;
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const valido = motivo.trim().length >= 3;

  async function enviar() {
    if (salvando || !valido) return;
    setSalvando(true);
    setErro("");
    const r = await postar(`/api/ferias/${linha.funcionario_id}/situacao`, { periodo_id: alvo.id, acao: "reabrir", motivo: motivo.trim() });
    setSalvando(false);
    if (!r.ok) return setErro(textoDoErro(r));
    onConcluido("Período reaberto: voltou para \"A programar\".");
  }

  return (
    <Janela titulo="Reabrir período" rotulo="Reabrir período" linha={linha} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        A situação do período {alvo.numero} é <strong>{ROTULO_SITUACAO_FERIAS[alvo.situacao]}</strong>
        {alvo.gozo_inicio && alvo.gozo_fim ? ` (${dataBR(alvo.gozo_inicio)} a ${dataBR(alvo.gozo_fim)})` : ""}. Ao reabrir, ele volta para &quot;A programar&quot; e as datas das férias são apagadas.
      </p>
      <Rotulo id="reabrir-motivo">Motivo (obrigatório)</Rotulo>
      <textarea id="reabrir-motivo" className="input-field mb-1" rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <p className="text-xs text-gray-500 mb-3">Mínimo de 3 caracteres. Fica registrado na auditoria.</p>
      <Erro texto={erro} />
      <Rodape salvando={salvando} desabilitado={!valido} rotuloOk="Reabrir período" rotuloSalvando="Reabrindo..." onClose={onClose} onOk={enviar} />
    </Janela>
  );
}

// ── Ajustar data-base ───────────────────────────────────────────────────────
export function ModalDataBase({ linha, hojeISO, onClose, onConcluido }: PropsModal) {
  const temAdmissao = !!linha.data_admissao;
  const [usarAdmissao, setUsarAdmissao] = useState(false);
  const [data, setData] = useState(linha.data_base ?? "");
  const [motivo, setMotivo] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // Só pede a confirmação quando já existe algo para apagar (períodos gerados ou saldo informado).
  const temAlgoParaApagar = !!linha.periodo || linha.saldo_confirmado;
  const dataOk = usarAdmissao ? temAdmissao : !!data;
  const valido = dataOk && motivo.trim().length >= 3 && (!temAlgoParaApagar || entendi);
  const limite = adicionarDiasISO(hojeISO, 366);

  async function enviar() {
    if (salvando || !valido) return;
    setSalvando(true);
    setErro("");
    const r = await postar(`/api/ferias/${linha.funcionario_id}/data-base`, {
      data_base: usarAdmissao ? null : data, motivo: motivo.trim(), ...(temAlgoParaApagar ? { confirmar_reinicio: true } : {}),
    });
    setSalvando(false);
    if (!r.ok) return setErro(textoDoErro(r));
    onConcluido("Data-base ajustada. Os períodos foram recalculados.");
  }

  return (
    <Janela titulo="Ajustar data-base" rotulo="Ajustar data-base" linha={linha} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        A data-base é de onde se contam os períodos aquisitivos. Por padrão é a data de admissão{temAdmissao ? ` (${dataBR(linha.data_admissao)})` : " (este funcionário não tem data de admissão)"}.
        Ajuste só se houve intervalo entre contratos ou se a admissão está errada.
      </p>
      {temAdmissao && (
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={usarAdmissao} onChange={(e) => setUsarAdmissao(e.target.checked)} />
          Voltar a usar a data de admissão
        </label>
      )}
      <Rotulo id="data-base-nova">Nova data-base</Rotulo>
      <input id="data-base-nova" type="date" className="input-field mb-3" value={usarAdmissao ? linha.data_admissao ?? "" : data} min="1990-01-01" max={limite} disabled={usarAdmissao} onChange={(e) => setData(e.target.value)} />
      <Rotulo id="data-base-motivo">Motivo (obrigatório)</Rotulo>
      <textarea id="data-base-motivo" className="input-field mb-3" rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {temAlgoParaApagar && (
        <div className="mb-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 12px" }}>
          <p className="text-sm mb-2" style={{ color: "#991B1B", fontWeight: 700 }}>Atenção: isto apaga os períodos e zera as férias já quitadas.</p>
          <p className="text-xs mb-2" style={{ color: "#991B1B" }}>
            Todos os períodos são recalculados a partir da nova data e as férias já quitadas precisam ser informadas de novo. Não é possível se já houver férias programadas, em férias ou tiradas (reabra-as antes).
          </p>
          <label className="flex items-start gap-2 text-sm" style={{ color: "#991B1B" }}>
            <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} style={{ marginTop: 3 }} />
            Entendi e quero apagar os períodos e zerar as férias já quitadas
          </label>
        </div>
      )}
      <Erro texto={erro} />
      <Rodape salvando={salvando} desabilitado={!valido} rotuloOk="Ajustar data-base" rotuloSalvando="Ajustando..." onClose={onClose} onOk={enviar} />
    </Janela>
  );
}

// ── Informar saldo inicial ──────────────────────────────────────────────────
interface SugestaoSaldo {
  numero: number;
  aquisitivo_fim: string;
}

export function ModalSaldoInicial({ linha, hojeISO, onClose, onConcluido }: PropsModal) {
  const [modo, setModo] = useState<"nenhum" | "quitado">("quitado");
  const [fimQuitado, setFimQuitado] = useState("");
  const [sugestao, setSugestao] = useState<{ sugestao: SugestaoSaldo; informado: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const valido = modo === "nenhum" || !!fimQuitado;

  async function enviar(corpo: Record<string, unknown>) {
    if (salvando) return;
    setSalvando(true);
    setErro("");
    const r = await postar(`/api/ferias/${linha.funcionario_id}/saldo-inicial`, corpo);
    setSalvando(false);
    if (r.ok) return onConcluido("Férias já quitadas informadas.");
    // A data não bate com o fim de nenhum período: a rota devolve o mais próximo e a pessoa confirma (nunca decide no escuro).
    if (r.status === 409 && r.json?.code === "confirmar_periodo" && r.json?.sugestao) {
      return setSugestao({ sugestao: r.json.sugestao, informado: r.json.informado ?? fimQuitado, texto: textoDoErro(r) });
    }
    setErro(textoDoErro(r));
  }

  const enviarInformado = () => enviar({ quitado_ate: modo === "nenhum" ? null : fimQuitado });

  return (
    <Janela titulo="Informar férias já quitadas" rotulo="Informar férias já quitadas" linha={linha} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-3">
        Informado pela contabilidade: até que período aquisitivo as férias já foram quitadas. Os períodos que terminam até essa data ficam como férias tiradas. Data-base: <strong>{dataBR(linha.data_base)}</strong>.
      </p>
      {sugestao ? (
        <div className="mb-3" style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "10px 12px" }}>
          <p className="text-sm mb-3" style={{ color: "#92400E" }} role="alert">{sugestao.texto}</p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn-primary" disabled={salvando} onClick={() => enviar({ quitado_ate: sugestao.informado, fim_confirmado: sugestao.sugestao.aquisitivo_fim })}>
              {salvando ? "Salvando..." : `Usar ${dataBR(sugestao.sugestao.aquisitivo_fim)} (período ${sugestao.sugestao.numero})`}
            </button>
            <button type="button" className="btn-secondary" disabled={salvando} onClick={() => setSugestao(null)}>Voltar e corrigir a data</button>
          </div>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
            <input type="radio" name="saldo-modo" checked={modo === "nenhum"} onChange={() => setModo("nenhum")} />
            Nenhum: nenhum período foi quitado ainda
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
            <input type="radio" name="saldo-modo" checked={modo === "quitado"} onChange={() => setModo("quitado")} />
            Fim do último período já quitado
          </label>
          <Rotulo id="saldo-fim">Data em que terminou o último período já quitado</Rotulo>
          <input id="saldo-fim" type="date" className="input-field mb-3" value={fimQuitado} max={hojeISO} disabled={modo === "nenhum"} onChange={(e) => setFimQuitado(e.target.value)} />
          <Erro texto={erro} />
          <Rodape salvando={salvando} desabilitado={!valido} rotuloOk="Informar" rotuloSalvando="Salvando..." onClose={onClose} onOk={enviarInformado} />
        </>
      )}
    </Janela>
  );
}
