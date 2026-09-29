import * as crypto from "crypto";

/**
 * CryptoService centraliza toda a criptografia do sistema.
 *
 * - AES-256-CBC (com IV aleatorio por operacao) para criptografia simetrica
 *   de todos os arquivos de persistencia em repouso.
 * - PBKDF2 + SHA-256, com salt aleatorio por usuario, para hashing de senhas
 *   (nunca a senha em texto puro, nunca um hash sem salt).
 *
 * A chave mestra de criptografia (32 bytes / 256 bits) e gerada uma unica vez
 * no provisionamento inicial e fica armazenada em disco (config mestre),
 * fora do controle de versionamento do codigo-fonte.
 */
export class CryptoService {
  private static readonly ALGORITMO_AES = "aes-256-cbc";
  private static readonly TAMANHO_IV = 16; // bytes
  private static readonly TAMANHO_CHAVE = 32; // bytes = 256 bits
  private static readonly ITERACOES_PBKDF2 = 100_000;
  private static readonly TAMANHO_HASH = 32; // bytes

  private readonly chaveMestra: Buffer;

  constructor(chaveMestraHex: string) {
    const chave = Buffer.from(chaveMestraHex, "hex");
    if (chave.length !== CryptoService.TAMANHO_CHAVE) {
      throw new Error(
        `Chave mestra invalida: esperado ${CryptoService.TAMANHO_CHAVE} bytes, recebido ${chave.length}.`
      );
    }
    this.chaveMestra = chave;
  }

  /** Gera uma nova chave mestra de 256 bits, em hexadecimal, para provisionamento inicial. */
  static gerarChaveMestra(): string {
    return crypto.randomBytes(CryptoService.TAMANHO_CHAVE).toString("hex");
  }

  /** Criptografa uma string em texto puro (tipicamente um JSON serializado). */
  criptografar(textoPuro: string): string {
    const iv = crypto.randomBytes(CryptoService.TAMANHO_IV);
    const cifra = crypto.createCipheriv(CryptoService.ALGORITMO_AES, this.chaveMestra, iv);
    const criptografado = Buffer.concat([cifra.update(textoPuro, "utf8"), cifra.final()]);
    // IV vai concatenado ao inicio do payload (nao e segredo, so precisa ser unico).
    return `${iv.toString("hex")}:${criptografado.toString("hex")}`;
  }

  /** Descriptografa um payload gerado por criptografar(). */
  descriptografar(payload: string): string {
    const [ivHex, dadosHex] = payload.split(":");
    if (!ivHex || !dadosHex) {
      throw new Error("Payload criptografado em formato invalido.");
    }
    const iv = Buffer.from(ivHex, "hex");
    const dados = Buffer.from(dadosHex, "hex");
    const decifra = crypto.createDecipheriv(CryptoService.ALGORITMO_AES, this.chaveMestra, iv);
    const decriptografado = Buffer.concat([decifra.update(dados), decifra.final()]);
    return decriptografado.toString("utf8");
  }

  /** Gera hash de senha com salt aleatorio (PBKDF2-SHA256). Retorna "salt:hash", ambos em hex. */
  static hashSenha(senha: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(
      senha,
      salt,
      CryptoService.ITERACOES_PBKDF2,
      CryptoService.TAMANHO_HASH,
      "sha256"
    );
    return `${salt.toString("hex")}:${hash.toString("hex")}`;
  }

  /** Verifica uma senha em texto puro contra um hash armazenado ("salt:hash"). */
  static verificarSenha(senha: string, hashArmazenado: string): boolean {
    const [saltHex, hashHex] = hashArmazenado.split(":");
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const hashEsperado = Buffer.from(hashHex, "hex");
    const hashCalculado = crypto.pbkdf2Sync(
      senha,
      salt,
      CryptoService.ITERACOES_PBKDF2,
      CryptoService.TAMANHO_HASH,
      "sha256"
    );
    // Comparacao em tempo constante para mitigar ataques de timing.
    return (
      hashCalculado.length === hashEsperado.length &&
      crypto.timingSafeEqual(hashCalculado, hashEsperado)
    );
  }

  /** Hash simples (SHA-256) usado para checksums de integridade do journal, nao para senhas. */
  static checksum(conteudo: string): string {
    return crypto.createHash("sha256").update(conteudo, "utf8").digest("hex");
  }
}
