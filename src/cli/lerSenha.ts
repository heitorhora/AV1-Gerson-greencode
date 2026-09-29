/**
 * Le uma senha do terminal exibindo "*" no lugar de cada caractere digitado,
 * evitando que a senha fique visível na tela (mesmo que continue trafegando
 * em texto puro pelo stdin do processo, o que e uma limitacao inerente a
 * qualquer CLI local sem hardware dedicado).
 *
 * Se a entrada padrao nao for um TTY (ex.: executando via pipe/redirecionamento
 * em testes automatizados), cai para leitura simples de uma linha.
 */
export function lerSenha(pergunta: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(pergunta);

    if (!process.stdin.isTTY) {
      let dados = "";
      process.stdin.on("data", (chunk) => (dados += chunk));
      process.stdin.once("end", () => resolve(dados.trim()));
      return;
    }

    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");

    let senha = "";
    let finalizado = false;

    const processarCaractere = (char: string): void => {
      if (finalizado) return;
      const codigo = char.charCodeAt(0);

      if (char === "\n" || char === "\r" || codigo === 4) {
        finalizado = true;
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(senha);
        return;
      }

      if (codigo === 3) {
        // Ctrl+C
        process.stdout.write("\n");
        process.exit(1);
      }

      if (codigo === 127 || codigo === 8) {
        // Backspace
        if (senha.length > 0) {
          senha = senha.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }

      senha += char;
      process.stdout.write("*");
    };

    // Um unico evento "data" pode conter mais de um caractere (ex.: colagem de
    // texto, ou envio em lote por scripts/automacao), entao cada caractere do
    // chunk precisa ser processado individualmente, e nao o chunk inteiro
    // como se fosse um caractere so.
    const onData = (chunk: string) => {
      for (const char of chunk) {
        processarCaractere(char);
        if (finalizado) break;
      }
    };

    stdin.on("data", onData);
  });
}
