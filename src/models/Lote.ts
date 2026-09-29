import { StatusLote } from "../types";

export interface Lote {
  id: string;
  orgId: string; // CNPJ da organizacao geradora
  notaFiscal: string;
  transportadora: string;
  dataEntrada: string; // ISO date
  status: StatusLote;
  criadoEm: string;
}
