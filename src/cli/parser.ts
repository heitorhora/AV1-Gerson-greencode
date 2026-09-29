export interface ComandoParseado {
  dominio: string;
  acao: string;
  flags: Record<string, string>;
  bruto: string;
}

/**
 * Faz o parsing de uma linha de comando no formato:
 *   <dominio> <acao> [--flag valor ...]
 * Ex.: lote criar --org BR001 --nf 123456 --transp TransRapida
 *
 * Valores com espacos podem ser envolvidos em aspas: --razao "Loja Exemplo Ltda"
 */
export function parseComando(linha: string): ComandoParseado | null {
  const tokens = tokenizar(linha.trim());
  if (tokens.length === 0) return null;

  const [dominio, acao, ...resto] = tokens;
  const flags: Record<string, string> = {};

  for (let i = 0; i < resto.length; i++) {
    const token = resto[i];
    if (token.startsWith("--")) {
      const nome = token.slice(2);
      const valor = resto[i + 1] && !resto[i + 1].startsWith("--") ? resto[++i] : "true";
      flags[nome] = valor;
    }
  }

  // Dominio e acao nao diferenciam maiusculas/minusculas ("LOTE Criar" == "lote criar").
  return { dominio: (dominio ?? "").toLowerCase(), acao: (acao ?? "").toLowerCase(), flags, bruto: linha };
}

function tokenizar(linha: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(linha)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}
