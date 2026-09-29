import { TipoEquipamento } from "../types";
import {
  EquipamentoBase,
  EquipamentoDTO,
  EquipamentoTelecom,
  Periferico,
  TerminalComputador,
} from "../models/Equipamento";

/**
 * EquipamentoFactory encapsula a decisao de qual subclasse concreta de
 * EquipamentoBase instanciar a partir de um DTO ou de dados de cadastro.
 * Isolar essa decisao aqui e o que permite ao restante do sistema (services,
 * CLI, relatorios) trabalhar apenas com o tipo abstrato EquipamentoBase,
 * sem conhecer os detalhes de cada subtipo — a essencia do padrao Factory
 * combinado a polimorfismo.
 */
export class EquipamentoFactory {
  static criarAPartirDeDTO(dto: EquipamentoDTO): EquipamentoBase {
    switch (dto.tipo) {
      case TipoEquipamento.TERMINAL_COMPUTADOR:
        return new TerminalComputador(dto);
      case TipoEquipamento.PERIFERICO:
        return new Periferico(dto);
      case TipoEquipamento.EQUIPAMENTO_TELECOM:
        return new EquipamentoTelecom(dto);
      default:
        throw new Error(`Tipo de equipamento desconhecido: ${dto.tipo}`);
    }
  }

  static criarNovo(params: {
    id: string;
    loteId: string;
    tipo: TipoEquipamento;
    codigoBarras: string;
    atributosEspecificos?: Record<string, unknown>;
  }): EquipamentoBase {
    const dto: EquipamentoDTO = {
      id: params.id,
      loteId: params.loteId,
      tipo: params.tipo,
      codigoBarras: params.codigoBarras,
      estadoFisico: 0, // NOVO por padrao ate a triagem avaliar
      status: "AGUARDANDO_TRIAGEM" as EquipamentoDTO["status"],
      atributosEspecificos: params.atributosEspecificos ?? {},
      historicoEstados: [],
      criadoEm: new Date().toISOString(),
    };
    return EquipamentoFactory.criarAPartirDeDTO(dto);
  }
}
