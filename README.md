# greencode

CLI que serve como núcleo operacional de uma plataforma de logística reversa
de resíduos eletroeletrônicos — Atividade de Avaliação Individual 1.

> Contexto completo da proposta de negócio em `docs/CONTEXTO.md` (opcional) —
> este README foca na parte técnica: instalação, uso e decisões de design.
> A justificativa de segurança está em `docs/SEGURANCA.md` e o diagrama de
> classes em `docs/UML.md`.

## Requisitos

- Node.js 18 ou superior (testado com Node.js 22)
- Windows 10 ou superior, Linux Ubuntu 24.04.03 ou superior, ou distribuições
  derivadas do Ubuntu — o sistema não usa nenhuma API específica de sistema
  operacional além do que o próprio Node.js já abstrai, garantindo
  compatibilidade multiplataforma "de fábrica".

## Instalação

```bash
npm install
npm run build
```

## Execução

```bash
npm start
```

Ou, durante o desenvolvimento, sem precisar compilar antes:

```bash
npm run dev
```

Na primeira execução, o sistema detecta que não existe configuração e entra em
**modo de provisionamento inicial**: pede um username e uma senha para o
primeiro administrador, gera automaticamente a chave de criptografia AES-256
e cria o cadastro do administrador. Nas execuções seguintes, o sistema pede
apenas usuário e senha para login.

Por padrão, os dados são gravados em `./data` (relativo à raiz do projeto).
Para usar outro diretório (por exemplo, ambientes de teste), defina a
variável de ambiente `GREENCODE_DATA_DIR`:

```bash
GREENCODE_DATA_DIR=/caminho/alternativo npm start
```

## Executando os testes de jornada completa

```bash
npm run test
```

O script `tests/jornada.ts` simula, de ponta a ponta, a jornada de um usuário
real: provisionamento → login → cadastro de organização → criação de lote →
cadastro de equipamentos → triagem → movimentações → consulta de
rastreabilidade → auditoria → relatório de potencial de recuperação — incluindo
cenários de falha esperados (CNPJ inválido, datas fora da janela permitida,
transições de status bloqueadas, degradação de estado sem justificativa,
comandos fora da permissão do papel). O script cria seus próprios dados em
`./data-teste` e limpa tudo ao final, não interferindo nos dados reais em
`./data`.

## Papéis e permissões

| Papel | Pode acessar |
|---|---|
| `ADMINISTRADOR` | tudo: usuários, configuração, organizações, lotes, equipamentos, auditoria, relatórios |
| `OPERADOR_CADASTRO` | organizações, relatórios |
| `GESTOR_ALMOXARIFADO` | lotes, equipamentos, relatórios |
| `AUDITOR` | apenas consulta: auditoria (histórico do journal) e relatórios |

O menu exibido após o login já se adapta automaticamente ao papel do usuário
autenticado, mostrando apenas os comandos permitidos. Dentro da sessão, digite
`ajuda` a qualquer momento para reexibir o menu, ou `sair` para encerrar.

## Exemplos de comandos

```text
usuario criar --username maria --senha SenhaForte123 --papel GESTOR_ALMOXARIFADO
org cadastrar --cnpj 00.000.000/0001-91 --razao "Rede Varejo Exemplo Ltda" --segmento varejo
lote criar --org 00000000000191 --nf 123456 --transp TransRapida
equipamento cadastrar --lote <ID_DO_LOTE> --tipo TERMINAL_COMPUTADOR --codigo BC-0001
equipamento triar --id <ID_DO_EQUIPAMENTO> --estado REGULAR
equipamento mover --id <ID_DO_EQUIPAMENTO> --status DESMONTE
equipamento rastrear --id <ID_DO_EQUIPAMENTO>
auditoria historico
relatorio recuperacao
```

Comandos do administrador para parâmetros globais:

```
config listar
config definir --aliquota 12,5 --depreciacao 25
```

Valores com espaço devem ser envolvidos em aspas, como em `--razao "Rede
Varejo Exemplo Ltda"`. O terminal também oferece autocompletar (Tab) para o
primeiro token do comando e mantém histórico persistente entre sessões
(arquivo `.greencode_history` dentro do diretório de dados).

## Estrutura do projeto

```
greencode/
├── src/
│   ├── types.ts                  # enums e tipos centrais do dominio
│   ├── utils/cnpj.ts              # validacao de CNPJ (digitos verificadores)
│   ├── crypto/CryptoService.ts    # AES-256 + PBKDF2-SHA256
│   ├── persistence/
│   │   ├── JournalManager.ts      # write-ahead log, rotacao, retencao
│   │   └── SecureStore.ts         # escrita atomica + criptografia
│   ├── validators/                # classe abstrata Validador<T> + regras
│   ├── models/                    # entidades (Usuario, Organizacao, Lote, Equipamento...)
│   ├── factories/EquipamentoFactory.ts
│   ├── services/                  # AuthService, SessionManager, *Service por dominio
│   └── cli/                       # parser, roteador, menu, ponto de entrada
├── tests/jornada.ts               # teste de jornada completa (ponta a ponta)
├── docs/
│   ├── SEGURANCA.md               # justificativa da arquitetura de seguranca
│   └── UML.md                     # diagrama de classes (Mermaid) + padroes de POO
└── data/                          # criado em tempo de execucao (git-ignored)
```

## Segurança — resumo

- **Criptografia em repouso**: AES-256-CBC (IV aleatório por operação) em
  todos os arquivos de persistência, incluindo o journal.
- **Senhas**: nunca em texto puro — PBKDF2-HMAC-SHA256, 100.000 iterações,
  salt aleatório de 16 bytes por usuário, comparação em tempo constante.
- **Persistência atômica**: toda escrita usa arquivo temporário + `rename`,
  evitando corrupção em caso de interrupção abrupta do processo.
- **Journal imutável**: toda transação é registrada, com checksum SHA-256,
  antes de ser aplicada ao estado — rotação automática em 10 MB, retenção
  mínima de 180 dias.
- **Sessão**: expira após 30 minutos de inatividade.

Justificativa detalhada de cada escolha, trade-offs assumidos e cenários de
falha testados: ver `docs/SEGURANCA.md`.

