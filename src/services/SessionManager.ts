import { Usuario } from "../models/Usuario";

const TIMEOUT_INATIVIDADE_PADRAO_MS = 30 * 60 * 1000; // 30 minutos

interface Sessao {
  usuario: Usuario;
  iniciadaEm: number;
  ultimaAtividadeEm: number;
}

/**
 * SessionManager controla a sessao do usuario autenticado dentro do
 * processo CLI. Toda interacao com um comando "toca" a sessao; se o tempo
 * decorrido desde a ultima atividade ultrapassar o timeout configurado
 * (30 minutos em producao), a sessao e considerada expirada e o usuario
 * deve autenticar-se novamente.
 *
 * O timeout e injetavel via construtor para permitir testes automatizados
 * de expiracao sem esperar 30 minutos reais (ver tests/jornada.ts).
 */
export class SessionManager {
  private sessaoAtual: Sessao | null = null;

  constructor(private readonly timeoutInatividadeMs: number = TIMEOUT_INATIVIDADE_PADRAO_MS) {}

  iniciar(usuario: Usuario): void {
    const agora = Date.now();
    this.sessaoAtual = { usuario, iniciadaEm: agora, ultimaAtividadeEm: agora };
  }

  encerrar(): void {
    this.sessaoAtual = null;
  }

  estaAutenticado(): boolean {
    return this.sessaoAtual !== null && !this.estaExpirada();
  }

  estaExpirada(): boolean {
    if (!this.sessaoAtual) return false;
    return Date.now() - this.sessaoAtual.ultimaAtividadeEm > this.timeoutInatividadeMs;
  }

  /** Deve ser chamado a cada comando processado, para renovar o prazo de inatividade. */
  registrarAtividade(): void {
    if (this.sessaoAtual) this.sessaoAtual.ultimaAtividadeEm = Date.now();
  }

  usuarioAtual(): Usuario | null {
    if (!this.sessaoAtual || this.estaExpirada()) return null;
    return this.sessaoAtual.usuario;
  }

  minutosRestantesDeSessao(): number {
    if (!this.sessaoAtual) return 0;
    const decorrido = Date.now() - this.sessaoAtual.ultimaAtividadeEm;
    return Math.max(0, Math.round((this.timeoutInatividadeMs - decorrido) / 60000));
  }
}
