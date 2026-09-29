import { ResultadoValidacao } from "../types";

/**
 * Classe abstrata que define o contrato de todo validador de regra de
 * negocio do sistema. Cada subclasse concentra-se em uma unica entidade
 * (Organizacao, Lote, Equipamento), permitindo compor validacoes sem
 * duplicar a logica de acumulo de erros.
 */
export abstract class Validador<T> {
  protected erros: string[] = [];

  /** Ponto de extensao: cada subclasse implementa suas proprias regras. */
  protected abstract executar(item: T): void;

  validar(item: T): ResultadoValidacao {
    this.erros = [];
    this.executar(item);
    return { valido: this.erros.length === 0, erros: [...this.erros] };
  }

  protected adicionarErro(mensagem: string): void {
    this.erros.push(mensagem);
  }
}
