"use client";

import { useState, useRef } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCadastrado: () => void;
}

const AREAS = [
  "Administrativo",
  "Atendimento ao cliente",
  "Comercial / Vendas",
  "Financeiro",
  "Logistica",
  "Operacional",
  "Recursos Humanos",
  "Tecnologia",
  "Outros",
];

const MAPA_AREAS: Record<string, string> = {
  "rh": "Recursos Humanos",
  "recursos humanos": "Recursos Humanos",
  "recrutamento": "Recursos Humanos",
  "analista de rh": "Recursos Humanos",
  "selecao": "Recursos Humanos",
  "administrativo": "Administrativo",
  "atendimento": "Atendimento ao cliente",
  "vendas": "Comercial / Vendas",
  "comercial": "Comercial / Vendas",
  "financeiro": "Financeiro",
  "logistica": "Logistica",
  "operacional": "Operacional",
  "producao": "Operacional",
  "ti": "Tecnologia",
  "tecnologia": "Tecnologia",
};

export default function ModalCadastroRapido({ isOpen, onClose, onCadastrado }: Props) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [area, setArea] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [tempoExperiencia, setTempoExperiencia] = useState("");
  const [resumo, setResumo] = useState("");
  const [habilidades, setHabilidades] = useState<string[]>([]);
  const [idade, setIdade] = useState<string>("");
  const [formacao, setFormacao] = useState<string>("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const inputArquivo = useRef<HTMLInputElement>(null);

  const resetar = () => {
    setNome("");
    setTelefone("");
    setArea("");
    setEmail("");
    setCpf("");
    setCidade("");
    setEstado("");
    setTempoExperiencia("");
    setResumo("");
    setHabilidades([]);
    setIdade("");
    setFormacao("");
    setArquivo(null);
    setErro("");
    setExtraindo(false);
    setEnviando(false);
  };

  const handleFechar = () => {
    resetar();
    onClose();
  };

  const formatarTelefone = (v: string) => {
    const nums = v.replace(/\D/g, "").slice(0, 11);
    if (nums.length <= 2) return nums;
    if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
  };

  const handleArquivo = async (file: File) => {
    setArquivo(file);
    setExtraindo(true);
    setErro("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mediaType =
        ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
        ext === "png" ? "image/png" :
        ext === "doc" || ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
        "application/pdf";
      const response = await fetch("/api/extrair-curriculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType }),
      });
      const extraido = await response.json();
      if (extraido.nome && !nome) setNome(extraido.nome);
      if (extraido.telefone && !telefone) setTelefone(formatarTelefone(extraido.telefone));
      if (extraido.email && !email) setEmail(extraido.email);
      if (extraido.cpf && !cpf) setCpf(extraido.cpf);
      if (extraido.cidade) setCidade(extraido.cidade);
      if (extraido.estado) setEstado(extraido.estado);
      if (extraido.tempo_experiencia) setTempoExperiencia(extraido.tempo_experiencia);
      if (extraido.resumo) setResumo(extraido.resumo);
      if (extraido.habilidades?.length) setHabilidades(extraido.habilidades);
      if (extraido.idade) setIdade(String(extraido.idade));
      if (extraido.formacao) setFormacao(extraido.formacao);
      if (extraido.cargo && !area) {
        const cargo = extraido.cargo
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
        const areaEncontrada = Object.entries(MAPA_AREAS).find(([chave]) =>
          cargo.includes(chave)
        )?.[1];
        setArea(areaEncontrada ?? "Outros");
      }
    } catch {
      setErro("Não foi possível extrair os dados. Preencha manualmente.");
    } finally {
      setExtraindo(false);
    }
  };

  const handleSubmit = async () => {
    if (!nome.trim() || !telefone.trim() || !area) {
      setErro("Preencha nome, telefone e area de interesse.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      let curriculo_url = null;
      if (arquivo) {
        const formData = new FormData();
        formData.append("arquivo", arquivo);
        const resUpload = await fetch("/api/upload-curriculo", { method: "POST", body: formData });
        if (resUpload.ok) {
          const { url } = await resUpload.json();
          curriculo_url = url;
        }
      }
      const res = await fetch("/api/candidatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_completo: nome.trim(),
          telefone: telefone.trim(),
          cargo_pretendido: area,
          email: email || "",
          cpf: cpf || `TEMP-${Date.now()}`,
          cidade: cidade || "",
          estado: estado || "",
          tempo_experiencia: tempoExperiencia || "Sem experiência",
          turno_disponivel: "Flexível",
          habilidades: habilidades,
          resumo_profissional: resumo || null,
          idade: idade ? parseInt(idade) : null,
          formacao_academica: formacao || null,
          etapa_kanban: "triagem",
          origem: "Cadastro Rapido",
          curriculo_url,
        }),
      });
      if (!res.ok) {
        const resJson = await res.json();
        setErro(resJson.error || "Erro ao cadastrar candidato.");
        setEnviando(false);
        return;
      }
      handleFechar();
      onCadastrado();
    } catch {
      setErro("Erro ao cadastrar candidato. Tente novamente.");
      setEnviando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="bg-black text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Cadastro Rapido</h2>
            <p className="text-[#FFD700] text-sm mt-0.5">WhatsApp / E-mail</p>
          </div>
          <button onClick={handleFechar} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Currículo
            </label>
            <div
              onClick={() => inputArquivo.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                arquivo
                  ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-[#FFD700] bg-gray-50"
              }`}
            >
              {extraindo ? (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <div className="w-6 h-6 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Extraindo dados do currículo...</span>
                </div>
              ) : arquivo ? (
                <div className="flex flex-col items-center gap-1">
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-green-700">{arquivo.name}</span>
                  <span className="text-xs text-gray-400">Clique para trocar</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm">Clique para fazer upload do currículo</span>
                  <span className="text-xs">PDF, Word ou imagem · A IA preencherá os campos automaticamente</span>
                </div>
              )}
            </div>
            <input
              ref={inputArquivo}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleArquivo(e.target.files[0])}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Nome completo *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do candidato"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Telefone *
            </label>
            <input
              type="text"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Area de interesse *
            </label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="input-field"
            >
              <option value="">Selecione a area...</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <div className="flex gap-3 pt-2 border-t">
            <button onClick={handleFechar} className="btn-outline flex-1" disabled={enviando}>
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={enviando || extraindo}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {enviando ? "Cadastrando..." : "Cadastrar candidato"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
