import * as fs from "fs";
import * as path from "path";
import { CryptoService } from "../crypto/CryptoService";

export interface RegistroJournal {
  timestamp: string;
  usuarioId: string;
  operacao: string;
  entidade: string;
  dados: unknown;
  checksum: string;
}

/**
 * JournalManager implementa um log de transacoes imutavel (write-ahead log):
 * toda operacao de escrita e primeiro registrada aqui, de forma append-only
 * e criptografada, antes de ser aplicada ao estado corrente. Isso garante
 * rastreabilidade completa e permite reconstruir/auditar o historico mesmo
 * que o arquivo de estado seja corrompido.
 *
 * Politica de retencao: os journals sao mantidos por, no minimo, 180 dias.
 * Rotacao automatica ocorre quando o arquivo ativo ultrapassa 10 MB; o
 * arquivo antigo e renomeado com timestamp e um novo arquivo ativo e criado.
 */
export class JournalManager {
  private static readonly TAMANHO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  private static readonly RETENCAO_DIAS = 180;

  private readonly dirJournal: string;
  private readonly arquivoAtivo: string;

  constructor(private readonly crypto: CryptoService, dirDados: string) {
    this.dirJournal = path.join(dirDados, "journal");
    if (!fs.existsSync(this.dirJournal)) {
      fs.mkdirSync(this.dirJournal, { recursive: true });
    }
    this.arquivoAtivo = path.join(this.dirJournal, "journal.log");
  }

  /** Registra uma transacao no journal ativo (append-only). Chamar ANTES de persistir o estado. */
  registrar(usuarioId: string, operacao: string, entidade: string, dados: unknown): void {
    this.rotacionarSeNecessario();

    const registro: RegistroJournal = {
      timestamp: new Date().toISOString(),
      usuarioId,
      operacao,
      entidade,
      dados,
      checksum: CryptoService.checksum(JSON.stringify({ usuarioId, operacao, entidade, dados })),
    };

    const linhaCriptografada = this.crypto.criptografar(JSON.stringify(registro));
    fs.appendFileSync(this.arquivoAtivo, linhaCriptografada + "\n", { encoding: "utf8" });
  }

  /** Le e decriptografa todos os registros do journal ativo, em ordem cronologica. */
  lerRegistrosAtivos(): RegistroJournal[] {
    if (!fs.existsSync(this.arquivoAtivo)) return [];
    const linhas = fs
      .readFileSync(this.arquivoAtivo, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);

    return linhas.map((linha) => JSON.parse(this.crypto.descriptografar(linha)) as RegistroJournal);
  }

  /** Rotaciona o arquivo ativo se ele exceder o tamanho maximo configurado. */
  private rotacionarSeNecessario(): void {
    if (!fs.existsSync(this.arquivoAtivo)) return;
    const { size } = fs.statSync(this.arquivoAtivo);
    if (size < JournalManager.TAMANHO_MAX_BYTES) return;

    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const destino = path.join(this.dirJournal, `journal-${carimbo}.log`);
    fs.renameSync(this.arquivoAtivo, destino);
  }

  /** Remove journals rotacionados mais antigos que a politica de retencao (180 dias). */
  aplicarPoliticaRetencao(): number {
    const arquivos = fs.readdirSync(this.dirJournal).filter((f) => f !== "journal.log");
    const limite = Date.now() - JournalManager.RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    let removidos = 0;

    for (const arquivo of arquivos) {
      const caminho = path.join(this.dirJournal, arquivo);
      const { mtimeMs } = fs.statSync(caminho);
      if (mtimeMs < limite) {
        fs.unlinkSync(caminho);
        removidos++;
      }
    }
    return removidos;
  }
}
