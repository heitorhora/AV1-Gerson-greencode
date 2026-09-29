import { EstadoFisico, StatusEquipamento, TipoEquipamento } from "../types";

/** Historico de uma mudanca de estado fisico, com justificativa quando exigida. */
export interface HistoricoEstado {
  estadoAnterior: EstadoFisico;
  estadoNovo: EstadoFisico;
  justificativa?: string;
  timestamp: string;
  usuarioId: string;
}

/** Forma "plana" (DTO) do equipamento, usada para serializacao em disco. */
export interface EquipamentoDTO {
  id: string;
  loteId: string;
  tipo: TipoEquipamento;
  codigoBarras: string;
  estadoFisico: EstadoFisico;
  status: StatusEquipamento;
  atributosEspecificos: Record<string, unknown>;
  historicoEstados: HistoricoEstado[];
  criadoEm: string;
}

/**
 * Classe abstrata que define o contrato comum a todo equipamento, e concentra
 * a logica de dominio (calculo de potencial de recuperacao de valor, e
 * descricao dos componentes recuperaveis) que cada subtipo especializa via
 * polimorfismo. Novos tipos de ativos (ex.: baterias de veiculos eletricos,
 * paineis solares) podem ser adicionados como novas subclasses sem alterar
 * o nucleo do sistema — o ponto de extensao central citado na proposta.
 */
export abstract class EquipamentoBase {
  constructor(protected readonly dto: EquipamentoDTO) {}

  get id(): string {
    return this.dto.id;
  }

  get tipo(): TipoEquipamento {
    return this.dto.tipo;
  }

  get estadoFisico(): EstadoFisico {
    return this.dto.estadoFisico;
  }

  get status(): StatusEquipamento {
    return this.dto.status;
  }

  toDTO(): EquipamentoDTO {
    return this.dto;
  }

  /** Cada subtipo sabe descrever seus proprios componentes recuperaveis (polimorfismo). */
  abstract descreverComponentesRecuperaveis(): string[];

  /**
   * Estimativa relativa (0 a 1) do potencial de recuperacao de valor,
   * considerando o estado fisico e os materiais tipicos do subtipo.
   * Cada subclasse pondera esses fatores de forma diferente.
   */
  abstract calcularPotencialRecuperacao(): number;
}

export class TerminalComputador extends EquipamentoBase {
  descreverComponentesRecuperaveis(): string[] {
    return ["placa-mae", "processador", "memoria RAM", "fonte de alimentacao", "HDD/SSD", "gabinete metalico"];
  }

  calcularPotencialRecuperacao(): number {
    const fatorEstado = 1 - this.estadoFisico / 4; // NOVO=1.0 ... INSERVIVEL=0.0
    const baseComponentesNobres = 0.7; // terminais tem alta concentracao de placas/metais nobres
    return Number((fatorEstado * baseComponentesNobres).toFixed(2));
  }
}

export class Periferico extends EquipamentoBase {
  descreverComponentesRecuperaveis(): string[] {
    return ["cabos", "plasticos ABS", "pequenas placas de circuito"];
  }

  calcularPotencialRecuperacao(): number {
    const fatorEstado = 1 - this.estadoFisico / 4;
    const baseComponentesNobres = 0.35; // perifericos tem menor densidade de materiais nobres
    return Number((fatorEstado * baseComponentesNobres).toFixed(2));
  }
}

export class EquipamentoTelecom extends EquipamentoBase {
  descreverComponentesRecuperaveis(): string[] {
    return ["antenas", "modulos de radiofrequencia", "baterias", "placas de circuito de alta densidade"];
  }

  calcularPotencialRecuperacao(): number {
    const fatorEstado = 1 - this.estadoFisico / 4;
    const baseComponentesNobres = 0.55;
    return Number((fatorEstado * baseComponentesNobres).toFixed(2));
  }
}
