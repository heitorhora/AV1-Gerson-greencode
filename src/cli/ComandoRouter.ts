import { ComandoParseado } from "./parser";
import { SessionManager } from "../services/SessionManager";
import { OrganizacaoService } from "../services/OrganizacaoService";
import { LoteService } from "../services/LoteService";
import { EquipamentoService } from "../services/EquipamentoService";
import { AuditoriaService } from "../services/AuditoriaService";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { CryptoService } from "../crypto/CryptoService";
import { SecureStore } from "../persistence/SecureStore";
import { Usuario } from "../models/Usuario";
import { EstadoFisico, NivelSeveridade, Papel, PERMISSOES, StatusEquipamento, StatusLote, TipoEquipamento } from "../types";
import * as crypto from "crypto";

export interface RespostaComando {
  severidade: NivelSeveridade;
  mensagem: string;
  dados?: unknown;
}

/** Lista de dominios validos, usada tambem para autocompletar no CLI. */
export const DOMINIOS_VALIDOS = ["ajuda", "usuario", "org", "lote", "equipamento", "auditoria", "relatorio", "sair"];

export class ComandoRouter {
  constructor(
    private readonly sessao: SessionManager,
    private readonly authService: AuthService,
    private readonly cryptoService: CryptoService,
    private readonly dirDados: string,
    private readonly orgService: OrganizacaoService,
    private readonly loteService: LoteService,
    private readonly equipamentoService: EquipamentoService,
    private readonly auditoriaService: AuditoriaService,
    private readonly configService: ConfigService
  ) {}

  executar(comando: ComandoParseado): RespostaComando {
    const usuario = this.sessao.usuarioAtual();
    if (!usuario) {
      return erro("Sessao expirada ou nao autenticada. Faca login novamente.");
    }
    this.sessao.registrarAtividade();

    if (comando.dominio === "ajuda") return sucesso("Consulte o menu de comandos exibido acima.");
    if (comando.dominio === "sair") return sucesso("Encerrando sessao...");

    // Easter egg: comando oculto, nao listado em DOMINIOS_VALIDOS nem no autocomplete/menu.
    // Aceita "timao", "TIMAO", "timão", "Timão"... (ignora maiusculas e acentos).
    if (semAcento(comando.dominio) === "timao") {
      return sucesso("O MAIOR É O CAMPEÃO MUNDIAL DE 2012 🖤🤍");
    }

    const dominiosPermitidos = PERMISSOES[usuario.papel];
    if (!dominiosPermitidos.includes(comando.dominio)) {
      return erro(`Seu papel (${usuario.papel}) nao tem permissao para o dominio "${comando.dominio}".`);
    }

    try {
      switch (comando.dominio) {
        case "usuario":
          return this.rotearUsuario(comando, usuario);
        case "org":
          return this.rotearOrganizacao(comando, usuario);
        case "lote":
          return this.rotearLote(comando, usuario);
        case "equipamento":
          return this.rotearEquipamento(comando, usuario);
        case "config":
          return this.rotearConfig(comando, usuario);
        case "auditoria":
          return this.rotearAuditoria(comando);
        case "relatorio":
          return this.rotearRelatorio(comando);
        default:
          return erro(`Dominio desconhecido: "${comando.dominio}". Digite "ajuda" para ver os comandos.`);
      }
    } catch (e) {
      return erro(`Falha inesperada ao processar o comando: ${(e as Error).message}`);
    }
  }

  private rotearUsuario(comando: ComandoParseado, usuarioLogado: Usuario): RespostaComando {
    const store = new SecureStore<Usuario>(this.cryptoService, this.dirDados, "usuarios.enc");

    if (comando.acao === "criar") {
      const { username, senha, papel } = comando.flags;
      if (!username || !senha || !papel) {
        return erro("Uso: usuario criar --username <nome> --senha <senha> --papel <PAPEL>");
      }
      if (!Object.values(Papel).includes(papel as Papel)) {
        return erro(`Papel invalido. Valores aceitos: ${Object.values(Papel).join(", ")}`);
      }
      if (store.ler().some((u) => u.username === username)) {
        return erro(`Ja existe um usuario com o username "${username}".`);
      }
      const novoUsuario: Usuario = {
        id: crypto.randomUUID(),
        username,
        hashSenha: CryptoService.hashSenha(senha),
        papel: papel as Papel,
        criadoEm: new Date().toISOString(),
        ativo: true,
      };
      store.adicionar(novoUsuario);
      return sucesso(`Usuario "${username}" criado com papel ${papel}.`);
    }

    if (comando.acao === "listar") {
      const usuarios = store.ler().map((u) => ({ username: u.username, papel: u.papel, ativo: u.ativo }));
      return sucesso(`${usuarios.length} usuario(s) cadastrado(s).`, usuarios);
    }

    if (comando.acao === "desativar") {
      const { username } = comando.flags;
      if (!username) return erro("Uso: usuario desativar --username <nome>");
      const alterados = store.atualizar(
        (u) => u.username === username,
        (u) => ({ ...u, ativo: false })
      );
      return alterados > 0 ? sucesso(`Usuario "${username}" desativado.`) : erro(`Usuario "${username}" nao encontrado.`);
    }

    return erro(`Acao desconhecida para "usuario": ${comando.acao}`);
  }

  private rotearConfig(comando: ComandoParseado, usuarioLogado: Usuario): RespostaComando {
    if (comando.acao === "listar") {
      return sucesso("Parametros globais do sistema.", this.configService.obter());
    }

    if (comando.acao === "definir") {
      const { aliquota, depreciacao } = comando.flags;
      if (aliquota === undefined && depreciacao === undefined) {
        return erro("Uso: config definir [--aliquota <percentual 0-100>] [--depreciacao <percentual ao ano 0-100>]");
      }
      const resultado = this.configService.definir(usuarioLogado.id, {
        aliquotaImpostos: aliquota === undefined ? undefined : Number(aliquota.replace(",", ".")),
        coeficienteDepreciacao: depreciacao === undefined ? undefined : Number(depreciacao.replace(",", ".")),
      });
      return resultado.sucesso ? sucesso("Parametros atualizados.", resultado.dado) : erro(resultado.erros.join(" "));
    }

    return erro(`Acao desconhecida para "config": ${comando.acao}`);
  }

  private rotearOrganizacao(comando: ComandoParseado, usuarioLogado: Usuario): RespostaComando {
    if (comando.acao === "cadastrar") {
      const { cnpj, razao, segmento, contrato, inicio, fim } = comando.flags;
      if (!cnpj || !razao) {
        return erro('Uso: org cadastrar --cnpj <CNPJ> --razao "<Razao Social>" [--segmento S] [--contrato N] [--inicio DATA] [--fim DATA]');
      }
      const resultado = this.orgService.cadastrar(usuarioLogado.id, {
        cnpj,
        razaoSocial: razao,
        segmento: segmento ?? "nao informado",
        numeroContrato: contrato ?? "s/n",
        vigenciaInicio: inicio ?? new Date().toISOString().slice(0, 10),
        vigenciaFim: fim ?? "",
      });
      return resultado.sucesso
        ? sucesso(`Organizacao "${razao}" (CNPJ ${resultado.dado.id}) cadastrada com sucesso.`, resultado.dado)
        : erro(resultado.erros.join(" "));
    }

    if (comando.acao === "listar") {
      const orgs = this.orgService.listar();
      return sucesso(`${orgs.length} organizacao(oes) cadastrada(s).`, orgs);
    }

    if (comando.acao === "consultar") {
      const { cnpj } = comando.flags;
      if (!cnpj) return erro("Uso: org consultar --cnpj <CNPJ>");
      const org = this.orgService.buscarPorId(cnpj);
      return org ? sucesso("Organizacao encontrada.", org) : erro(`Nenhuma organizacao encontrada com CNPJ ${cnpj}.`);
    }

    return erro(`Acao desconhecida para "org": ${comando.acao}`);
  }

  private rotearLote(comando: ComandoParseado, usuarioLogado: Usuario): RespostaComando {
    if (comando.acao === "criar") {
      const { org, nf, transp, data } = comando.flags;
      if (!org || !nf || !transp) {
        return erro("Uso: lote criar --org <CNPJ> --nf <NotaFiscal> --transp <Transportadora> [--data AAAA-MM-DD]");
      }
      const resultado = this.loteService.criar(usuarioLogado.id, {
        orgId: org,
        notaFiscal: nf,
        transportadora: transp,
        dataEntrada: data ?? new Date().toISOString().slice(0, 10),
      });
      return resultado.sucesso
        ? sucesso(`Lote criado com sucesso. ID: ${resultado.dado.id}`, resultado.dado)
        : erro(resultado.erros.join(" "));
    }

    if (comando.acao === "listar") {
      const lotes = this.loteService.listar();
      return sucesso(`${lotes.length} lote(s) cadastrado(s).`, lotes);
    }

    if (comando.acao === "consultar") {
      const { id } = comando.flags;
      if (!id) return erro("Uso: lote consultar --id <ID>");
      const lote = this.loteService.buscarPorId(id);
      return lote ? sucesso("Lote encontrado.", lote) : erro(`Lote ${id} nao encontrado.`);
    }

    if (comando.acao === "finalizar") {
      const { id } = comando.flags;
      if (!id) return erro("Uso: lote finalizar --id <ID>");
      const resultado = this.loteService.atualizarStatus(usuarioLogado.id, id, StatusLote.FINALIZADO);
      return resultado.sucesso ? sucesso(`Lote ${id} finalizado.`) : erro(resultado.erros.join(" "));
    }

    return erro(`Acao desconhecida para "lote": ${comando.acao}`);
  }

  private rotearEquipamento(comando: ComandoParseado, usuarioLogado: Usuario): RespostaComando {
    if (comando.acao === "cadastrar") {
      const { lote, tipo, codigo } = comando.flags;
      if (!lote || !tipo || !codigo) {
        return erro(`Uso: equipamento cadastrar --lote <ID> --tipo <${Object.values(TipoEquipamento).join("|")}> --codigo <CodBarras>`);
      }
      if (!Object.values(TipoEquipamento).includes(tipo as TipoEquipamento)) {
        return erro(`Tipo invalido. Valores aceitos: ${Object.values(TipoEquipamento).join(", ")}`);
      }
      const resultado = this.equipamentoService.cadastrarNoLote(usuarioLogado.id, {
        loteId: lote,
        tipo: tipo as TipoEquipamento,
        codigoBarras: codigo,
      });
      return resultado.sucesso
        ? sucesso(`Equipamento cadastrado. ID: ${resultado.dado.id}, codigo: ${resultado.dado.codigoBarras}`, resultado.dado)
        : erro(resultado.erros.join(" "));
    }

    if (comando.acao === "listar") {
      const { lote } = comando.flags;
      if (!lote) return erro("Uso: equipamento listar --lote <ID>");
      const equipamentos = this.equipamentoService.listarPorLote(lote);
      return sucesso(`${equipamentos.length} equipamento(s) no lote.`, equipamentos);
    }

    if (comando.acao === "triar") {
      const { id, estado, justificativa } = comando.flags;
      if (!id || !estado) {
        return erro(`Uso: equipamento triar --id <ID> --estado <${Object.keys(EstadoFisico).filter((k) => isNaN(Number(k))).join("|")}> [--justificativa "texto"]`);
      }
      const estadoEnum = EstadoFisico[estado as keyof typeof EstadoFisico];
      if (estadoEnum === undefined) {
        return erro(`Estado invalido. Valores aceitos: ${Object.keys(EstadoFisico).filter((k) => isNaN(Number(k))).join(", ")}`);
      }
      const resultado = this.equipamentoService.triar(usuarioLogado.id, id, estadoEnum, justificativa);
      return resultado.sucesso ? sucesso(`Equipamento ${id} triado com estado ${estado}.`) : erro(resultado.erros.join(" "));
    }

    if (comando.acao === "mover") {
      const { id, status, obs } = comando.flags;
      if (!id || !status) {
        return erro(`Uso: equipamento mover --id <ID> --status <${Object.values(StatusEquipamento).join("|")}> [--obs "texto"]`);
      }
      if (!Object.values(StatusEquipamento).includes(status as StatusEquipamento)) {
        return erro(`Status invalido. Valores aceitos: ${Object.values(StatusEquipamento).join(", ")}`);
      }
      const resultado = this.equipamentoService.moverStatus(usuarioLogado.id, id, status as StatusEquipamento, obs);
      return resultado.sucesso ? sucesso(`Equipamento ${id} movido para ${status}.`) : erro(resultado.erros.join(" "));
    }

    if (comando.acao === "rastrear") {
      const { id } = comando.flags;
      if (!id) return erro("Uso: equipamento rastrear --id <ID>");
      const resultado = this.equipamentoService.rastrear(id);
      if (!resultado.equipamento) return erro(`Equipamento ${id} nao encontrado.`);
      return sucesso(`Rastreabilidade do equipamento ${id}.`, resultado);
    }

    return erro(`Acao desconhecida para "equipamento": ${comando.acao}`);
  }

  private rotearAuditoria(comando: ComandoParseado): RespostaComando {
    if (comando.acao === "historico") {
      const { usuario, entidade } = comando.flags;
      let registros = this.auditoriaService.historicoCompleto();
      if (usuario) registros = registros.filter((r) => r.usuarioId === usuario);
      if (entidade) registros = registros.filter((r) => r.entidade === entidade);
      return sucesso(`${registros.length} registro(s) de journal encontrado(s).`, registros);
    }

    if (comando.acao === "linha-do-tempo") {
      const { id } = comando.flags;
      if (!id) return erro("Uso: auditoria linha-do-tempo --id <equipamentoId>");
      const linha = this.auditoriaService.linhaDoTempoEquipamento(id);
      return sucesso(`${linha.length} movimentacao(oes) encontrada(s).`, linha);
    }

    return erro(`Acao desconhecida para "auditoria": ${comando.acao}`);
  }

  private rotearRelatorio(comando: ComandoParseado): RespostaComando {
    if (comando.acao === "recuperacao") {
      const relatorio = this.auditoriaService.relatorioPotencialRecuperacao();
      return sucesso(`Relatorio de potencial de recuperacao gerado (${relatorio.length} equipamento(s)).`, relatorio);
    }

    return erro(`Acao desconhecida para "relatorio": ${comando.acao}`);
  }
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sucesso(mensagem: string, dados?: unknown): RespostaComando {
  return { severidade: NivelSeveridade.SUCESSO, mensagem, dados };
}

function erro(mensagem: string): RespostaComando {
  return { severidade: NivelSeveridade.ERRO, mensagem };
}
