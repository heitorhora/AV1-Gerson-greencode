import { SecureStore } from "../persistence/SecureStore";
import { JournalManager } from "../persistence/JournalManager";
import { CryptoService } from "../crypto/CryptoService";

export interface ParametrosGlobais {
  /** Aliquota de impostos, em percentual (0-100). */
  aliquotaImpostos: number;
  /** Coeficiente de depreciacao de equipamentos, em percentual ao ano (0-100). */
  coeficienteDepreciacao: number;
  atualizadoEm: string;
}

type Resultado<T> = { sucesso: true; dado: T } | { sucesso: false; erros: string[] };

const PADRAO: ParametrosGlobais = { aliquotaImpostos: 0, coeficienteDepreciacao: 20, atualizadoEm: "" };

/**
 * Parametros globais do sistema (papel ADMINISTRADOR): aliquotas de impostos e
 * coeficientes de depreciacao. Persistido criptografado e registrado no journal.
 */
export class ConfigService {
  private readonly store: SecureStore<ParametrosGlobais>;

  constructor(crypto: CryptoService, dirDados: string, private readonly journal: JournalManager) {
    this.store = new SecureStore<ParametrosGlobais>(crypto, dirDados, "parametros.enc");
  }

  obter(): ParametrosGlobais {
    return this.store.ler()[0] ?? { ...PADRAO };
  }

  definir(
    usuarioId: string,
    novos: { aliquotaImpostos?: number; coeficienteDepreciacao?: number }
  ): Resultado<ParametrosGlobais> {
    const erros: string[] = [];
    for (const [nome, valor] of Object.entries(novos)) {
      if (valor === undefined) continue;
      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        erros.push(`Valor invalido para ${nome}: informe um numero entre 0 e 100.`);
      }
    }
    if (erros.length > 0) return { sucesso: false, erros };

    const atual = this.obter();
    const atualizado: ParametrosGlobais = {
      aliquotaImpostos: novos.aliquotaImpostos ?? atual.aliquotaImpostos,
      coeficienteDepreciacao: novos.coeficienteDepreciacao ?? atual.coeficienteDepreciacao,
      atualizadoEm: new Date().toISOString(),
    };

    this.journal.registrar(usuarioId, "ATUALIZAR", "ParametrosGlobais", { anterior: atual, novo: atualizado });
    this.store.escrever([atualizado]);
    return { sucesso: true, dado: atualizado };
  }
}
