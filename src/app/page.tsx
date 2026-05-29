import { Suspense } from "react";
import FormularioCadastro from "@/components/FormularioCadastro";

interface Props {
  searchParams: Promise<{ vaga?: string }>;
}

export default async function CadastroPage({ searchParams }: Props) {
  const params = await searchParams;
  const vaga = params.vaga ? decodeURIComponent(params.vaga) : undefined;

  return (
    <Suspense>
      <FormularioCadastro vagaParam={vaga} />
    </Suspense>
  );
}
