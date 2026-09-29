import * as crypto from "crypto";
import { SecureStore } from "../persistence/SecureStore";
import { JournalManager } from "../persistence/JournalManager";
import { CryptoService } from "../crypto/CryptoService";
import { EquipamentoDTO, HistoricoEstado } from "../models/Equipamento";
import { EquipamentoFactory } from "../factories/EquipamentoFactory";
import { Movimentacao } from "../models/Movimentacao";
import {
  ValidadorMudancaEstadoFisico,
  ValidadorTransicaoStatus,
} from "../validators/ValidadorEquipamento";
import { EstadoFisico, StatusEquipamento, TipoEquipamento } from "../types";
import { ResultadoOperacao } from "./OrganizacaoService";

export class EquipamentoService {
  private readonly storeEquipamentos: SecureStore<EquipamentoDTO>;
  private readonly storeMovimentacoes: SecureStore<Movimentacao>;
  private readonly validadorTransicao = new ValidadorTransicaoStatus();
  private readonly validadorEstado = new ValidadorMudancaEstadoFisico();

  constructor(crypto_: CryptoService, dirDados: string, private readonly journal: JournalManager) {
    this.storeEquipamentos = new SecureStore<EquipamentoDTO>(crypto_, dirDados, "equipamentos.enc");
    this.storeMovimentacoes = new SecureStore<Movimentacao>(crypto_, dirDados, "movimentacoes.enc");
  }

  cadastrarNoLote(
    usuarioId: string,
    dados: { loteId: string; tipo: TipoEquipamento; codigoBarras: string }
  ): ResultadoOperacao<EquipamentoDTO> {
    const equipamento = EquipamentoFactory.criarNovo({
      id: crypto.randomUUID(),
      loteId: dados.loteId,
      tipo: dados.tipo,
      codigoBarras: dados.codigoBarras,
    });

    const dto = equipamento.toDTO();
    this.journal.registrar(usuarioId, "CRIAR", "Equipamento", dto);
    this.storeEquipamentos.adicionar(dto);

    return { sucesso: true, dado: dto };
  }

  listarPorLote(loteId: string): EquipamentoDTO[] {
    return this.storeEquipamentos.ler().filter((e) => e.loteId === loteId);
  }

  buscarPorId(id: string): EquipamentoDTO | undefined {
    return this.storeEquipamentos.ler().find((e) => e.id === id);
  }

  /** Registra a triagem: define o estado fisico observado e avanca o status para TRIADO. */
  triar(
    usuarioId: string,
    id: string,
    estadoFisicoObservado: EstadoFisico,
    justificativa?: string
  ): ResultadoOperacao<EquipamentoDTO> {
    const equipamento = this.buscarPorId(id);
    if (!equipamento) return { sucesso: false, erros: [`Equipamento ${id} nao encontrado.`] };

    const resultadoEstado = this.validadorEstado.validar({
      estadoAnterior: equipamento.estadoFisico,
      estadoNovo: estadoFisicoObservado,
      justificativa,
    });
    if (!resultadoEstado.valido) return { sucesso: false, erros: resultadoEstado.erros };

    const resultadoTransicao = this.validadorTransicao.validar({
      statusAtual: equipamento.status,
      statusDesejado: StatusEquipamento.TRIADO,
    });
    if (!resultadoTransicao.valido) return { sucesso: false, erros: resultadoTransicao.erros };

    const historico: HistoricoEstado = {
      estadoAnterior: equipamento.estadoFisico,
      estadoNovo: estadoFisicoObservado,
      justificativa,
      timestamp: new Date().toISOString(),
      usuarioId,
    };

    this.registrarMovimentacao(usuarioId, equipamento.id, equipamento.status, StatusEquipamento.TRIADO, justificativa);

    this.journal.registrar(usuarioId, "TRIAGEM", "Equipamento", { id, historico });
    this.storeEquipamentos.atualizar(
      (e) => e.id === id,
      (e) => ({
        ...e,
        estadoFisico: estadoFisicoObservado,
        status: StatusEquipamento.TRIADO,
        historicoEstados: [...e.historicoEstados, historico],
      })
    );

    return { sucesso: true, dado: { ...equipamento, estadoFisico: estadoFisicoObservado, status: StatusEquipamento.TRIADO } };
  }

  /** Move o equipamento para um novo status operacional (ex.: DESMONTE, RECICLAGEM, DESCARTE_SEGURO). */
  moverStatus(
    usuarioId: string,
    id: string,
    novoStatus: StatusEquipamento,
    observacao?: string
  ): ResultadoOperacao<EquipamentoDTO> {
    const equipamento = this.buscarPorId(id);
    if (!equipamento) return { sucesso: false, erros: [`Equipamento ${id} nao encontrado.`] };

    const resultado = this.validadorTransicao.validar({
      statusAtual: equipamento.status,
      statusDesejado: novoStatus,
    });
    if (!resultado.valido) return { sucesso: false, erros: resultado.erros };

    this.registrarMovimentacao(usuarioId, id, equipamento.status, novoStatus, observacao);

    this.journal.registrar(usuarioId, "MOVIMENTAR", "Equipamento", { id, de: equipamento.status, para: novoStatus });
    this.storeEquipamentos.atualizar(
      (e) => e.id === id,
      (e) => ({ ...e, status: novoStatus })
    );

    return { sucesso: true, dado: { ...equipamento, status: novoStatus } };
  }

  /** Retorna a linha do tempo completa de um equipamento (para rastreabilidade / auditoria). */
  rastrear(id: string): { equipamento: EquipamentoDTO | undefined; movimentacoes: Movimentacao[] } {
    return {
      equipamento: this.buscarPorId(id),
      movimentacoes: this.storeMovimentacoes.ler().filter((m) => m.equipamentoId === id),
    };
  }

  private registrarMovimentacao(
    usuarioId: string,
    equipamentoId: string,
    statusAnterior: StatusEquipamento,
    statusNovo: StatusEquipamento,
    observacao?: string
  ): void {
    const movimentacao: Movimentacao = {
      id: crypto.randomUUID(),
      equipamentoId,
      statusAnterior,
      statusNovo,
      timestamp: new Date().toISOString(),
      usuarioId,
      observacao,
    };
    this.storeMovimentacoes.adicionar(movimentacao);
  }
}
