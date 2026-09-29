import { Papel, PERMISSOES } from "../types";

const COMANDOS_POR_DOMINIO: Record<string, string[]> = {
  usuario: [
    "usuario criar --username <nome> --senha <senha> --papel <PAPEL>",
    "usuario listar",
    "usuario desativar --username <nome>",
  ],
  config: [
    "config listar",
    "config definir [--aliquota <% 0-100>] [--depreciacao <% ao ano 0-100>]",
  ],
  org: [
    'org cadastrar --cnpj <CNPJ> --razao "<Razao Social>" [--segmento S] [--contrato N] [--inicio DATA] [--fim DATA]',
    "org listar",
    "org consultar --cnpj <CNPJ>",
  ],
  lote: [
    "lote criar --org <CNPJ> --nf <NotaFiscal> --transp <Transportadora> [--data AAAA-MM-DD]",
    "lote listar",
    "lote consultar --id <ID>",
    "lote finalizar --id <ID>",
  ],
  equipamento: [
    "equipamento cadastrar --lote <ID> --tipo <TIPO> --codigo <CodBarras>",
    "equipamento listar --lote <ID>",
    "equipamento triar --id <ID> --estado <ESTADO> [--justificativa \"texto\"]",
    "equipamento mover --id <ID> --status <STATUS> [--obs \"texto\"]",
    "equipamento rastrear --id <ID>",
  ],
  auditoria: [
    "auditoria historico [--usuario <ID>] [--entidade <Nome>]",
    "auditoria linha-do-tempo --id <equipamentoId>",
  ],
  relatorio: ["relatorio recuperacao"],
};

/** Monta o texto de menu exibido apos o login, restrito aos dominios permitidos ao papel. */
export function montarMenu(papel: Papel): string {
  const dominios = PERMISSOES[papel];
  const linhas = [`Papel autenticado: ${papel}`, "Comandos disponiveis:"];

  for (const dominio of dominios) {
    const comandos = COMANDOS_POR_DOMINIO[dominio];
    if (!comandos) continue;
    linhas.push(`  [${dominio}]`);
    for (const c of comandos) linhas.push(`    ${c}`);
  }

  linhas.push("  [geral]");
  linhas.push("    ajuda");
  linhas.push("    sair");

  return linhas.join("\n");
}

/** Lista simples de tokens de primeiro nivel, usada pelo autocompletar do readline. */
export function dominiosDisponiveisParaPapel(papel: Papel): string[] {
  return [...PERMISSOES[papel], "ajuda", "sair"];
}
