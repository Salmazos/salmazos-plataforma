// Cláusulas adicionais livres da proposta (opcionais), no MESMO padrão e com os MESMOS limites para R&S e MOT: até 10 cláusulas de até 600 caracteres,
// sem cláusula vazia e só com caracteres que o PDF consegue imprimir. Fonte única: propostaModelos (R&S) e propostaMot (MOT) importam daqui.
// Módulo sem imports de servidor.
import { z } from "zod";
import { textoDesenhavel } from "@/lib/propostaTexto";

export const MAX_CLAUSULAS_ADICIONAIS = 10;
export const MAX_CLAUSULA_ADICIONAL = 600;

export const clausulaAdicional = z
  .string()
  .trim()
  .min(1, "Preencha a cláusula adicional ou remova-a.")
  .max(MAX_CLAUSULA_ADICIONAL, `Cada cláusula adicional vai até ${MAX_CLAUSULA_ADICIONAL} caracteres.`)
  .refine((t) => textoDesenhavel(t) !== "", "A cláusula adicional só tem caracteres que o PDF não consegue imprimir.");
