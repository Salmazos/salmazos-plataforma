function waHref(telefone: string, mensagem: string): string {
  return `https://wa.me/55${telefone.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}

export function linkAdmissaoWhatsapp(nome: string, telefone: string, cargo: string, admissaoUrl: string): string {
  const msg = `Olá ${nome}! Parabéns novamente pela aprovação para a vaga de ${cargo}. Para darmos continuidade à sua contratação, preencha seus dados e envie seus documentos pelo link abaixo (leva poucos minutos, pelo celular mesmo):\n\n${admissaoUrl}\n\nO link é válido por 5 dias. Qualquer dúvida, estamos à disposição! 😊`;
  return waHref(telefone, msg);
}

export function linkDocumentoRejeitadoWhatsapp(nome: string, telefone: string, documentoLabel: string, motivo: string, admissaoUrl: string): string {
  const msg = `Olá ${nome}! Ao revisar seus documentos de admissão, identificamos um problema com: ${documentoLabel}.\n\nMotivo: ${motivo}\n\nPor favor, envie novamente pelo link abaixo:\n\n${admissaoUrl}`;
  return waHref(telefone, msg);
}
