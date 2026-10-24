import type { ErrosForm, FormPublico } from "@/lib/solicitacaoVagaPublicaForm";

export interface PropsEtapa {
  form: FormPublico;
  atualizar: <K extends keyof FormPublico>(campo: K, valor: FormPublico[K]) => void;
  erros: ErrosForm;
}
