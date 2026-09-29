import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { CryptoService } from "../crypto/CryptoService";
import { SecureStore } from "../persistence/SecureStore";
import { Usuario } from "../models/Usuario";
import { Papel } from "../types";

interface ConfigMestre {
  chaveMestraHex: string;
  criadoEm: string;
  versao: string;
}

/**
 * AuthService cuida do ciclo de vida de autenticacao:
 *
 * 1) Provisionamento inicial: na primeira execucao, nao existe arquivo de
 *    configuracao mestre. O sistema gera a chave de criptografia AES-256
 *    (usada por todo o restante da persistencia) e cadastra o primeiro
 *    administrador com a senha definida pelo operador.
 * 2) Login: valida usuario/senha comparando o hash PBKDF2-SHA256 salvo,
 *    nunca a senha em texto puro.
 *
 * NOTA DE SEGURANCA: a chave mestra fica em config.json, com permissao de
 * arquivo restrita ao dono (0600). Um ambiente de producao real deveria
 * mover esse segredo para uma variavel de ambiente ou um cofre de segredos
 * (KMS/HSM) — ver docs/SEGURANCA.md para a discussao completa desse trade-off.
 */
export class AuthService {
  private readonly caminhoConfig: string;

  constructor(private readonly dirDados: string) {
    this.caminhoConfig = path.join(dirDados, "config.json");
  }

  precisaProvisionar(): boolean {
    return !fs.existsSync(this.caminhoConfig);
  }

  /** Executa o provisionamento inicial: gera chave mestra e cria o primeiro administrador. */
  provisionarInicial(senhaAdmin: string, usernameAdmin: string = "admin"): CryptoService {
    if (!fs.existsSync(this.dirDados)) fs.mkdirSync(this.dirDados, { recursive: true });

    const chaveMestraHex = CryptoService.gerarChaveMestra();
    const config: ConfigMestre = {
      chaveMestraHex,
      criadoEm: new Date().toISOString(),
      versao: "1.0.0",
    };
    fs.writeFileSync(this.caminhoConfig, JSON.stringify(config, null, 2), { mode: 0o600 });

    const cryptoService = new CryptoService(chaveMestraHex);
    const storeUsuarios = new SecureStore<Usuario>(cryptoService, this.dirDados, "usuarios.enc");

    const admin: Usuario = {
      id: crypto.randomUUID(),
      username: usernameAdmin,
      hashSenha: CryptoService.hashSenha(senhaAdmin),
      papel: Papel.ADMINISTRADOR,
      criadoEm: new Date().toISOString(),
      ativo: true,
    };
    storeUsuarios.escrever([admin]);

    return cryptoService;
  }

  /** Carrega a chave mestra existente e retorna um CryptoService pronto para uso. */
  carregarCryptoService(): CryptoService {
    if (!fs.existsSync(this.caminhoConfig)) {
      throw new Error("Sistema nao provisionado. Execute o provisionamento inicial primeiro.");
    }
    const config = JSON.parse(fs.readFileSync(this.caminhoConfig, "utf8")) as ConfigMestre;
    return new CryptoService(config.chaveMestraHex);
  }

  /** Autentica um usuario. Retorna o Usuario em caso de sucesso, ou null em caso de falha. */
  login(cryptoService: CryptoService, username: string, senha: string): Usuario | null {
    const storeUsuarios = new SecureStore<Usuario>(cryptoService, this.dirDados, "usuarios.enc");
    const usuario = storeUsuarios.ler().find((u) => u.username === username);
    if (!usuario || !usuario.ativo) return null;
    if (!CryptoService.verificarSenha(senha, usuario.hashSenha)) return null;
    return usuario;
  }
}
