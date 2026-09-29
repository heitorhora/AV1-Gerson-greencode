import { JournalManager, RegistroJournal } from "../persistence/JournalManager";
import { SecureStore } from "../persistence/SecureStore";
import { CryptoService } from "../crypto/CryptoService";
import { EquipamentoDTO } from "../models/Equipamento";
import { EquipamentoFactory } from "../factories/EquipamentoFactory";
import { Movimentacao } from "../models/Movimentacao";

export interface LinhaRelatorioRecuperacao {
  equipamentoId: string;
  tipo: string;
  status: string;
  potencialRecuperacao: number;
  componentesRecuperaveis: string[];
}

/**
 * AuditoriaService concentra todas as operacoes de SOMENTE LEITURA
 * disponiveis ao papel AUDITOR: consulta ao journal de transacoes e
 * geracao de relatorios agregados. Nenhum metodo desta classe altera
 * o estado do sistema.
 */
export class AuditoriaService {
  private readonly storeEquipamentos: SecureStore<EquipamentoDTO>;
  private readonly storeMovimentacoes: SecureStore<Movimentacao>;

  constructor(crypto_: CryptoService, dirDados: string, private readonly journal: JournalManager) {
    this.storeEquipamentos = new SecureStore<EquipamentoDTO>(crypto_, dirDados, "equipamentos.enc");
    this.storeMovimentacoes = new SecureStore<Movimentacao>(crypto_, dirDados, "movimentacoes.enc");
  }

  historicoCompleto(): RegistroJournal[] {
    return this.journal.lerRegistrosAtivos();
  }

  historicoPorUsuario(usuarioId: string): RegistroJournal[] {
    return this.historicoCompleto().filter((r) => r.usuarioId === usuarioId);
  }

  historicoPorEntidade(entidade: string): RegistroJournal[] {
    return this.historicoCompleto().filter((r) => r.entidade === entidade);
  }

  /** Relatorio de potencial de recuperacao de valor, usando o polimorfismo de EquipamentoBase. */
  relatorioPotencialRecuperacao(): LinhaRelatorioRecuperacao[] {
    return this.storeEquipamentos.ler().map((dto) => {
      const equipamento = EquipamentoFactory.criarAPartirDeDTO(dto);
      return {
        equipamentoId: equipamento.id,
        tipo: equipamento.tipo,
        status: equipamento.status,
        potencialRecuperacao: equipamento.calcularPotencialRecuperacao(),
        componentesRecuperaveis: equipamento.descreverComponentesRecuperaveis(),
      };
    });
  }

  linhaDoTempoEquipamento(equipamentoId: string): Movimentacao[] {
    return this.storeMovimentacoes
      .ler()
      .filter((m) => m.equipamentoId === equipamentoId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
