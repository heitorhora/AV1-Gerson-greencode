import { SecureStore } from "../persistence/SecureStore";
import { JournalManager } from "../persistence/JournalManager";
import { CryptoService } from "../crypto/CryptoService";
import { Organizacao } from "../models/Organizacao";
import { ValidadorOrganizacao } from "../validators/ValidadorOrganizacao";
import { normalizarCNPJ } from "../utils/cnpj";
import { ResultadoValidacao } from "../types";

export type ResultadoOperacao<T> =
  | { sucesso: true; dado: T }
  | { sucesso: false; erros: string[] };

export class OrganizacaoService {
  private readonly store: SecureStore<Organizacao>;
  private readonly validador = new ValidadorOrganizacao();

  constructor(crypto: CryptoService, dirDados: string, private readonly journal: JournalManager) {
    this.store = new SecureStore<Organizacao>(crypto, dirDados, "organizacoes.enc");
  }

  cadastrar(
    usuarioId: string,
    dados: { cnpj: string; razaoSocial: string; segmento: string; numeroContrato: string; vigenciaInicio: string; vigenciaFim: string }
  ): ResultadoOperacao<Organizacao> {
    const existentes = this.store.ler();
    const resultado: ResultadoValidacao = this.validador.validar({
      organizacao: { id: dados.cnpj, razaoSocial: dados.razaoSocial },
      organizacoesExistentes: existentes,
    });

    if (!resultado.valido) {
      return { sucesso: false, erros: resultado.erros };
    }

    const organizacao: Organizacao = {
      id: normalizarCNPJ(dados.cnpj),
      razaoSocial: dados.razaoSocial,
      segmento: dados.segmento,
      contrato: {
        numero: dados.numeroContrato,
        vigenciaInicio: dados.vigenciaInicio,
        vigenciaFim: dados.vigenciaFim,
      },
      criadoEm: new Date().toISOString(),
    };

    this.journal.registrar(usuarioId, "CRIAR", "Organizacao", organizacao);
    this.store.adicionar(organizacao);

    return { sucesso: true, dado: organizacao };
  }

  listar(): Organizacao[] {
    return this.store.ler();
  }

  buscarPorId(cnpj: string): Organizacao | undefined {
    const cnpjNormalizado = normalizarCNPJ(cnpj);
    return this.store.ler().find((o) => o.id === cnpjNormalizado);
  }
}
