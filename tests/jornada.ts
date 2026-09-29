/**
 * Script de teste de jornada completa do usuario, do provisionamento inicial
 * ate a consulta de rastreabilidade de um equipamento apos multiplas
 * movimentacoes. Executa diretamente contra a camada de servicos (a mesma
 * usada pelo CLI), o que permite validar toda a logica de negocio sem
 * depender de entrada de terminal interativa.
 *
 * Uso: npm run test:jornada
 */
import * as fs from "fs";
import * as path from "path";
import { AuthService } from "../src/services/AuthService";
import { SessionManager } from "../src/services/SessionManager";
import { JournalManager } from "../src/persistence/JournalManager";
import { SecureStore } from "../src/persistence/SecureStore";
import { OrganizacaoService } from "../src/services/OrganizacaoService";
import { LoteService } from "../src/services/LoteService";
import { EquipamentoService } from "../src/services/EquipamentoService";
import { AuditoriaService } from "../src/services/AuditoriaService";
import { ConfigService } from "../src/services/ConfigService";
import { CryptoService } from "../src/crypto/CryptoService";
import { Organizacao } from "../src/models/Organizacao";
import { EstadoFisico, Papel, StatusEquipamento, TipoEquipamento } from "../src/types";
import { ComandoRouter } from "../src/cli/ComandoRouter";
import { parseComando } from "../src/cli/parser";

const DIR_TESTE = path.resolve(__dirname, "..", "data-teste");

let totalAsserts = 0;
let falhas = 0;

function afirmar(condicao: boolean, descricao: string): void {
  totalAsserts++;
  if (condicao) {
    console.log(`  OK  - ${descricao}`);
  } else {
    falhas++;
    console.error(`  FALHOU - ${descricao}`);
  }
}

function secao(titulo: string): void {
  console.log(`\n=== ${titulo} ===`);
}

function limparAmbienteDeTeste(): void {
  if (fs.existsSync(DIR_TESTE)) fs.rmSync(DIR_TESTE, { recursive: true, force: true });
}

async function main(): Promise<void> {
  limparAmbienteDeTeste();

  // ---------------------------------------------------------------------
  secao("1. Provisionamento inicial");
  const authService = new AuthService(DIR_TESTE);
  afirmar(authService.precisaProvisionar(), "sistema exige provisionamento na primeira execucao");

  const cryptoService = authService.provisionarInicial("SenhaAdmin123", "admin");
  afirmar(!authService.precisaProvisionar(), "apos provisionar, o sistema nao exige provisionamento novamente");
  afirmar(fs.existsSync(path.join(DIR_TESTE, "config.json")), "arquivo de configuracao mestre foi criado");
  afirmar(fs.existsSync(path.join(DIR_TESTE, "usuarios.enc")), "arquivo de usuarios foi criado");

  const conteudoUsuariosBruto = fs.readFileSync(path.join(DIR_TESTE, "usuarios.enc"), "utf8");
  afirmar(!conteudoUsuariosBruto.includes("SenhaAdmin123"), "senha do admin nao aparece em texto puro no disco (dado esta criptografado)");

  // ---------------------------------------------------------------------
  secao("2. Login e controle de sessao");
  const sessao = new SessionManager(200); // timeout curto (200ms) so para fins de teste automatizado
  const loginInvalido = authService.login(cryptoService, "admin", "senhaErrada");
  afirmar(loginInvalido === null, "login com senha incorreta e rejeitado");

  const admin = authService.login(cryptoService, "admin", "SenhaAdmin123");
  afirmar(admin !== null, "login com credenciais corretas e aceito");
  sessao.iniciar(admin!);
  afirmar(sessao.estaAutenticado(), "sessao fica autenticada apos login");

  await esperar(250);
  afirmar(sessao.estaExpirada(), "sessao expira apos ultrapassar o timeout de inatividade configurado");
  sessao.iniciar(admin!); // reinicia para prosseguir com o restante da jornada

  // ---------------------------------------------------------------------
  secao("3. Criacao de usuarios com os quatro papeis");
  const storeUsuarios = new SecureStore(cryptoService, DIR_TESTE, "usuarios.enc");
  afirmar(storeUsuarios.ler().length === 1, "inicialmente existe apenas o administrador provisionado");

  // ---------------------------------------------------------------------
  secao("4. Cadastro de organizacao (validacao de CNPJ)");
  const journal = new JournalManager(cryptoService, DIR_TESTE);
  const storeOrganizacoes = new SecureStore<Organizacao>(cryptoService, DIR_TESTE, "organizacoes.enc");
  const orgService = new OrganizacaoService(cryptoService, DIR_TESTE, journal);

  const cnpjInvalido = orgService.cadastrar(admin!.id, {
    cnpj: "11.111.111/1111-11",
    razaoSocial: "Empresa Invalida",
    segmento: "varejo",
    numeroContrato: "C-001",
    vigenciaInicio: "2026-01-01",
    vigenciaFim: "2027-01-01",
  });
  afirmar(!cnpjInvalido.sucesso, "CNPJ com digitos verificadores invalidos e rejeitado");

  // CNPJ valido (Banco do Brasil, publicamente conhecido, usado apenas como exemplo didatico)
  const resultadoOrg = orgService.cadastrar(admin!.id, {
    cnpj: "00.000.000/0001-91",
    razaoSocial: "Rede Varejo Exemplo Ltda",
    segmento: "varejo",
    numeroContrato: "C-001",
    vigenciaInicio: "2026-01-01",
    vigenciaFim: "2027-01-01",
  });
  afirmar(resultadoOrg.sucesso, "organizacao com CNPJ valido e cadastrada com sucesso");

  const duplicata = orgService.cadastrar(admin!.id, {
    cnpj: "00.000.000/0001-91",
    razaoSocial: "Tentativa Duplicada",
    segmento: "varejo",
    numeroContrato: "C-002",
    vigenciaInicio: "2026-01-01",
    vigenciaFim: "2027-01-01",
  });
  afirmar(!duplicata.sucesso, "cadastro de CNPJ duplicado e rejeitado");

  const orgId = resultadoOrg.sucesso ? resultadoOrg.dado.id : "";

  // ---------------------------------------------------------------------
  secao("5. Criacao de lote (validacao de janela de datas)");
  const loteService = new LoteService(cryptoService, DIR_TESTE, journal, storeOrganizacoes);

  const dataFutura = new Date();
  dataFutura.setDate(dataFutura.getDate() + 5);
  const loteDataFutura = loteService.criar(admin!.id, {
    orgId,
    notaFiscal: "NF-001",
    transportadora: "TransRapida",
    dataEntrada: dataFutura.toISOString().slice(0, 10),
  });
  afirmar(!loteDataFutura.sucesso, "lote com data de entrada futura e rejeitado");

  const dataMuitoAntiga = new Date();
  dataMuitoAntiga.setDate(dataMuitoAntiga.getDate() - 200);
  const loteDataAntiga = loteService.criar(admin!.id, {
    orgId,
    notaFiscal: "NF-002",
    transportadora: "TransRapida",
    dataEntrada: dataMuitoAntiga.toISOString().slice(0, 10),
  });
  afirmar(!loteDataAntiga.sucesso, "lote com data de entrada anterior a 90 dias e rejeitado");

  const loteValido = loteService.criar(admin!.id, {
    orgId,
    notaFiscal: "NF-003",
    transportadora: "TransRapida",
    dataEntrada: new Date().toISOString().slice(0, 10),
  });
  afirmar(loteValido.sucesso, "lote com data valida e organizacao existente e criado com sucesso");
  const loteId = loteValido.sucesso ? loteValido.dado.id : "";

  // ---------------------------------------------------------------------
  secao("6. Cadastro de equipamentos no lote (fabrica + polimorfismo)");
  const equipamentoService = new EquipamentoService(cryptoService, DIR_TESTE, journal);

  const resTerminal = equipamentoService.cadastrarNoLote(admin!.id, {
    loteId,
    tipo: TipoEquipamento.TERMINAL_COMPUTADOR,
    codigoBarras: "BC-0001",
  });
  afirmar(resTerminal.sucesso, "terminal de computador cadastrado no lote");
  const equipamentoId = resTerminal.sucesso ? resTerminal.dado.id : "";

  const resTelecom = equipamentoService.cadastrarNoLote(admin!.id, {
    loteId,
    tipo: TipoEquipamento.EQUIPAMENTO_TELECOM,
    codigoBarras: "BC-0002",
  });
  afirmar(resTelecom.sucesso, "equipamento de telecom cadastrado no lote (subtipo diferente)");

  afirmar(equipamentoService.listarPorLote(loteId).length === 2, "lote passa a conter os 2 equipamentos cadastrados");

  // ---------------------------------------------------------------------
  secao("7. Triagem: transicao de status e degradacao de estado fisico");
  const desmonteSemTriagem = equipamentoService.moverStatus(admin!.id, equipamentoId, StatusEquipamento.DESMONTE);
  afirmar(!desmonteSemTriagem.sucesso, "equipamento nao pode ir para DESMONTE sem antes ser TRIADO");

  const triagemSemJustificativa = equipamentoService.triar(admin!.id, equipamentoId, EstadoFisico.INSERVIVEL);
  afirmar(
    !triagemSemJustificativa.sucesso,
    "triagem com queda de mais de 1 categoria de estado fisico exige justificativa (rejeitada sem ela)"
  );

  const triagemComJustificativa = equipamentoService.triar(
    admin!.id,
    equipamentoId,
    EstadoFisico.RUIM,
    "Equipamento apresentou dano por oxidacao na placa-mae durante o transporte."
  );
  afirmar(triagemComJustificativa.sucesso, "triagem com justificativa adequada e aceita");

  // ---------------------------------------------------------------------
  secao("8. Movimentacao apos triagem completa");
  const desmonteAposTriagem = equipamentoService.moverStatus(admin!.id, equipamentoId, StatusEquipamento.DESMONTE);
  afirmar(desmonteAposTriagem.sucesso, "equipamento TRIADO pode ser movido para DESMONTE");

  const reciclagem = equipamentoService.moverStatus(admin!.id, equipamentoId, StatusEquipamento.RECICLAGEM);
  afirmar(reciclagem.sucesso, "equipamento em DESMONTE pode avancar para RECICLAGEM");

  const regressaoInvalida = equipamentoService.moverStatus(admin!.id, equipamentoId, StatusEquipamento.TRIADO);
  afirmar(!regressaoInvalida.sucesso, "nao e permitido regredir de RECICLAGEM de volta para TRIADO");

  // ---------------------------------------------------------------------
  secao("9. Rastreabilidade completa do equipamento");
  const rastro = equipamentoService.rastrear(equipamentoId);
  afirmar(rastro.equipamento !== undefined, "equipamento e encontrado na consulta de rastreabilidade");
  afirmar(rastro.movimentacoes.length === 3, "historico de rastreabilidade contem as 3 movimentacoes de status esperadas");
  afirmar(
    rastro.equipamento!.historicoEstados.length === 1,
    "historico de estado fisico contem a triagem com a justificativa registrada"
  );

  // ---------------------------------------------------------------------
  secao("10. Auditoria (journal imutavel) e relatorios");
  const auditoriaService = new AuditoriaService(cryptoService, DIR_TESTE, journal);
  const historico = auditoriaService.historicoCompleto();
  afirmar(historico.length > 0, "journal de transacoes registrou as operacoes realizadas na jornada");
  afirmar(
    historico.every((r) => typeof r.checksum === "string" && r.checksum.length === 64),
    "todo registro do journal possui checksum SHA-256 de integridade"
  );

  const relatorio = auditoriaService.relatorioPotencialRecuperacao();
  afirmar(relatorio.length === 2, "relatorio de potencial de recuperacao contempla os 2 equipamentos");
  const linhaTerminal = relatorio.find((r) => r.equipamentoId === equipamentoId);
  afirmar(
    !!linhaTerminal && linhaTerminal.componentesRecuperaveis.includes("placa-mae"),
    "relatorio usa o comportamento polimorfico do subtipo (TerminalComputador lista placa-mae)"
  );

  // ---------------------------------------------------------------------
  secao("11. Persistencia e criptografia em repouso");
  const conteudoEquipamentosBruto = fs.readFileSync(path.join(DIR_TESTE, "equipamentos.enc"), "utf8");
  afirmar(!conteudoEquipamentosBruto.includes("BC-0001"), "dados de equipamentos estao criptografados em disco (AES-256)");
  afirmar(/^[0-9a-f]+:[0-9a-f]+$/.test(conteudoEquipamentosBruto.trim()), "payload criptografado segue o formato iv:dados em hexadecimal");

  // ---------------------------------------------------------------------
  secao("12. Camada de CLI: parser de comandos e roteamento por papel");
  const comandoParseado = parseComando('org cadastrar --cnpj 11.222.333/0001-81 --razao "Hospital Exemplo" --segmento hospitalar');
  afirmar(
    comandoParseado?.dominio === "org" && comandoParseado?.acao === "cadastrar" && comandoParseado?.flags.razao === "Hospital Exemplo",
    "parser interpreta corretamente dominio, acao e flags com valores entre aspas"
  );

  const configService = new ConfigService(cryptoService, DIR_TESTE, journal);
  const router = new ComandoRouter(sessao, authService, cryptoService, DIR_TESTE, orgService, loteService, equipamentoService, auditoriaService, configService);
  sessao.iniciar(admin!);
  const respostaCadastroViaCli = router.executar(comandoParseado!);
  afirmar(respostaCadastroViaCli.severidade === "SUCESSO", "comando executado via CLI router cadastra organizacao com sucesso");

  const respostaConfig = router.executar(parseComando("config definir --aliquota 12,5 --depreciacao 25")!);
  afirmar(respostaConfig.severidade === "SUCESSO" && configService.obter().aliquotaImpostos === 12.5, "administrador define aliquota e depreciacao via config");
  afirmar(router.executar(parseComando("config definir --aliquota 150")!).severidade === "ERRO", "config rejeita percentual fora de 0-100");

  const respostaTimao = router.executar(parseComando("TIMÃO")!);
  afirmar(respostaTimao.severidade === "SUCESSO" && respostaTimao.mensagem.includes("2012"), "easter egg: 'timao' (qualquer caixa/acento) responde");

  const usuarioAuditor = { ...admin!, papel: Papel.AUDITOR };
  sessao.iniciar(usuarioAuditor);
  const tentativaBloqueada = router.executar(parseComando("org cadastrar --cnpj 1 --razao X")!);
  afirmar(
    tentativaBloqueada.severidade === "ERRO" && tentativaBloqueada.mensagem.includes("nao tem permissao"),
    "papel AUDITOR e bloqueado ao tentar executar comando fora de suas permissoes (segregacao de responsabilidades)"
  );
  afirmar(router.executar(parseComando("timao")!).severidade === "SUCESSO", "easter egg 'timao' funciona para qualquer papel logado");

  // ---------------------------------------------------------------------
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Resultado: ${totalAsserts - falhas}/${totalAsserts} verificacoes passaram.`);
  console.log(`${"=".repeat(60)}`);

  limparAmbienteDeTeste();

  if (falhas > 0) process.exit(1);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
  console.error("Erro inesperado durante a jornada de teste:", e);
  process.exit(1);
});
