import AdmissaoFormClient from "@/components/admissao/AdmissaoFormClient";

interface Props {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdmissaoPage({ params }: Props) {
  const { token } = await params;
  return <AdmissaoFormClient token={token} />;
}
