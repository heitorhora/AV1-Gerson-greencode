import { Validador } from "./Validador";
import { EstadoFisico, StatusEquipamento } from "../types";

const LIMITE_DEGRADACAO_SEM_JUSTIFICATIVA = 1; // queda de ate 1 categoria dispensa justificativa

export interface EntradaValidacaoTransicao {
  statusAtual: StatusEquipamento;
  statusDesejado: StatusEquipamento;
}

export interface EntradaValidacaoEstadoFisico {
  estadoAnterior: EstadoFisico;
  estadoNovo: EstadoFisico;
  justificativa?: string;
}

/** Valida se a transicao de STATUS operacional do equipamento e permitida. */
export class ValidadorTransicaoStatus extends Validador<EntradaValidacaoTransicao> {
  protected executar({ statusAtual, statusDesejado }: EntradaValidacaoTransicao): void {
    if (
      statusDesejado === StatusEquipamento.DESMONTE &&
      statusAtual !== StatusEquipamento.TRIADO
    ) {
      this.adicionarErro(
        "Equipamento so pode ser movido para DESMONTE apos passar por triagem completa (status TRIADO)."
      );
    }

    // Nao permite "regressao" para AGUARDANDO_TRIAGEM apos ja ter avancado no fluxo.
    const ordem = [
      StatusEquipamento.AGUARDANDO_TRIAGEM,
      StatusEquipamento.TRIADO,
      StatusEquipamento.DESMONTE,
      StatusEquipamento.RECICLAGEM,
      StatusEquipamento.DESCARTE_SEGURO,
    ];
    if (ordem.indexOf(statusDesejado) < ordem.indexOf(statusAtual)) {
      this.adicionarErro(`Transicao invalida: nao e possivel regredir de ${statusAtual} para ${statusDesejado}.`);
    }
  }
}

/** Valida se a mudanca de ESTADO FISICO exige justificativa textual obrigatoria. */
export class ValidadorMudancaEstadoFisico extends Validador<EntradaValidacaoEstadoFisico> {
  protected executar({ estadoAnterior, estadoNovo, justificativa }: EntradaValidacaoEstadoFisico): void {
    const quedaCategorias = estadoNovo - estadoAnterior;

    if (quedaCategorias > LIMITE_DEGRADACAO_SEM_JUSTIFICATIVA) {
      if (!justificativa || justificativa.trim().length < 10) {
        this.adicionarErro(
          `Degradacao de ${quedaCategorias} categorias de estado fisico exige justificativa textual ` +
            "(minimo 10 caracteres)."
        );
      }
    }
  }
}
