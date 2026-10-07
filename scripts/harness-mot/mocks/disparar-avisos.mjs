// Troca o disparo real (e-mail/sino) por um registro de chamadas — igual dos dois lados da comparação.
export async function dispararAvisosRescisao(rescisaoId, momento) {
  globalThis.__DB__.avisosDisparados.push({ rescisaoId, momento });
  return { sucesso: true };
}
export async function avisarRescisaoPaga(rescisaoId) {
  globalThis.__DB__.avisosDisparados.push({ rescisaoId, momento: "paga" });
}
