/**
 * Tipos e enumeracoes centrais do dominio greencode.
 */

export enum Papel {
  ADMINISTRADOR = "ADMINISTRADOR",
  OPERADOR_CADASTRO = "OPERADOR_CADASTRO",
  GESTOR_ALMOXARIFADO = "GESTOR_ALMOXARIFADO",
  AUDITOR = "AUDITOR",
}

/** Estado fisico do equipamento, em escala decrescente de conservacao (0 = melhor). */
export enum EstadoFisico {
  NOVO = 0,
  BOM = 1,
  REGULAR = 2,
  RUIM = 3,
  INSERVIVEL = 4,
}

export const ORDEM_ESTADO_FISICO: EstadoFisico[] = [
  EstadoFisico.NOVO,
  EstadoFisico.BOM,
  EstadoFisico.REGULAR,
  EstadoFisico.RUIM,
  EstadoFisico.INSERVIVEL,
];

export enum StatusEquipamento {
  AGUARDANDO_TRIAGEM = "AGUARDANDO_TRIAGEM",
  TRIADO = "TRIADO",
  DESMONTE = "DESMONTE",
  RECICLAGEM = "RECICLAGEM",
  DESCARTE_SEGURO = "DESCARTE_SEGURO",
}

export enum StatusLote {
  RECEBIDO = "RECEBIDO",
  EM_TRIAGEM = "EM_TRIAGEM",
  TRIAGEM_CONCLUIDA = "TRIAGEM_CONCLUIDA",
  FINALIZADO = "FINALIZADO",
}

export enum TipoEquipamento {
  TERMINAL_COMPUTADOR = "TERMINAL_COMPUTADOR",
  PERIFERICO = "PERIFERICO",
  EQUIPAMENTO_TELECOM = "EQUIPAMENTO_TELECOM",
}

export enum NivelSeveridade {
  INFO = "INFO",
  SUCESSO = "SUCESSO",
  AVISO = "AVISO",
  ERRO = "ERRO",
}

export interface ResultadoValidacao {
  valido: boolean;
  erros: string[];
}

export interface ContextoOperacao {
  usuarioId: string;
  papel: Papel;
  timestamp: string;
}

/** Permissoes de cada papel, por dominio de comando (usado pelo menu e pelo router). */
export const PERMISSOES: Record<Papel, string[]> = {
  [Papel.ADMINISTRADOR]: ["usuario", "config", "org", "lote", "equipamento", "auditoria", "relatorio"],
  [Papel.OPERADOR_CADASTRO]: ["org", "relatorio"],
  [Papel.GESTOR_ALMOXARIFADO]: ["lote", "equipamento", "relatorio"],
  [Papel.AUDITOR]: ["auditoria", "relatorio"],
};
