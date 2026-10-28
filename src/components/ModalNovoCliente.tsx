"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Upload } from "lucide-react";
import { SEGMENTOS_CLIENTE, TIPOS_SERVICO, ENTIDADES_CONTRATANTES } from "@/lib/constants";
import { useUsuarioLogado } from "@/components/UsuarioLogadoProvider";
import { responsaveisDaUnidade, responsavelPadrao, opcoesResponsavel } from "@/lib/responsaveis";
import type { Cliente } from "@/types";
import CampoTelefone from "@/components/ui/CampoTelefone";
import { MENSAGEM_AVISO_PREFILL, campoParaFocoInicial, escapeDeveFecharModal, rotularCampos, solicitacaoFicouIndisponivel, type AvisoPrefill, type PrefillCliente, type SituacaoDaVaga } from "@/lib/clienteDaSolicitacao";
import { PerguntaVincularEmpresa } from "@/components/VinculoCarteiraCliente";
import type { EmpresaCandidata } from "@/lib/carteiraVinculo";
import { devolverFocoSeExistir, prenderTabNoModal } from "@/components/focoDosModais";
import { validarSenhaPortal, PLACEHOLDER_SENHA_PORTAL, ITENS_CHECKLIST_SENHA_PORTAL } from "@/lib/senhaPortal";

// Cadastro a partir de uma solicitação do link público (POST /api/solicitacoes-vagas/[id]/vincular-cliente): a unidade é a da solicitação
// (nunca enviada daqui), o modal mostra o que veio preenchido e o que falta, e o aviso de duplicidade ganha "Vincular a este cliente".
export interface ContextoSolicitacaoCliente {
  id: string;
  unidadeId: string;
  avisos: AvisoPrefill[];
  // Nomes dos campos (nunca valores) que vieram da solicitação / dos obrigatórios que ficaram vazios.
  preenchidos: string[];
  sugeridos: string[];
  faltando: string[];
  onCriado: (r: { clienteId: string; clienteNome: string; vaga: SituacaoDaVaga }) => void;
  onVincularExistente: (clienteId: string) => void;
  // 409 "já vinculada ou decidida": quem chamou recarrega a lista.
  onJaVinculada: (mensagem: string) => void;
}

interface Props {
  isOpen: boolean;
  cliente?: Cliente | null;
  // Valores iniciais de um cadastro NOVO (hoje: o prefill da solicitação). Ignorado na edição.
  valoresIniciais?: Partial<PrefillCliente>;
  solicitacao?: ContextoSolicitacaoCliente;
  // Botão que abriu o modal: ao fechar o foco volta para ele, se ainda estiver na página. Sem ele, vale quem tinha o foco ao abrir.
  elementoDeOrigem?: HTMLElement | null;
  // Só vem pra quem tem acesso a todas as unidades (sócios): mostra o campo Unidade. Os
  // demais não escolhem — o cliente vai pra unidade de quem cadastra (ver POST /api/clientes).
  unidades?: { id: string; nome: string; ativa: boolean }[];
  onClose: () => void;
  onSalvo: (cliente: Cliente) => void;
}

interface UsuarioPortal {
  id: string;
  user_id: string;
  email: string;
  nome: string | null;
  created_at: string;
}

const MAX_USUARIOS_PORTAL = 3;

// Resposta 409 da trava de duplicidade (ver respostaDuplicidade em clienteDuplicidadeRota.ts): só nome, cidade e
// situação do cadastro existente — nunca telefone, e-mail ou CNPJ dele.
interface DuplicidadeCliente {
  nivel: "aviso" | "bloqueio";
  bloqueio: "cnpj" | "cpf" | "contato" | null;
  existente: { id: string; nome: string; cidade: string | null; ativo: boolean } | null;
  outraUnidade: boolean;
  podeConfirmar: boolean;
  podeLiberar: boolean;
  podeReativar: boolean;
}

const FORM_VAZIO = {
  nome: "",
  contato_nome: "",
  contato_telefone: "",
  contato_email: "",
  cidade: "",
  segmento: "",
  responsavel_comercial: "",
  entidade_contratante: "",
  cnpj: "",
  endereco: "",
  tipo_pessoa: "pj",
  cpf: "",
  email_nota_fiscal: "",
};

export default function ModalNovoCliente({ isOpen, cliente, valoresIniciais, solicitacao, elementoDeOrigem, unidades, onClose, onSalvo }: Props) {
  const usuario = useUsuarioLogado();
  const [form, setForm] = useState(FORM_VAZIO);
  const [unidadeId, setUnidadeId] = useState("");
  const [servicos, setServicos] = useState<string[]>([]);
  const [processoSimplificado, setProcessoSimplificado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [posCriacao, setPosCriacao] = useState<{ cliente: { id: string; nome: string }; candidatas: EmpresaCandidata[] } | null>(null);
  const [erro, setErro] = useState("");
  const [duplicidade, setDuplicidade] = useState<{ mensagem: string; dados: DuplicidadeCliente } | null>(null);
  const [confirmandoInativar, setConfirmandoInativar] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [erroLogo, setErroLogo] = useState("");

  const [usuariosPortal, setUsuariosPortal] = useState<UsuarioPortal[]>([]);
  const [carregandoUsuariosPortal, setCarregandoUsuariosPortal] = useState(false);
  const [mostrarFormNovoUsuario, setMostrarFormNovoUsuario] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
  const [adicionandoUsuario, setAdicionandoUsuario] = useState(false);
  const [erroNovoUsuario, setErroNovoUsuario] = useState("");

  const editando = !!cliente;

  useEffect(() => {
    if (isOpen) {
      setForm(
        cliente
          ? {
              nome: cliente.nome,
              contato_nome: cliente.contato_nome,
              contato_telefone: cliente.contato_telefone,
              contato_email: cliente.contato_email,
              cidade: cliente.cidade,
              segmento: cliente.segmento,
              responsavel_comercial: cliente.responsavel_comercial ?? "",
              entidade_contratante: cliente.entidade_contratante ?? "",
              cnpj: cliente.cnpj ?? "",
              endereco: cliente.endereco ?? "",
              tipo_pessoa: cliente.tipo_pessoa === "pf" ? "pf" : "pj",
              cpf: cliente.cpf ?? "",
              email_nota_fiscal: cliente.email_nota_fiscal ?? "",
            }
          : {
              ...FORM_VAZIO,
              ...(valoresIniciais
                ? {
                    nome: valoresIniciais.nome ?? "",
                    contato_nome: valoresIniciais.contato_nome ?? "",
                    contato_telefone: valoresIniciais.contato_telefone ?? "",
                    contato_email: valoresIniciais.contato_email ?? "",
                    cidade: valoresIniciais.cidade ?? "",
                    segmento: valoresIniciais.segmento ?? "",
                    responsavel_comercial: valoresIniciais.responsavel_comercial ?? "",
                    cnpj: valoresIniciais.cnpj ?? "",
                    cpf: valoresIniciais.cpf ?? "",
                    endereco: valoresIniciais.endereco ?? "",
                    email_nota_fiscal: valoresIniciais.email_nota_fiscal ?? "",
                    tipo_pessoa: valoresIniciais.tipo_pessoa === "pf" ? "pf" : "pj",
                  }
                : {}),
            }
      );
      setServicos(cliente?.servicos ?? valoresIniciais?.servicos ?? []);
      setProcessoSimplificado(cliente?.processo_simplificado ?? false);
      setUnidadeId(cliente?.unidade_id ?? (unidades?.find((u) => u.ativa) ?? unidades?.[0])?.id ?? "");
      setLogoUrl(cliente?.logo_url ?? null);
      setErroLogo("");
      setErro("");
      setDuplicidade(null);
      setConfirmandoInativar(false);
      setUsuariosPortal([]);
      setMostrarFormNovoUsuario(false);
      setNovoNome("");
      setNovoEmail("");
      setNovaSenha("");
      setMostrarNovaSenha(false);
      setErroNovoUsuario("");

      if (cliente) {
        let active = true;
        setCarregandoUsuariosPortal(true);
        fetch(`/api/clientes/portal-acesso?cliente_id=${cliente.id}`)
          .then((r) => r.json())
          .then((json) => { if (active) setUsuariosPortal(json.data ?? []); })
          .catch(() => { if (active) setUsuariosPortal([]); })
          .finally(() => { if (active) setCarregandoUsuariosPortal(false); });
        return () => { active = false; };
      }
    }
  }, [isOpen, cliente, unidades, valoresIniciais]);

  // Time do Responsável Comercial = o da unidade do cliente (a escolhida pelo sócio, a do
  // cliente na edição, ou a de quem cadastra). Cliente novo já vem com quem está logado.
  const unidadeIdCliente = unidades ? unidadeId || null : cliente?.unidade_id ?? solicitacao?.unidadeId ?? null;
  const unidadeSlugCliente = unidadeIdCliente
    ? usuario.unidadeSlugPorId[unidadeIdCliente] ?? null
    : usuario.todasUnidades ? null : usuario.unidadeSlug;
  const timeComercial = responsaveisDaUnidade(unidadeSlugCliente);

  useEffect(() => {
    if (!isOpen || cliente) return;
    const time: string[] = responsaveisDaUnidade(unidadeSlugCliente);
    // A sugestão que veio da solicitação (quem gerou o link) fica, mesmo fora do time da unidade; o analista pode trocar.
    const sugerido = valoresIniciais?.responsavel_comercial ?? "";
    setForm((f) =>
      time.includes(f.responsavel_comercial) || (sugerido !== "" && f.responsavel_comercial === sugerido)
        ? f
        : { ...f, responsavel_comercial: responsavelPadrao(time, usuario.apelido) }
    );
  }, [isOpen, cliente, unidadeSlugCliente, usuario.apelido, valoresIniciais]);

  // Foco: ao abrir vai para dentro do modal (a partir da solicitação, o primeiro obrigatório ainda vazio; senão o nome) e, ao fechar, volta ao
  // botão que o abriu, se ele ainda estiver na página.
  const caixaRef = useRef<HTMLDivElement>(null);
  const origemDoFoco = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    origemDoFoco.current = elementoDeOrigem ?? (document.activeElement as HTMLElement | null);
    const seletor: Record<string, string> = {
      nome: "#cliente-nome",
      cidade: "#cliente-cidade",
      segmento: "#cliente-segmento",
      contato_nome: "#cliente-contato-nome",
      contato_telefone: 'input[name="contato_telefone_cliente"]',
      contato_email: "#cliente-contato-email",
    };
    const campo = cliente ? "nome" : campoParaFocoInicial(valoresIniciais, !!solicitacao);
    caixaRef.current?.querySelector<HTMLElement>(seletor[campo])?.focus();
    return () => devolverFocoSeExistir(origemDoFoco.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;
  if (posCriacao) return <PerguntaVincularEmpresa cliente={posCriacao.cliente} candidatas={posCriacao.candidatas} onFechar={() => { setPosCriacao(null); onClose(); }} />;

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // Em Clientes (tela em produção, sem solicitação) o Esc continua não fazendo nada; no cadastro por solicitação fecha, menos o Esc que fecha a
      // lista de um <select>.
      if (solicitacao && !salvando && escapeDeveFecharModal({ key: e.key, alvo: e.target as Element })) { e.stopPropagation(); onClose(); }
      return;
    }
    prenderTabNoModal(e, caixaRef.current);
  };

  const recarregarUsuariosPortal = () => {
    if (!cliente) return;
    fetch(`/api/clientes/portal-acesso?cliente_id=${cliente.id}`)
      .then((r) => r.json())
      .then((json) => setUsuariosPortal(json.data ?? []))
      .catch(() => {});
  };

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  // Só no cadastro vindo de solicitação: obrigatório ainda vazio fica destacado (e anunciado) para o analista não salvar no escuro.
  const faltaPreencher = (campo: "nome" | "contato_nome" | "contato_telefone" | "contato_email" | "cidade" | "segmento") =>
    !!solicitacao && form[campo].trim() === "";
  const marcaFalta = (campo: Parameters<typeof faltaPreencher>[0]) =>
    faltaPreencher(campo) ? { "aria-invalid": true as const, style: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" } } : {};
  const pessoaFisica = form.tipo_pessoa === "pf";

  const toggleServico = (id: string) =>
    setServicos((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  // Upload do logo — só disponível editando (precisa de cliente.id pra saber onde salvar);
  // sobe direto ao selecionar o arquivo, não espera o "Salvar alterações" do resto do form.
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cliente) return;

    const permitidos = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    if (!permitidos.includes(file.type)) {
      setErroLogo("Use JPG, PNG, SVG ou WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErroLogo("Imagem muito grande. Máximo 2MB.");
      return;
    }

    setErroLogo("");
    setEnviandoLogo(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });

      const res = await fetch(`/api/clientes/${cliente.id}/logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, contentType: file.type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar logo.");
      setLogoUrl(json.data.logo_url);
    } catch (err) {
      setErroLogo((err as Error).message);
    } finally {
      setEnviandoLogo(false);
      e.target.value = "";
    }
  };

  const handleSalvar = async (extra?: { confirmar_duplicidade?: boolean; liberar_bloqueio?: boolean }) => {
    setSalvando(true);
    setErro("");
    setDuplicidade(null);
    try {
      const pf = form.tipo_pessoa === "pf";
      // Colunas de pessoa física só vão no corpo quando há o que enviar: cadastro e edição de PJ comum não dependem delas.
      const camposPessoa = {
        ...(pf ? { tipo_pessoa: "pf", cpf: form.cpf } : {}),
        ...(form.email_nota_fiscal.trim() || cliente?.email_nota_fiscal ? { email_nota_fiscal: form.email_nota_fiscal } : {}),
      };
      const { tipo_pessoa: _t, cpf: _c, email_nota_fiscal: _e, ...formBase } = form;
      void _t; void _c; void _e;

      if (solicitacao) {
        const res = await fetch(`/api/solicitacoes-vagas/${solicitacao.id}/vincular-cliente`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo: "criar",
            cliente: {
              tipo_pessoa: pf ? "pf" : "pj",
              nome: form.nome,
              contato_nome: form.contato_nome,
              contato_telefone: form.contato_telefone,
              contato_email: form.contato_email,
              cidade: form.cidade,
              segmento: form.segmento,
              servicos,
              responsavel_comercial: form.responsavel_comercial,
              ...(pf ? { cpf: form.cpf } : { cnpj: form.cnpj }),
              email_nota_fiscal: form.email_nota_fiscal,
              endereco: form.endereco,
            },
            ...extra,
          }),
        });
        const json = await res.json();
        if (res.status === 409 && json.jaExiste && json.duplicidade) {
          setDuplicidade({ mensagem: json.error, dados: json.duplicidade });
          return;
        }
        // Só quando a SOLICITAÇÃO ficou indisponível o modal fecha; qualquer outro 409 (ex.: índice único sem cadastro visível) fica aqui, com o que foi digitado.
        if (solicitacaoFicouIndisponivel(res.status, json)) { solicitacao.onJaVinculada(json.error); onClose(); return; }
        if (!res.ok) {
          const base = typeof json.error === "string" ? json.error : "Erro ao salvar.";
          setErro(json.cliente_orfao_id ? `${base} Um cadastro ficou criado sem vínculo (código ${json.cliente_orfao_id}); avise a diretoria.` : base);
          return;
        }
        solicitacao.onCriado({ clienteId: json.data.cliente.id, clienteNome: json.data.cliente.nome, vaga: json.data.vaga });
        onClose();
        return;
      }

      const url = editando ? `/api/clientes/${cliente!.id}` : "/api/clientes";
      const method = editando ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formBase,
          ...camposPessoa,
          servicos,
          processo_simplificado: processoSimplificado,
          ...(unidades && unidadeId ? { unidade_id: unidadeId } : {}),
          ...extra,
        }),
      });
      const json = await res.json();
      if (res.status === 409 && json.jaExiste && json.duplicidade) {
        setDuplicidade({ mensagem: json.error, dados: json.duplicidade });
        return;
      }
      if (!res.ok) { setErro(json.error ?? "Erro ao salvar."); return; }
      onSalvo(json.data);
      if (!editando) {
        // Cliente novo: se a Carteira tem empresa (prospect) de nome parecido, pergunta antes de fechar. Falha na consulta não atrapalha o cadastro.
        const candidatas = await fetch(`/api/clientes/${json.data.id}/empresas-candidatas`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (Array.isArray(j?.data) ? (j.data as EmpresaCandidata[]) : []))
          .catch(() => [] as EmpresaCandidata[]);
        if (candidatas.length > 0) { setPosCriacao({ cliente: { id: json.data.id, nome: json.data.nome }, candidatas }); return; }
      }
      onClose();
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  // Reativa o cadastro antigo em vez de criar outro (passa pela mesma checagem de CNPJ no servidor).
  const handleReativarExistente = async (existenteId: string) => {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/clientes/${existenteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: true }),
      });
      const json = await res.json();
      if (res.status === 409 && json.jaExiste && json.duplicidade) {
        setDuplicidade({ mensagem: json.error, dados: json.duplicidade });
        return;
      }
      if (!res.ok) { setErro(json.error ?? "Não foi possível reativar o cadastro."); return; }
      setDuplicidade(null);
      onSalvo(json.data);
      onClose();
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const handleAdicionarUsuario = async () => {
    setAdicionandoUsuario(true);
    setErroNovoUsuario("");
    try {
      const res = await fetch("/api/clientes/portal-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cliente!.id,
          nome: novoNome.trim() || undefined,
          email: novoEmail.trim(),
          senha: novaSenha,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErroNovoUsuario(json.error ?? "Erro."); return; }
      setNovoNome("");
      setNovoEmail("");
      setNovaSenha("");
      setMostrarFormNovoUsuario(false);
      recarregarUsuariosPortal();
    } catch {
      setErroNovoUsuario("Erro de conexão.");
    } finally {
      setAdicionandoUsuario(false);
    }
  };

  const handleSalvarEmailUsuario = async (userId: string, email: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/clientes/portal-acesso", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: cliente!.id, user_id: userId, email }),
      });
      const json = await res.json();
      if (!res.ok) return json.error ?? "Erro ao salvar e-mail.";
      recarregarUsuariosPortal();
      return null;
    } catch {
      return "Erro de conexão.";
    }
  };

  const handleSalvarSenhaUsuario = async (userId: string, senha: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/clientes/portal-acesso", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: cliente!.id, user_id: userId, senha }),
      });
      const json = await res.json();
      if (!res.ok) return json.error ?? "Erro ao redefinir senha.";
      return null;
    } catch {
      return "Erro de conexão.";
    }
  };

  const handleRemoverUsuario = async (userId: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `/api/clientes/portal-acesso?cliente_id=${cliente!.id}&user_id=${userId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) return json.error ?? "Erro ao remover.";
      recarregarUsuariosPortal();
      return null;
    } catch {
      return "Erro de conexão.";
    }
  };

  const handleInativar = async () => {
    if (!confirmandoInativar) { setConfirmandoInativar(true); return; }
    setSalvando(true);
    try {
      const res = await fetch(`/api/clientes/${cliente!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !cliente!.ativo }),
      });
      const json = await res.json();
      if (!res.ok) { setConfirmandoInativar(false); setErro(json.error ?? "Erro."); return; }
      onSalvo(json.data);
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={aoTeclar}>
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-labelledby="titulo-novo-cliente" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 id="titulo-novo-cliente" className="font-bold text-lg">
            {editando ? "Editar cliente" : solicitacao ? "Cadastrar cliente a partir da solicitação" : "Novo cliente"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {solicitacao && (
            <div className="space-y-2" aria-live="polite">
              {solicitacao.avisos.length > 0 && (
                <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p className="font-bold">Confira antes de cadastrar</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {solicitacao.avisos.map((a) => (
                      <li key={a}>{MENSAGEM_AVISO_PREFILL[a]}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 space-y-1">
                <p>
                  <span className="font-semibold text-green-800">Veio da solicitação:</span>{" "}
                  {solicitacao.preenchidos.length > 0 ? rotularCampos(solicitacao.preenchidos) : "nada"}
                </p>
                {solicitacao.sugeridos.length > 0 && (
                  <p>
                    <span className="font-semibold text-indigo-800">Sugerido pelo sistema (confira):</span> {rotularCampos(solicitacao.sugeridos)}
                  </p>
                )}
                <p>
                  <span className="font-semibold text-red-700">Falta preencher (obrigatório):</span>{" "}
                  {solicitacao.faltando.length > 0 ? rotularCampos(solicitacao.faltando) : "nada"}
                </p>
              </div>
            </div>
          )}

          {/* Pessoa jurídica ou física (só no cadastro novo; o tipo de um cliente existente não muda por aqui) */}
          {!editando ? (
            <fieldset>
              <legend className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de cliente</legend>
              <div className="grid grid-cols-2 gap-2">
                {([["pj", "Pessoa jurídica"], ["pf", "Pessoa física"]] as const).map(([valor, rotulo]) => (
                  <label
                    key={valor}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.tipo_pessoa === valor ? "border-black bg-gray-100 font-semibold" : "border-gray-300"}`}
                  >
                    <input type="radio" name="tipo-pessoa-cliente" checked={form.tipo_pessoa === valor} onChange={() => set("tipo_pessoa", valor)} />
                    {rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : pessoaFisica ? (
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pessoa física</p>
          ) : null}

          {/* Nome da empresa */}
          <div>
            <label htmlFor="cliente-nome" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {pessoaFisica ? "Nome completo *" : "Nome da empresa *"}
            </label>
            <input
              id="cliente-nome"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder={pessoaFisica ? "Ex: João da Silva" : "Ex: Indústrias Exemplo Ltda"}
              className="input-field"
              {...marcaFalta("nome")}
            />
          </div>

          {/* Logo do cliente — só disponível editando (upload precisa de cliente.id pra
              saber onde salvar); exibido no cabeçalho do portal do cliente. */}
          {editando && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Logo do cliente
              </label>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0"
                  style={{ width: 56, height: 56 }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Upload size={18} className="text-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors">
                    <Upload size={14} />
                    {enviandoLogo ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      disabled={enviandoLogo}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-gray-400 mt-1">JPG, PNG, SVG ou WEBP — máx. 2MB.</p>
                  {erroLogo && <p className="text-[11px] text-red-500 mt-1">{erroLogo}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Cidade *
              </label>
              <input
                value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
                placeholder="Ex: São Paulo"
                id="cliente-cidade"
                className="input-field"
                {...marcaFalta("cidade")}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Segmento *
              </label>
              <select
                value={form.segmento}
                onChange={(e) => set("segmento", e.target.value)}
                id="cliente-segmento"
                className="input-field"
                {...marcaFalta("segmento")}
              >
                <option value="">Selecione...</option>
                {SEGMENTOS_CLIENTE.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Responsável Comercial */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Responsável Comercial
            </label>
            <select
              value={form.responsavel_comercial}
              onChange={(e) => set("responsavel_comercial", e.target.value)}
              className="input-field"
            >
              <option value="">Sem responsável</option>
              {opcoesResponsavel(timeComercial, usuario.apelido, cliente?.responsavel_comercial ?? valoresIniciais?.responsavel_comercial).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Entidade contratante (no cadastro por solicitação ela se define depois, editando o cliente) */}
          {!solicitacao && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Entidade contratante (razão social)
            </label>
            <select
              value={form.entidade_contratante}
              onChange={(e) => set("entidade_contratante", e.target.value)}
              className="input-field"
            >
              <option value="">Não definido</option>
              {ENTIDADES_CONTRATANTES.map((e) => (
                <option key={e.value} value={e.value}>{e.razaoSocial}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Necessário para gerar a Autorização Sindical na admissão de candidatos deste cliente.
            </p>
          </div>
          )}

          {/* Unidade — só pra quem vê todas as unidades */}
          {unidades && unidades.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Unidade
              </label>
              <select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} className="input-field">
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                    {u.ativa ? "" : " (ainda não ativa)"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {editando
                  ? "Só pode ser alterada enquanto o cliente não tiver vagas nem encaminhamentos."
                  : "Só a equipe desta unidade vai enxergar o cliente."}
              </p>
            </div>
          )}

          {/* CNPJ (ou CPF) e endereço */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cliente-documento" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {pessoaFisica ? "CPF" : "CNPJ"}
              </label>
              <input
                id="cliente-documento"
                value={pessoaFisica ? form.cpf : form.cnpj}
                onChange={(e) => set(pessoaFisica ? "cpf" : "cnpj", e.target.value)}
                placeholder={pessoaFisica ? "000.000.000-00" : "00.000.000/0000-00"}
                className="input-field"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Endereço
              </label>
              <input
                value={form.endereco}
                onChange={(e) => set("endereco", e.target.value)}
                placeholder="Rua, número, bairro, cidade/UF"
                className="input-field"
              />
            </div>
          </div>

          {/* Tipos de serviço */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Tipos de serviço
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_SERVICO.map((tipo) => {
                const ativo = servicos.includes(tipo.id);
                const bgAtivo: Record<string, string> = {
                  recrutamento_selecao:  "#1D6FA4",
                  mao_obra_temporaria:   "#FFD700",
                  terceirizacao:         "#1D9E75",
                  avaliacao_psicologica: "#6B4FBB",
                };
                const colorAtivo: Record<string, string> = {
                  recrutamento_selecao:  "#FFFFFF",
                  mao_obra_temporaria:   "#000000",
                  terceirizacao:         "#FFFFFF",
                  avaliacao_psicologica: "#FFFFFF",
                };
                const btnStyle: React.CSSProperties = ativo
                  ? { backgroundColor: bgAtivo[tipo.id], color: colorAtivo[tipo.id], border: `2px solid ${bgAtivo[tipo.id]}` }
                  : { backgroundColor: "#FFFFFF", color: "#374151", border: "2px solid #D1D5DB" };
                const checkColor = ativo ? colorAtivo[tipo.id] : "#9CA3AF";

                return (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => toggleServico(tipo.id)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all"
                    style={btnStyle}
                  >
                    <span
                      className="flex items-center justify-center shrink-0 rounded"
                      style={{ width: 16, height: 16, border: `2px solid ${checkColor}`, color: checkColor }}
                    >
                      {ativo && (
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <span style={{ lineHeight: 1.3 }}>{tipo.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Processo simplificado (padrão "não" no cadastro por solicitação; muda-se editando o cliente) */}
          {!solicitacao && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={processoSimplificado}
                  onChange={(e) => setProcessoSimplificado(e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className="w-9 h-5 rounded-full peer-focus:ring-2 peer-focus:ring-green-300 transition-colors"
                  style={{ backgroundColor: processoSimplificado ? "#16A34A" : "#D1D5DB" }}
                >
                  <div
                    className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                    style={{ transform: processoSimplificado ? "translateX(16px)" : "translateX(0)" }}
                  />
                </div>
              </label>
              <span className="text-sm text-gray-700 font-medium">Processo simplificado</span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Pula a etapa de Entrevista Salmazos, indo direto para Entrevista Cliente — indicado
              para contratações simples, como empregados domésticos ou pequenos comércios.
            </p>
          </div>
          )}

          {/* Contato */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Dados do contato
            </p>
            <div className="space-y-4">
              <div>
                <label htmlFor="cliente-contato-nome" className="block text-xs text-gray-500 mb-1">Nome do contato *</label>
                <input
                  id="cliente-contato-nome"
                  value={form.contato_nome}
                  onChange={(e) => set("contato_nome", e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="input-field"
                  autoComplete="off"
                  name="contato_nome_cliente"
                  {...marcaFalta("contato_nome")}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Telefone *</label>
                  <CampoTelefone
                    value={form.contato_telefone}
                    onChange={(v) => set("contato_telefone", v)}
                    placeholder="(00) 00000-0000"
                    className="input-field"
                    autoComplete="off"
                    name="contato_telefone_cliente"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">E-mail (comunicação) *</label>
                  <input
                    type="email"
                    id="cliente-contato-email"
                    {...marcaFalta("contato_email")}
                    value={form.contato_email}
                    onChange={(e) => set("contato_email", e.target.value)}
                    placeholder="contato@empresa.com"
                    className="input-field"
                    autoComplete="off"
                    name="contato_email_cliente"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Usado só para o envio de e-mails de comunicação (aprovação/recusa de solicitações etc.) —
                    não é o e-mail de login do portal. O login é gerenciado abaixo, em Usuários do Portal.
                  </p>
                </div>
              </div>
              <div>
                <label htmlFor="cliente-email-nf" className="block text-xs text-gray-500 mb-1">E-mail da nota fiscal</label>
                <input
                  id="cliente-email-nf"
                  type="email"
                  value={form.email_nota_fiscal}
                  onChange={(e) => set("email_nota_fiscal", e.target.value)}
                  placeholder="financeiro@empresa.com"
                  className="input-field"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-400 mt-1">Para onde a nota fiscal é enviada. Opcional.</p>
              </div>
            </div>
          </div>

          {/* Usuários do Portal */}
          {editando && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Usuários do Portal ({usuariosPortal.length}/{MAX_USUARIOS_PORTAL})
                </p>
                {!mostrarFormNovoUsuario && usuariosPortal.length < MAX_USUARIOS_PORTAL && !carregandoUsuariosPortal && (
                  <button
                    type="button"
                    onClick={() => setMostrarFormNovoUsuario(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    + Adicionar usuário
                  </button>
                )}
              </div>

              {carregandoUsuariosPortal ? (
                <p className="text-sm text-gray-400">Carregando...</p>
              ) : (
                <div className="space-y-2">
                  {usuariosPortal.length === 0 && !mostrarFormNovoUsuario && (
                    <p className="text-sm text-gray-400">Nenhum usuário de portal cadastrado ainda.</p>
                  )}
                  {usuariosPortal.map((usuario) => (
                    <UsuarioPortalRow
                      key={usuario.id}
                      usuario={usuario}
                      onSalvarEmail={handleSalvarEmailUsuario}
                      onSalvarSenha={handleSalvarSenhaUsuario}
                      onRemover={handleRemoverUsuario}
                    />
                  ))}
                </div>
              )}

              {mostrarFormNovoUsuario && (
                <div className="mt-3 border border-gray-200 rounded-lg p-3 space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nome</label>
                    <input
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      placeholder="Ex: João Souza"
                      className="input-field text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">E-mail de login *</label>
                    <input
                      type="email"
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                      placeholder="usuario@empresa.com"
                      className="input-field text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Senha inicial *</label>
                    <div className="relative">
                      <input
                        type={mostrarNovaSenha ? "text" : "password"}
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        placeholder={PLACEHOLDER_SENHA_PORTAL}
                        className="input-field text-sm pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarNovaSenha((v) => !v)}
                        aria-label={mostrarNovaSenha ? "Ocultar senha" : "Mostrar senha"}
                        className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        {mostrarNovaSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <ChecklistSenhaPortal senha={novaSenha} />
                  </div>
                  {erroNovoUsuario && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {erroNovoUsuario}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAdicionarUsuario}
                      disabled={adicionandoUsuario || !novoEmail.trim() || !validarSenhaPortal(novaSenha).ok}
                      className="text-sm px-4 py-2 rounded-lg bg-black text-[#FFD700] font-medium transition-colors hover:bg-gray-800 disabled:opacity-50"
                    >
                      {adicionandoUsuario ? "Criando..." : "Criar usuário"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMostrarFormNovoUsuario(false); setErroNovoUsuario(""); }}
                      className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {duplicidade && (
            <div
              className={`text-sm rounded-lg border px-3 py-3 space-y-2 ${
                duplicidade.dados.nivel === "bloqueio"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              <p className="font-medium" role="alert">{duplicidade.mensagem}</p>
              {duplicidade.dados.existente && !duplicidade.dados.outraUnidade && (
                <p>
                  Cadastro encontrado: <strong>{duplicidade.dados.existente.nome}</strong>
                  {duplicidade.dados.existente.cidade ? ` — ${duplicidade.dados.existente.cidade}` : ""}
                  {" · "}
                  {duplicidade.dados.existente.ativo ? "ativo" : "inativo"}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="btn-outline" disabled={salvando} onClick={() => setDuplicidade(null)}>
                  Corrigir
                </button>
                {solicitacao && duplicidade.dados.existente && !duplicidade.dados.outraUnidade && (
                  <button
                    type="button"
                    className="btn-primary disabled:opacity-50"
                    disabled={salvando}
                    onClick={() => solicitacao.onVincularExistente(duplicidade.dados.existente!.id)}
                  >
                    {duplicidade.dados.existente.ativo ? "Vincular a este cliente" : "Reativar e vincular"}
                  </button>
                )}
                {!solicitacao && duplicidade.dados.podeReativar && duplicidade.dados.existente && !editando && (
                  <button
                    type="button"
                    className="btn-primary disabled:opacity-50"
                    disabled={salvando}
                    onClick={() => handleReativarExistente(duplicidade.dados.existente!.id)}
                  >
                    Reativar cadastro antigo
                  </button>
                )}
                {duplicidade.dados.nivel === "aviso" && duplicidade.dados.podeConfirmar && (
                  <button
                    type="button"
                    className="btn-outline disabled:opacity-50"
                    disabled={salvando}
                    onClick={() => handleSalvar({ confirmar_duplicidade: true })}
                  >
                    {editando ? "Salvar mesmo assim" : solicitacao ? "Cadastrar mesmo assim e vincular" : "Cadastrar mesmo assim"}
                  </button>
                )}
                {duplicidade.dados.podeLiberar && (
                  <button
                    type="button"
                    className="btn-outline disabled:opacity-50"
                    disabled={salvando}
                    onClick={() => handleSalvar({ liberar_bloqueio: true })}
                  >
                    {solicitacao ? "Liberar bloqueio e cadastrar" : "Liberar este cadastro"}
                  </button>
                )}
              </div>
            </div>
          )}

          {erro && (
            <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          {/* Ações */}
          <div className="flex items-center justify-between pt-2 border-t gap-3">
            {editando && (
              <button
                onClick={handleInativar}
                disabled={salvando}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                  confirmandoInativar
                    ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                    : cliente!.ativo
                    ? "text-red-600 border-red-200 hover:bg-red-50"
                    : "text-green-700 border-green-200 hover:bg-green-50"
                }`}
              >
                {confirmandoInativar
                  ? "Confirmar?"
                  : cliente!.ativo
                  ? "Inativar cliente"
                  : "Reativar cliente"}
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button onClick={onClose} className="btn-outline" disabled={salvando}>
                Cancelar
              </button>
              <button
                onClick={() => handleSalvar()}
                disabled={salvando}
                className="btn-primary disabled:opacity-50"
              >
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : solicitacao ? "Cadastrar e vincular" : "Cadastrar cliente"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Checklist sempre visível: o analista vê o que falta antes de errar. Só estado local, sem rede.
function ChecklistSenhaPortal({ senha }: { senha: string }) {
  const resultado = validarSenhaPortal(senha);
  return (
    <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5" aria-label="Requisitos da senha">
      {ITENS_CHECKLIST_SENHA_PORTAL.map(({ chave, rotulo }) => {
        const atendido = resultado[chave];
        return (
          <li key={chave} className={`text-xs ${atendido ? "text-green-700" : "text-gray-400"}`}>
            <span aria-hidden="true">{atendido ? "✓" : "○"}</span> {rotulo}
          </li>
        );
      })}
    </ul>
  );
}

function UsuarioPortalRow({
  usuario,
  onSalvarEmail,
  onSalvarSenha,
  onRemover,
}: {
  usuario: UsuarioPortal;
  onSalvarEmail: (userId: string, email: string) => Promise<string | null>;
  onSalvarSenha: (userId: string, senha: string) => Promise<string | null>;
  onRemover: (userId: string) => Promise<string | null>;
}) {
  const [email, setEmail] = useState(usuario.email);
  const [salvandoEmail, setSalvandoEmail] = useState(false);
  const [erroEmail, setErroEmail] = useState("");
  const [emailSalvo, setEmailSalvo] = useState(false);

  const [redefinindoSenha, setRedefinindoSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState("");
  const [senhaSalva, setSenhaSalva] = useState(false);

  const [confirmandoRemover, setConfirmandoRemover] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erroRemover, setErroRemover] = useState("");

  const emailAlterado = email.trim() !== usuario.email && email.trim().length > 0;

  const handleSalvarEmail = async () => {
    setSalvandoEmail(true);
    setErroEmail("");
    setEmailSalvo(false);
    const erroMsg = await onSalvarEmail(usuario.user_id, email.trim());
    if (erroMsg) setErroEmail(erroMsg);
    else setEmailSalvo(true);
    setSalvandoEmail(false);
  };

  const handleSalvarSenha = async () => {
    setSalvandoSenha(true);
    setErroSenha("");
    const erroMsg = await onSalvarSenha(usuario.user_id, senha);
    if (erroMsg) {
      setErroSenha(erroMsg);
    } else {
      setSenhaSalva(true);
      setSenha("");
    }
    setSalvandoSenha(false);
  };

  const handleRemover = async () => {
    if (!confirmandoRemover) { setConfirmandoRemover(true); return; }
    setRemovendo(true);
    setErroRemover("");
    const erroMsg = await onRemover(usuario.user_id);
    if (erroMsg) { setErroRemover(erroMsg); setRemovendo(false); }
    // se deu certo, o pai remove esta linha da lista ao recarregar — não precisa resetar estado local
  };

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium text-gray-500">{usuario.nome || "Usuário do portal"}</p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErroEmail(""); setEmailSalvo(false); }}
          className="input-field text-sm flex-1"
        />
        {emailAlterado && (
          <button
            type="button"
            onClick={handleSalvarEmail}
            disabled={salvandoEmail}
            className="text-xs px-3 py-1.5 rounded-lg bg-black text-[#FFD700] font-medium disabled:opacity-50 shrink-0"
          >
            {salvandoEmail ? "Salvando..." : "Salvar e-mail"}
          </button>
        )}
      </div>
      {erroEmail && <p className="text-xs text-red-600">{erroEmail}</p>}
      {emailSalvo && !erroEmail && <p className="text-xs text-green-700">E-mail de login atualizado!</p>}

      {redefinindoSenha ? (
        <div className="space-y-1.5">
          <div className="relative">
            <input
              type={mostrarSenha ? "text" : "password"}
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setErroSenha(""); }}
              placeholder={PLACEHOLDER_SENHA_PORTAL}
              className="input-field text-sm pr-9"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
            >
              {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <ChecklistSenhaPortal senha={senha} />
          {erroSenha && <p className="text-xs text-red-600">{erroSenha}</p>}
          {senhaSalva && <p className="text-xs text-green-700">Senha atualizada!</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSalvarSenha}
              disabled={salvandoSenha || !validarSenhaPortal(senha).ok}
              className="text-xs px-3 py-1.5 rounded-lg bg-black text-[#FFD700] font-medium disabled:opacity-50"
            >
              {salvandoSenha ? "Salvando..." : "Confirmar nova senha"}
            </button>
            <button
              type="button"
              onClick={() => { setRedefinindoSenha(false); setSenha(""); setErroSenha(""); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setRedefinindoSenha(true); setSenhaSalva(false); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-black hover:text-black transition-colors"
          >
            Redefinir senha
          </button>
          <button
            type="button"
            onClick={handleRemover}
            disabled={removendo}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              confirmandoRemover
                ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                : "text-red-600 border-red-200 hover:bg-red-50"
            }`}
          >
            {removendo ? "Removendo..." : confirmandoRemover ? "Confirmar remoção?" : "Remover acesso"}
          </button>
        </div>
      )}
      {erroRemover && <p className="text-xs text-red-600">{erroRemover}</p>}
    </div>
  );
}
