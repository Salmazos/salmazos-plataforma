"use client";

import { useEffect, useRef, useState } from "react";
import { ORIENTACAO_FOTO_3X4 } from "@/lib/admissaoConstants";

interface Props {
  proporcaoLargura: number;
  proporcaoAltura: number;
  orientacao: "paisagem" | "retrato";
  instrucao: string;
  // Nome do documento sendo enviado (ex.: "Carteira de Habilitação (verso)") — fica
  // visível o tempo todo, inclusive dentro da tela de câmera, pra evitar que o
  // candidato perca o contexto de qual documento está fotografando/escolhendo.
  titulo: string;
  // Chamado tanto pra foto capturada pela câmera quanto pro arquivo escolhido na
  // galeria/"Escolher arquivo" — o chamador (PassoUploadDocumentos) trata os dois
  // caminhos igual a partir daqui (validarQualidadeImagem + comprimirImagem + upload).
  onArquivoEscolhido: (file: File) => void;
  onCancelar: () => void;
  // true só pra foto 3x4 (retrato_3x4) — some com o botão "Escolher da galeria" na tela
  // de escolha (evita candidato fotografar uma 3x4 impressa antiga em vez de tirar uma
  // selfie nova) e mostra a orientação extra abaixo. Os demais tipos (cartão, folha)
  // continuam com as duas opções normalmente. O fallback pra falha de câmera (input
  // nativo com capture="environment", ver abrirCamera) NÃO é afetado por essa flag —
  // continua disponível mesmo pra foto 3x4, só nunca aparece lado a lado em condição normal.
  ehFoto3x4?: boolean;
}

// Detecção simples de mobile — decide só se a opção "Usar câmera" aparece. Em desktop
// (sem match), o componente nunca chama getUserMedia — vai direto pro "Escolher arquivo"
// comum, como já era o comportamento antes desta feature existir.
export function detectarMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// "zoom" é um constraint não-padrão (rascunho antigo da Image Capture API) — o Chrome/
// Android costuma expor via track.getCapabilities().zoom quando o hardware suporta, mas
// o Safari/iOS não implementa isso via getUserMedia (nenhuma versão até hoje). lib.dom
// não declara esse campo, por isso a extensão de tipo manual abaixo.
interface MediaTrackCapabilitiesComZoom extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step: number };
}
interface MediaTrackConstraintSetComZoom extends MediaTrackConstraintSet {
  zoom?: number;
}

// Zoom alvo pra compensar a distância "segura" que o candidato naturalmente mantém do
// documento ao enquadrar (relatado em teste real: mesmo com o recorte pela moldura,
// documento ainda saía longe/pequeno demais pra leitura). 1.3 = 30% de aumento.
const ZOOM_ALVO = 1.3;

// Tenta aplicar zoom ótico/nativo via applyConstraints — só funciona quando o hardware
// expõe a capability (Chrome/Android, variando por aparelho; Safari/iOS não suporta essa
// constraint até hoje). Retorna true só se de fato aplicou, pra capturar() saber se ainda
// precisa apertar o recorte digitalmente ou se o frame já chega ampliado.
async function tentarZoomNativo(stream: MediaStream): Promise<boolean> {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities) return false;
  try {
    const caps = track.getCapabilities() as MediaTrackCapabilitiesComZoom;
    if (!caps.zoom) return false;
    const alvo = Math.min(caps.zoom.max, Math.max(caps.zoom.min, ZOOM_ALVO));
    await track.applyConstraints({ advanced: [{ zoom: alvo } as MediaTrackConstraintSetComZoom] });
    return true;
  } catch {
    return false;
  }
}

// Câmera com moldura semitransparente guiando o enquadramento — reutilizável por
// qualquer tipo de documento, configurado via proporção/orientação/instrução (ver
// lib/enquadramentoConfig.ts). Oferece "Escolher da galeria" como alternativa em
// condição normal, mesmo quando a câmera funciona — EXCETO pra foto 3x4 (ehFoto3x4),
// onde só "Usar câmera" aparece, pra evitar o candidato reenviar uma 3x4 impressa
// antiga em vez de tirar uma selfie nova. Se getUserMedia falhar por qualquer motivo
// (permissão negada, navegador sem suporte, contexto não seguro), cai automaticamente
// pro <input capture="environment"> nativo — esse fallback vale pra TODOS os tipos,
// inclusive foto 3x4, e nunca trava o candidato.
export default function CapturaComEnquadramento({
  proporcaoLargura,
  proporcaoAltura,
  orientacao,
  instrucao,
  titulo,
  onArquivoEscolhido,
  onCancelar,
  ehFoto3x4 = false,
}: Props) {
  const [isMobile] = useState(detectarMobile);
  const [modo, setModo] = useState<"escolha" | "camera">("escolha");
  const [erroCamera, setErroCamera] = useState("");
  // Foto 3x4 é selfie — abre na câmera frontal por padrão. Os demais tipos (RG, CNH,
  // comprovante) continuam na traseira, que é a que realmente fotografa um documento em
  // mãos. O botão de alternar (ver JSX do modo "camera") troca isso em qualquer tipo.
  const [facingMode, setFacingMode] = useState<"user" | "environment">(ehFoto3x4 ? "user" : "environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const molduraRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const inputFallbackRef = useRef<HTMLInputElement>(null);
  // true quando o zoom ótico/nativo da câmera foi aplicado com sucesso — nesse caso o
  // frame que chega no <video> já vem ampliado, então capturar() NÃO deve apertar o
  // recorte de novo (evita dobrar o zoom). Só reflete o resultado real do dispositivo,
  // por isso é ref (não precisa re-renderizar nada quando muda).
  const zoomNativoAplicadoRef = useRef(false);

  const pararStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => pararStream(), []);

  useEffect(() => {
    if (modo === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [modo]);

  const abrirCamera = async () => {
    setErroCamera("");
    if (!navigator.mediaDevices?.getUserMedia) {
      inputFallbackRef.current?.click();
      return;
    }
    try {
      // Sem width/height, o navegador escolhe uma resolução "padrão" própria — que varia
      // por aparelho e costuma ficar bem abaixo da capacidade real da câmera. Como o
      // recorte pela moldura já é, por natureza, só uma fração do frame, um stream nativo
      // baixo resulta em arquivo final pequeno mesmo com o recorte matematicamente certo.
      // "ideal" é um pedido, não uma exigência — nunca falha por um aparelho não suportar,
      // só usa o máximo que ele tiver disponível.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      zoomNativoAplicadoRef.current = await tentarZoomNativo(stream);
      setModo("camera");
    } catch {
      // Permissão negada, sem câmera disponível, etc. — cai pro input nativo, que no
      // mobile abre a câmera do próprio sistema (sem moldura, mas nunca trava o envio).
      setErroCamera("Não foi possível acessar a câmera — abrindo o seletor do dispositivo.");
      inputFallbackRef.current?.click();
    }
  };

  // Botão de "trocar câmera" dentro do modo captura (ver JSX abaixo) — útil tanto pra
  // foto 3x4 (candidato prefere pedir pra alguém tirar a foto com a câmera traseira, de
  // melhor qualidade) quanto pros documentos (raro, mas mantém consistência). Diferente
  // de abrirCamera(): busca o stream novo ANTES de parar o atual, então se o aparelho só
  // tiver uma câmera (ou a troca falhar por qualquer motivo), a sessão em andamento
  // continua intacta em vez de jogar o candidato pro seletor nativo no meio da captura.
  const alternarCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const novoFacing = facingMode === "user" ? "environment" : "user";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: novoFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      pararStream();
      streamRef.current = stream;
      zoomNativoAplicadoRef.current = await tentarZoomNativo(stream);
      setFacingMode(novoFacing);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      setErroCamera("Não foi possível trocar de câmera neste aparelho.");
    }
  };

  const capturar = () => {
    const video = videoRef.current;
    const moldura = molduraRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!moldura) {
      // Sem a moldura pra referência (não deveria acontecer aqui dentro do modo
      // câmera) — cai pro frame inteiro em vez de travar a captura.
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
    } else {
      // O <video> usa object-fit:cover, então o que aparece na tela é um recorte
      // ampliado/centralizado do frame nativo da câmera — sem essa conta, capturar
      // "o frame inteiro" salva uma área BEM maior do que o candidato viu na moldura,
      // fazendo o documento (enquadrado certinho na tela) sair minúsculo na foto final.
      // Aqui traduzimos o retângulo da moldura (em pixels de tela) pra coordenadas do
      // frame nativo, e recortamos só essa região (+ uma margem de segurança).
      const videoRect = video.getBoundingClientRect();
      const molduraRect = moldura.getBoundingClientRect();
      const escala = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
      const larguraRenderizada = video.videoWidth * escala;
      const alturaRenderizada = video.videoHeight * escala;
      const offsetX = (videoRect.width - larguraRenderizada) / 2;
      const offsetY = (videoRect.height - alturaRenderizada) / 2;

      const nativeX = (molduraRect.left - videoRect.left - offsetX) / escala;
      const nativeY = (molduraRect.top - videoRect.top - offsetY) / escala;
      const nativeW = molduraRect.width / escala;
      const nativeH = molduraRect.height / escala;

      // Margem de 6% ao redor pra não cortar a borda do documento por uma pequena
      // imprecisão no enquadramento do candidato.
      const margemX = nativeW * 0.06;
      const margemY = nativeH * 0.06;
      let sx = Math.max(0, nativeX - margemX);
      let sy = Math.max(0, nativeY - margemY);
      let sw = Math.min(video.videoWidth - sx, nativeW + margemX * 2);
      let sh = Math.min(video.videoHeight - sy, nativeH + margemY * 2);

      // Zoom nativo já aplicado (ver abrirCamera/tentarZoomNativo) → o frame que chega
      // aqui já está ampliado, então o recorte pela moldura sozinho já basta. Sem zoom
      // nativo (iPhone, ou Android sem suporte) → aperta o recorte mais um pouco pra
      // chegar no mesmo resultado por outro caminho, já que o documento ainda saía
      // pequeno/longe demais na foto final mesmo com o recorte básico pela moldura.
      if (!zoomNativoAplicadoRef.current) {
        const centroX = sx + sw / 2;
        const centroY = sy + sh / 2;
        sw = sw / ZOOM_ALVO;
        sh = sh / ZOOM_ALVO;
        sx = centroX - sw / 2;
        sy = centroY - sh / 2;
      }

      canvas.width = sw;
      canvas.height = sh;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        pararStream();
        onArquivoEscolhido(new File([blob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  };

  const handleArquivoNativo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onArquivoEscolhido(file);
    e.target.value = "";
  };

  if (modo === "camera") {
    // Maximiza o guia dentro da área livre da tela (descontando a barra de título em
    // cima e instrução+botões embaixo) — usa min() pra escolher a largura OU a altura
    // como fator limitante, o que faz o guia realmente preencher o espaço disponível
    // em vez de encolher artificialmente em telas de retrato (ver bug relatado: guia
    // pequeno demais forçava afastar o celular, encolhendo o documento na foto final).
    const razao = proporcaoLargura / proporcaoAltura;
    const larguraMoldura = `min(92vw, 60vh * ${razao})`;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#000" }} data-testid="camera-view">
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 1, padding: "14px 16px",
            background: "linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0))",
          }}
        >
          <p style={{ color: "#fff", margin: 0, fontWeight: 700, fontSize: 15, textAlign: "center", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
            {titulo}
          </p>
        </div>
        <button
          type="button"
          onClick={alternarCamera}
          aria-label="Trocar câmera"
          style={{
            position: "absolute", top: 14, right: 16, zIndex: 2,
            width: 40, height: 40, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.6)", background: "rgba(0,0,0,0.45)",
            color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          🔄
        </button>
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none", padding: "70px 20px 110px",
          }}
        >
          <div
            ref={molduraRef}
            data-testid="moldura"
            style={{
              width: larguraMoldura,
              maxWidth: "92vw",
              maxHeight: "60vh",
              aspectRatio: `${proporcaoLargura} / ${proporcaoAltura}`,
              border: "3px solid #FFD700",
              borderRadius: 12,
              boxShadow: "0 0 0 2000px rgba(0,0,0,0.55)",
            }}
          />
          <p style={{ color: "#fff", marginTop: 16, textAlign: "center", fontWeight: 700, fontSize: 15, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
            {instrucao}
          </p>
          {ehFoto3x4 && (
            <p style={{ color: "#fff", marginTop: 4, textAlign: "center", fontWeight: 500, fontSize: 13, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
              Enquadre rosto e ombros dentro da moldura
            </p>
          )}
        </div>
        <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 }}>
          <button
            onClick={() => { pararStream(); setModo("escolha"); }}
            style={{ padding: "10px 24px", borderRadius: 999, border: "1px solid #fff", background: "transparent", color: "#fff", fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            onClick={capturar}
            style={{ padding: "10px 32px", borderRadius: 999, border: "none", background: "#FFD700", color: "#000", fontWeight: 700 }}
          >
            Capturar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>{titulo}</p>
      {ehFoto3x4 && isMobile && (
        <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, margin: 0 }}>{ORIENTACAO_FOTO_3X4}</p>
      )}
      {isMobile && (
        <button
          type="button"
          onClick={abrirCamera}
          data-testid="btn-usar-camera"
          className="btn-primary"
        >
          📷 Usar câmera
        </button>
      )}
      {!(ehFoto3x4 && isMobile) && (
        <button
          type="button"
          onClick={() => inputGaleriaRef.current?.click()}
          data-testid="btn-galeria"
          className="btn-outline"
        >
          {isMobile ? "Escolher da galeria" : "Escolher arquivo"}
        </button>
      )}
      {erroCamera && <p style={{ fontSize: 12, color: "#B45309" }}>{erroCamera}</p>}
      <button type="button" onClick={onCancelar} style={{ fontSize: 12, color: "#6B7280", background: "none", border: "none" }}>
        Cancelar
      </button>

      <input
        ref={inputGaleriaRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
        onChange={handleArquivoNativo}
      />
      {/* Fallback quando getUserMedia falha — abre a câmera nativa do sistema (sem
          moldura), nunca bloqueia o envio. */}
      <input
        ref={inputFallbackRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={handleArquivoNativo}
      />
    </div>
  );
}
