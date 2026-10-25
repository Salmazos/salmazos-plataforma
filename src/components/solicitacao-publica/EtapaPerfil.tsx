"use client";

import {
  CATEGORIAS_HABILITACAO, REQ_COM_CONDICAO_SIMPLES, REQ_COM_CURSO, REQ_CONHECIMENTOS, REQ_ESCOLARIDADE, REQ_EXPERIENCIA, REQ_NR,
  gerarRequisitosTexto,
} from "@/lib/solicitacaoVagaCampos";
import ChipGroupPublico from "./ChipGroupPublico";
import { AvisoAnuncio, CampoSelecao, CampoTexto, ListaPersonalizada, PreviaTextoGerado, Segmentado } from "./controles";
import type { PropsEtapa } from "./tipos";

const SIM_NAO = [
  { id: "nao", label: "Não" },
  { id: "sim", label: "Sim" },
] as const;

const OPCOES_CATEGORIA = CATEGORIAS_HABILITACAO.map((c) => ({ id: c, label: `Categoria ${c}` }));

export default function EtapaPerfil({ form, atualizar, erros }: PropsEtapa) {
  const req = form.requisitos;
  const alternar = (chip: string) => atualizar("requisitos", { ...req, chips: { ...req.chips, [chip]: !req.chips[chip] } });
  const grupo = (rotulo: string, lista: string[]) => (
    <ChipGroupPublico rotulo={rotulo} chips={lista} selecionados={req.chips} onToggle={alternar} />
  );

  return (
    <div className="space-y-6">
      <section aria-labelledby="perfil-titulo" className="space-y-5">
        <div>
          <h3 id="perfil-titulo" className="text-base font-bold text-gray-900">Perfil desejado</h3>
          <p className="text-sm text-gray-600">Estas informações ajudam a nossa equipe na busca e ficam só para uso interno: não são publicadas na vaga.</p>
        </div>
        <Segmentado
          id="campo-sexo"
          rotulo="Sexo"
          opcoes={[
            { id: "indiferente", label: "Indiferente" },
            { id: "masc", label: "Masculino" },
            { id: "fem", label: "Feminino" },
          ]}
          valor={form.sexo}
          onChange={(v) => atualizar("sexo", v)}
          colunas="grid-cols-3"
        />
        <CampoTexto
          id="campo-idade"
          rotulo="Idade"
          valor={form.idade}
          onChange={(v) => atualizar("idade", v)}
          placeholder="Ex.: a partir de 21 anos"
          maxLength={60}
          erro={erros.idade}
        />
        <Segmentado id="campo-pcd" rotulo="Vaga para pessoa com deficiência (PCD)?" opcoes={SIM_NAO} valor={form.pcd} onChange={(v) => atualizar("pcd", v)} />
        <Segmentado
          id="campo-habilitacao"
          rotulo="Precisa de habilitação (CNH)?"
          opcoes={SIM_NAO}
          valor={form.habilitacao}
          onChange={(v) => atualizar("habilitacao", v)}
        />
        {form.habilitacao === "sim" && (
          <CampoSelecao
            id="campo-habilitacao_categoria"
            rotulo="Qual categoria?"
            obrigatorio
            valor={form.habilitacao_categoria}
            onChange={(v) => atualizar("habilitacao_categoria", v)}
            opcoes={OPCOES_CATEGORIA}
            erro={erros.habilitacao_categoria}
          />
        )}
        <Segmentado
          id="campo-veiculo_proprio"
          rotulo="Precisa ter veículo próprio?"
          opcoes={SIM_NAO}
          valor={form.veiculo_proprio}
          onChange={(v) => atualizar("veiculo_proprio", v)}
        />
      </section>

      <section aria-labelledby="qualif-titulo" className="space-y-5 border-t border-gray-200 pt-6">
        <div>
          <h3 id="qualif-titulo" className="text-base font-bold text-gray-900">Requisitos</h3>
          <p className="text-sm text-gray-600">Clique para adicionar requisitos</p>
        </div>

        <ChipGroupPublico
          rotulo="Escolaridade"
          chips={REQ_ESCOLARIDADE}
          selecionados={req.chips}
          onToggle={alternar}
          cursos={req.cursos}
          onCursoChange={(chip, v) => atualizar("requisitos", { ...req, cursos: { ...req.cursos, [chip]: v } })}
          condicoes={req.condicoes}
          onCondicaoChange={(chip, v) => atualizar("requisitos", { ...req, condicoes: { ...req.condicoes, [chip]: v } })}
          comCurso={REQ_COM_CURSO}
          comCondicaoSimples={REQ_COM_CONDICAO_SIMPLES}
        />
        {grupo("Experiência", REQ_EXPERIENCIA)}
        {grupo("Normas Regulamentadoras", REQ_NR)}
        {grupo("Conhecimentos", REQ_CONHECIMENTOS)}

        <ListaPersonalizada
          id="campo-requisito_extra"
          rotulo="Requisito personalizado"
          itens={req.custom}
          onChange={(custom) => atualizar("requisitos", { ...req, custom })}
          placeholder="Digite um requisito e pressione Enter"
        />
        <AvisoAnuncio />
        <PreviaTextoGerado titulo="Requisitos selecionados" texto={gerarRequisitosTexto(req)} />

        <div className="space-y-2">
          <CampoTexto
            id="campo-principais_atividades"
            rotulo="Principais Atividades (opcional)"
            multilinha
            linhas={5}
            valor={form.principais_atividades}
            onChange={(v) => atualizar("principais_atividades", v)}
            placeholder="Descreva as principais atividades do cargo (uma por linha)..."
            maxLength={3000}
            ajuda="Aparece na vaga publicada para os candidatos."
            erro={erros.principais_atividades}
          />
          <AvisoAnuncio />
        </div>
        <div className="space-y-2">
          <CampoTexto
            id="campo-observacoes"
            rotulo="Outras informações (opcional)"
            multilinha
            linhas={4}
            valor={form.observacoes}
            onChange={(v) => atualizar("observacoes", v)}
            placeholder="Informações adicionais, detalhes específicos da vaga..."
            maxLength={2000}
            ajuda="Só a equipe Salmazos vê este campo."
            erro={erros.observacoes}
          />
        </div>
      </section>
    </div>
  );
}
