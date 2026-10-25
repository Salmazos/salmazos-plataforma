// Animações curtas da tela de enviado (classes sp-pop, sp-draw e sp-subir); desligadas para quem pede menos movimento. Compartilhado pelo link
// público (FormularioSolicitacaoPublica) e pelo portal (PortalSolicitacaoEnviada), que renderizam o mesmo ConteudoEnviado.
export const ESTILOS = `
@keyframes sp-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes sp-draw{to{stroke-dashoffset:0}}
@keyframes sp-subir{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.sp-pop{animation:sp-pop .5s ease-out both}
.sp-draw{stroke-dasharray:48;stroke-dashoffset:48;animation:sp-draw .5s .35s ease-out forwards}
.sp-subir{animation:sp-subir .5s ease-out both}
@media (prefers-reduced-motion:reduce){.sp-pop,.sp-subir{animation:none!important}.sp-draw{animation:none!important;stroke-dashoffset:0}}
`;
