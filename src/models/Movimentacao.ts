import { StatusEquipamento } from "../types";

export interface Movimentacao {
  id: string;
  equipamentoId: string;
  statusAnterior: StatusEquipamento;
  statusNovo: StatusEquipamento;
  timestamp: string;
  usuarioId: string;
  observacao?: string;
}
