"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  proporcaoLargura: number;
  proporcaoAltura: number;
  orientacao: "paisagem" | "retrato";
  instrucao: string;
  // Chamado tanto pra foto capturada pela câmera quanto pro arquivo escolhido na
  // galeria/"Escolher arquivo" — o chamador (PassoUploadDocumentos) trata os dois
  // caminhos igual a partir daqui (validarQualidadeImagem + comprimirImagem + upload).
  onArquivoEscolhido: (file: File) => void;
  onCancelar: () => void;
}

// Detecção simples de mobile — decide só se a opção "Usar câmera" aparece. Em desktop
// (sem match), o componente nunca chama getUserMedia — vai direto pro "Escolher arquivo"
// comum, como já era o comportamento antes desta feature existir.
export function detectarMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Câmera com moldura semitransparente guiando o enquadramento — reutilizável por
// qualquer tipo de documento, configurado via proporção/orientação/instrução (ver
// lib/enquadramentoConfig.ts). Sempre oferece "Escolher da galeria" como alternativa,
// mesmo quando a câmera funciona normalmente. Se getUserMedia falhar por qualquer
// motivo (permissão negada, navegador sem suporte, contexto não seguro), cai
// automaticamente pro <input capture="environment"> nativo, sem travar o candidato.
export default function CapturaComEnquadramento({
  proporcaoLargura,
  proporcaoAltura,
  orientacao,
  instrucao,
  onArquivoEscolhido,
  onCancelar,
}: Props) {
  const [isMobile] = useState(detectarMobile);
  const [modo, setModo] = useState<"escolha" | "camera">("escolha");
  const [erroCamera, setErroCamera] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const inputFallbackRef = useRef<HTMLInputElement>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setModo("camera");
    } catch {
      // Permissão negada, sem câmera disponível, etc. — cai pro input nativo, que no
      // mobile abre a câmera do próprio sistema (sem moldura, mas nunca trava o envio).
      setErroCamera("Não foi possível acessar a câmera — abrindo o seletor do dispositivo.");
      inputFallbackRef.current?.click();
    }
  };

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
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
    // Largura da moldura fixa em 78% da tela; altura derivada da proporção — funciona
    // tanto pra paisagem (mais larga que alta) quanto retrato (mais alta que larga).
    const larguraMoldura = orientacao === "paisagem" ? "78vw" : `${78 * (proporcaoLargura / proporcaoAltura)}vw`;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "#000" }} data-testid="camera-view">
        <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none", padding: 20,
          }}
        >
          <div
            data-testid="moldura"
            style={{
              width: larguraMoldura,
              maxWidth: "90vw",
              maxHeight: "70vh",
              aspectRatio: `${proporcaoLargura} / ${proporcaoAltura}`,
              border: "3px solid #FFD700",
              borderRadius: 12,
              boxShadow: "0 0 0 2000px rgba(0,0,0,0.55)",
            }}
          />
          <p style={{ color: "#fff", marginTop: 16, textAlign: "center", fontWeight: 700, fontSize: 15, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
            {instrucao}
          </p>
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
      <button
        type="button"
        onClick={() => inputGaleriaRef.current?.click()}
        data-testid="btn-galeria"
        className="btn-outline"
      >
        {isMobile ? "Escolher da galeria" : "Escolher arquivo"}
      </button>
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
