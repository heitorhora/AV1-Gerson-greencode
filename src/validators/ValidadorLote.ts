import { Validador } from "./Validador";

const JANELA_MAXIMA_DIAS = 90;
const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export interface EntradaValidacaoLote {
  dataEntrada: string; // ISO date, ex: "2026-09-20"
  orgId: string;
  organizacoesExistentesIds: string[];
}

export class ValidadorLote extends Validador<EntradaValidacaoLote> {
  protected executar({ dataEntrada, orgId, organizacoesExistentesIds }: EntradaValidacaoLote): void {
    const data = new Date(dataEntrada);
    if (Number.isNaN(data.getTime())) {
      this.adicionarErro(`Data de entrada invalida: "${dataEntrada}".`);
    } else {
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);
      if (data.getTime() > hoje.getTime()) {
        this.adicionarErro("Data de entrada nao pode ser futura.");
      }

      const limiteAntigo = hoje.getTime() - JANELA_MAXIMA_DIAS * MILISSEGUNDOS_POR_DIA;
      if (data.getTime() < limiteAntigo) {
        this.adicionarErro(`Data de entrada nao pode ser anterior a ${JANELA_MAXIMA_DIAS} dias.`);
      }
    }

    if (!organizacoesExistentesIds.includes(orgId)) {
      this.adicionarErro(`Organizacao ${orgId} nao encontrada. Cadastre-a antes de criar o lote.`);
    }
  }
}
