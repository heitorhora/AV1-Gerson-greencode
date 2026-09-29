import * as fs from "fs";
import * as path from "path";
import { CryptoService } from "../crypto/CryptoService";

/**
 * SecureStore persiste colecoes de entidades em arquivos individuais,
 * sempre criptografados com AES-256, e sempre por escrita atomica:
 * o conteudo novo e gravado em um arquivo temporario e so entao
 * renomeado sobre o arquivo definitivo (rename e atomico no mesmo
 * sistema de arquivos), evitando corrupcao de dados em caso de
 * interrupcao brusca do processo.
 */
export class SecureStore<T> {
  private readonly caminhoArquivo: string;

  constructor(private readonly crypto: CryptoService, dirDados: string, nomeArquivo: string) {
    if (!fs.existsSync(dirDados)) {
      fs.mkdirSync(dirDados, { recursive: true });
    }
    this.caminhoArquivo = path.join(dirDados, nomeArquivo);
  }

  existe(): boolean {
    return fs.existsSync(this.caminhoArquivo);
  }

  /** Le e decriptografa a colecao completa. Retorna array vazio se o arquivo ainda nao existe. */
  ler(): T[] {
    if (!this.existe()) return [];
    const conteudoCriptografado = fs.readFileSync(this.caminhoArquivo, "utf8").trim();
    if (!conteudoCriptografado) return [];
    const conteudoPuro = this.crypto.descriptografar(conteudoCriptografado);
    return JSON.parse(conteudoPuro) as T[];
  }

  /** Grava a colecao completa de forma atomica (arquivo temporario + rename). */
  escrever(colecao: T[]): void {
    const conteudoPuro = JSON.stringify(colecao, null, 2);
    const conteudoCriptografado = this.crypto.criptografar(conteudoPuro);

    const arquivoTemp = `${this.caminhoArquivo}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(arquivoTemp, conteudoCriptografado, { encoding: "utf8" });
    fs.renameSync(arquivoTemp, this.caminhoArquivo); // operacao atomica
  }

  /** Adiciona um item e persiste a colecao inteira atomicamente. */
  adicionar(item: T): void {
    const colecao = this.ler();
    colecao.push(item);
    this.escrever(colecao);
  }

  /** Atualiza itens conforme predicado e persiste atomicamente. Retorna quantos foram alterados. */
  atualizar(predicado: (item: T) => boolean, atualizador: (item: T) => T): number {
    const colecao = this.ler();
    let alterados = 0;
    const nova = colecao.map((item) => {
      if (predicado(item)) {
        alterados++;
        return atualizador(item);
      }
      return item;
    });
    if (alterados > 0) this.escrever(nova);
    return alterados;
  }
}
