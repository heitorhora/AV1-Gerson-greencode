#!/usr/bin/env node
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { AuthService } from "../services/AuthService";
import { SessionManager } from "../services/SessionManager";
import { JournalManager } from "../persistence/JournalManager";
import { SecureStore } from "../persistence/SecureStore";
import { OrganizacaoService } from "../services/OrganizacaoService";
import { LoteService } from "../services/LoteService";
import { EquipamentoService } from "../services/EquipamentoService";
import { AuditoriaService } from "../services/AuditoriaService";
import { ConfigService } from "../services/ConfigService";
import { ComandoRouter, DOMINIOS_VALIDOS } from "./ComandoRouter";
import { parseComando } from "./parser";
import { montarMenu, dominiosDisponiveisParaPapel } from "./Menu";
import { lerSenha } from "./lerSenha";
import { NivelSeveridade as NS } from "../types";
import { Organizacao as OrgModel } from "../models/Organizacao";

declare module 'readline' {
  interface Interface {
    history?: string[];
  }
}

const DIR_DADOS = process.env.GREENCODE_DATA_DIR
  ? path.resolve(process.env.GREENCODE_DATA_DIR)
  : path.resolve(__dirname, "..", "..", "data");

const CAMINHO_HISTORICO = path.join(DIR_DADOS, ".greencode_history");

function log(mensagem: string, severidade: NS = NS.INFO): void {
  const prefixos: Record<NS, string> = {
    [NS.INFO]: "[INFO]",
    [NS.SUCESSO]: "[OK]  ",
    [NS.AVISO]: "[AVISO]",
    [NS.ERRO]: "[ERRO]",
  };
  console.log(`${prefixos[severidade]} ${mensagem}`);
}

function carregarHistorico(): string[] {
  if (!fs.existsSync(CAMINHO_HISTORICO)) return [];
  return fs
    .readFileSync(CAMINHO_HISTORICO, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
}

function salvarHistorico(historico: string[]): void {
  fs.writeFileSync(CAMINHO_HISTORICO, historico.slice(0, 500).join("\n"), "utf8");
}

async function perguntar(rl: readline.Interface, texto: string): Promise<string> {
  return new Promise((resolve) => rl.question(texto, (resp) => resolve(resp.trim())));
}

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("  greencode — plataforma de logistica reversa de eletroeletronicos");
  console.log("=".repeat(70));

  if (!fs.existsSync(DIR_DADOS)) fs.mkdirSync(DIR_DADOS, { recursive: true });

  const authService = new AuthService(DIR_DADOS);
  const sessao = new SessionManager();

  if (authService.precisaProvisionar()) {
    log("Nenhuma configuracao encontrada. Iniciando provisionamento inicial...", NS.AVISO);
    const rlProvisionamento = readline.createInterface({ input: process.stdin, output: process.stdout });
    const usernameAdmin = (await perguntar(rlProvisionamento, "Defina o username do administrador [admin]: ")) || "admin";
    rlProvisionamento.close();
    const senhaAdmin = await lerSenha("Defina a senha do administrador: ");
    const confirmacao = await lerSenha("Confirme a senha: ");

    if (senhaAdmin !== confirmacao || senhaAdmin.length < 6) {
      log("Provisionamento cancelado: senhas nao conferem ou possuem menos de 6 caracteres.", NS.ERRO);
      process.exit(1);
    }

    authService.provisionarInicial(senhaAdmin, usernameAdmin);
    log(`Administrador "${usernameAdmin}" provisionado com sucesso. Chave mestra AES-256 gerada.`, NS.SUCESSO);
  }

  const cryptoService = authService.carregarCryptoService();
  const journal = new JournalManager(cryptoService, DIR_DADOS);
  const removidos = journal.aplicarPoliticaRetencao();
  if (removidos > 0) log(`${removidos} arquivo(s) de journal antigos removidos pela politica de retencao.`, NS.INFO);

  const storeOrganizacoes = new SecureStore<OrgModel>(cryptoService, DIR_DADOS, "organizacoes.enc");
  const orgService = new OrganizacaoService(cryptoService, DIR_DADOS, journal);
  const loteService = new LoteService(cryptoService, DIR_DADOS, journal, storeOrganizacoes);
  const equipamentoService = new EquipamentoService(cryptoService, DIR_DADOS, journal);
  const auditoriaService = new AuditoriaService(cryptoService, DIR_DADOS, journal);

  const configService = new ConfigService(cryptoService, DIR_DADOS, journal);

  const router = new ComandoRouter(
    sessao,
    authService,
    cryptoService,
    DIR_DADOS,
    orgService,
    loteService,
    equipamentoService,
    auditoriaService,
    configService
  );

  // --- Login ---
  let tentativas = 0;
  const MAX_TENTATIVAS = 3;
  while (!sessao.estaAutenticado() && tentativas < MAX_TENTATIVAS) {
    const rlUsuario = readline.createInterface({ input: process.stdin, output: process.stdout });
    const username = await perguntar(rlUsuario, "\nUsuario: ");
    rlUsuario.close();
    const senha = await lerSenha("Senha: ");
    const usuario = authService.login(cryptoService, username, senha);
    if (usuario) {
      sessao.iniciar(usuario);
      log(`Login efetuado com sucesso. Bem-vindo(a), ${usuario.username}!`, NS.SUCESSO);
    } else {
      tentativas++;
      log(`Credenciais invalidas. Tentativa ${tentativas}/${MAX_TENTATIVAS}.`, NS.ERRO);
    }
  }

  if (!sessao.estaAutenticado()) {
    log("Numero maximo de tentativas de login excedido. Encerrando.", NS.ERRO);
    process.exit(1);
  }

  const usuarioLogado = sessao.usuarioAtual()!;
  console.log("\n" + montarMenu(usuarioLogado.papel) + "\n");

  const historicoInicial = carregarHistorico();

  const completer = (linha: string): [string[], string] => {
    const tokens = linha.split(" ");
    const dominiosPermitidos = dominiosDisponiveisParaPapel(usuarioLogado.papel);

    if (tokens.length <= 1) {
      const parcial = tokens[0] ?? "";
      const opcoes = dominiosPermitidos.filter((d) => d.startsWith(parcial));
      return [opcoes.length ? opcoes : dominiosPermitidos, parcial];
    }
    return [[], linha];
  };

  // O @types/node nao declara "history"/"historySize" na assinatura de createInterface
  // nem "history" na interface retornada, embora ambos existam em tempo de execucao.
  // O cast evita erro de compilacao do TypeScript sem afetar o comportamento.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    history: historicoInicial,
    historySize: 500,
    prompt: `greencode(${usuarioLogado.papel})> `,
  } as readline.ReadLineOptions) as readline.Interface & { history: string[] };

  rl.prompt();

  rl.on("line", (linha) => {
    if (linha.trim().length === 0) {
      rl.prompt();
      return;
    }

    if (sessao.estaExpirada()) {
      log("Sua sessao expirou por inatividade (30 minutos). Encerrando o programa por seguranca.", NS.ERRO);
      salvarHistorico(rl.history ?? []);
      process.exit(0);
    }

    const comando = parseComando(linha);
    if (!comando) {
      rl.prompt();
      return;
    }

    if (comando.dominio === "ajuda") {
      console.log("\n" + montarMenu(usuarioLogado.papel) + "\n");
      rl.prompt();
      return;
    }

    if (comando.dominio === "sair") {
      log("Encerrando sessao. Ate logo!", NS.INFO);
      salvarHistorico(rl.history ?? []);
      rl.close();
      process.exit(0);
    }

    const resposta = router.executar(comando);
    log(resposta.mensagem, resposta.severidade);
    if (resposta.dados !== undefined) {
      console.log(JSON.stringify(resposta.dados, null, 2));
    }
    log(`(sessao expira em ${sessao.minutosRestantesDeSessao()} min de inatividade)`, NS.INFO);

    rl.prompt();
  });

  rl.on("close", () => {
    salvarHistorico(rl.history ?? []);
    console.log("\nSessao encerrada.");
    process.exit(0);
  });
}

main().catch((erro) => {
  console.error("Erro fatal:", erro);
  process.exit(1);
});
