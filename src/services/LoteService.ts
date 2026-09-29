import * as crypto from "crypto";
import { SecureStore } from "../persistence/SecureStore";
import { JournalManager } from "../persistence/JournalManager";
import { CryptoService } from "../crypto/CryptoService";
import { Lote } from "../models/Lote";
import { Organizacao } from "../models/Organizacao";
import { ValidadorLote } from "../validators/ValidadorLote";
import { StatusLote } from "../types";
import { ResultadoOperacao } from "./OrganizacaoService";

export class LoteService {
  private readonly store: SecureStore<Lote>;
  private readonly validador = new ValidadorLote();

  constructor(
    crypto_: CryptoService,
    dirDados: string,
    private readonly journal: JournalManager,
    private readonly storeOrganizacoes: SecureStore<Organizacao>
  ) {
    this.store = new SecureStore<Lote>(crypto_, dirDados, "lotes.enc");
  }

  criar(
    usuarioId: string,
    dados: { orgId: string; notaFiscal: string; transportadora: string; dataEntrada: string }
  ): ResultadoOperacao<Lote> {
    const organizacoesIds = this.storeOrganizacoes.ler().map((o) => o.id);
    const resultado = this.validador.validar({
      dataEntrada: dados.dataEntrada,
      orgId: dados.orgId,
      organizacoesExistentesIds: organizacoesIds,
    });

    if (!resultado.valido) {
      return { sucesso: false, erros: resultado.erros };
    }

    const lote: Lote = {
      id: crypto.randomUUID(),
      orgId: dados.orgId,
      notaFiscal: dados.notaFiscal,
      transportadora: dados.transportadora,
      dataEntrada: dados.dataEntrada,
      status: StatusLote.RECEBIDO,
      criadoEm: new Date().toISOString(),
    };

    this.journal.registrar(usuarioId, "CRIAR", "Lote", lote);
    this.store.adicionar(lote);

    return { sucesso: true, dado: lote };
  }

  listar(): Lote[] {
    return this.store.ler();
  }

  buscarPorId(id: string): Lote | undefined {
    return this.store.ler().find((l) => l.id === id);
  }

  atualizarStatus(usuarioId: string, id: string, novoStatus: StatusLote): ResultadoOperacao<Lote> {
    const lote = this.buscarPorId(id);
    if (!lote) return { sucesso: false, erros: [`Lote ${id} nao encontrado.`] };

    this.journal.registrar(usuarioId, "ATUALIZAR_STATUS", "Lote", { id, de: lote.status, para: novoStatus });
    this.store.atualizar(
      (l) => l.id === id,
      (l) => ({ ...l, status: novoStatus })
    );

    return { sucesso: true, dado: { ...lote, status: novoStatus } };
  }
}
