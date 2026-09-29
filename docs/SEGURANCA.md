# Arquitetura de Segurança — greencode

Este documento justifica as decisões de segurança adotadas na primeira atividade
do projeto greencode e descreve os cenários de falha testados.

## 1. Criptografia de dados em repouso — AES-256

Todos os arquivos de persistência (`usuarios.enc`, `organizacoes.enc`, `lotes.enc`,
`equipamentos.enc`, `movimentacoes.enc` e o journal de transações) são gravados em
disco criptografados com **AES-256 no modo CBC**, com um vetor de inicialização (IV)
aleatório de 16 bytes gerado a cada operação de escrita.

**Por que AES-256-CBC e não outro modo:**
- AES-256 é o padrão de fato para criptografia simétrica de dados em repouso,
  com margem de segurança confortável contra ataques de força bruta mesmo em
  cenários de longo prazo (décadas), o que é relevante para um sistema que
  precisa manter rastreabilidade histórica de ativos.
- O modo CBC foi escolhido, em vez de um modo sem autenticação como CTR puro,
  por sua ampla disponibilidade e simplicidade de implementação correta com a
  API nativa `crypto` do Node.js, sem dependências externas. Reconhecemos que
  um modo autenticado (AES-256-GCM) seria preferível em produção, pois além de
  confidencialidade garante integridade/autenticidade dos dados; a mitigação
  parcial dessa limitação nesta atividade é a camada adicional de checksum
  SHA-256 por registro no journal (seção 3). Uma evolução natural do sistema
  (citada como próxima etapa na proposta) é migrar para AES-256-GCM.
- Cada operação de escrita gera um IV novo e aleatório (nunca reutilizado com a
  mesma chave), eliminando o principal risco prático do modo CBC — o
  vazamento de padrões entre blocos idênticos.

**Gerenciamento da chave mestra:** a chave de 256 bits é gerada uma única vez,
no provisionamento inicial, e fica salva em `config.json` com permissão de
arquivo restrita ao dono do processo (`0600`). Esta é uma limitação conhecida e
assumida conscientemente para uma aplicação CLI local baseada em arquivos: sem
um cofre de segredos (KMS/HSM) ou variável de ambiente gerenciada por um
orquestrador, a chave precisa residir em algum lugar acessível ao processo. A
documentação da próxima etapa (integração web) já prevê a migração dessa chave
para uma variável de ambiente ou serviço de gerenciamento de segredos.

## 2. Hashing de senhas — PBKDF2 com SHA-256

As senhas de usuário nunca são armazenadas em texto puro. O sistema usa
**PBKDF2-HMAC-SHA256** com 100.000 iterações e salt aleatório de 16 bytes por
usuário, armazenando o resultado como `salt:hash` (ambos em hexadecimal).

**Por que PBKDF2-SHA256 em vez de SHA-256 "puro":** a atividade especifica o
uso do algoritmo SHA-256 para o hash de senhas. Um hash SHA-256 de uma
passada só, mesmo com salt, é vulnerável a ataques de força bruta em hardware
moderno (GPUs calculam bilhões de hashes SHA-256 por segundo). Por isso,
adotamos SHA-256 como a função de hash subjacente, mas dentro de PBKDF2 — que
aplica a função repetidamente (100.000 vezes) especificamente para tornar o
cálculo caro o suficiente para inviabilizar ataques de força bruta em escala,
sem abandonar o algoritmo exigido pela especificação. O salt aleatório por
usuário impede ataques de rainbow table e garante que dois usuários com a
mesma senha tenham hashes completamente diferentes em disco.

A comparação de senha na autenticação usa `crypto.timingSafeEqual`, mitigando
ataques de timing que tentariam inferir o hash correto pela diferença de tempo
de resposta.

## 3. Journal de transações imutável (write-ahead log)

Toda operação de escrita (criação de organização, lote, equipamento,
movimentação) é primeiro registrada em um journal **append-only** e só depois
aplicada ao arquivo de estado correspondente. Cada linha do journal:

- é criptografada com o mesmo esquema AES-256 dos demais arquivos;
- carrega um **checksum SHA-256** do conteúdo da transação, permitindo detectar
  adulteração ou corrupção do registro após o fato;
- inclui o identificador do usuário responsável, a operação, a entidade afetada
  e um timestamp ISO-8601.

**Política de retenção e rotação:** o journal ativo é rotacionado
automaticamente ao ultrapassar 10 MB (o arquivo é renomeado com um timestamp e
um novo arquivo ativo é criado), e journals rotacionados são mantidos por, no
mínimo, 180 dias antes de poderem ser removidos pela rotina de limpeza
(`aplicarPoliticaRetencao`), executada a cada inicialização do sistema.

## 4. Persistência atômica

Toda escrita de estado (`SecureStore.escrever`) segue o padrão
**escrever-em-temporário + renomear**: o novo conteúdo é gravado em um arquivo
temporário (`arquivo.enc.tmp-<pid>-<timestamp>`) e só então promovido ao nome
definitivo via `fs.renameSync`, uma operação atômica ao nível do sistema de
arquivos (POSIX e NTFS garantem que um `rename` não deixa o destino em estado
parcial). Isso significa que, mesmo que o processo seja interrompido
abruptamente (queda de energia, `kill -9`, etc.) no meio de uma escrita, o
arquivo definitivo permanece ou com o conteúdo antigo (íntegro) ou com o novo
conteúdo completo — nunca truncado ou corrompido.

## 5. Expiração de sessão por inatividade

A sessão do usuário autenticado expira após **30 minutos de inatividade**,
controlada por `SessionManager`. Cada comando processado "toca" a sessão
(`registrarAtividade`); se o intervalo desde a última atividade ultrapassar o
limite configurado, a sessão é encerrada e o usuário precisa autenticar-se
novamente antes de executar qualquer novo comando. O timeout é parametrizável
via construtor especificamente para permitir testes automatizados de
expiração sem esperar 30 minutos reais em cada execução da suíte de testes.

## 6. Segregação de responsabilidades por papel

Cada um dos quatro papéis (administrador, operador de cadastro, gestor de
almoxarifado, auditor) tem acesso restrito a um subconjunto de domínios de
comando, verificado centralmente em `ComandoRouter.executar` antes de
qualquer despacho para os serviços de domínio. O papel auditor, em
particular, só tem acesso aos domínios `auditoria` e `relatorio` — ambos
compostos exclusivamente por operações de leitura — nunca podendo alterar
dados do sistema.

## 7. Cenários de falha testados

O script `tests/jornada.ts` cobre, entre outros, os seguintes cenários
negativos (além do caminho feliz completo de provisionamento →
autenticação → cadastro → triagem → movimentação → rastreabilidade →
auditoria):

| Cenário | Comportamento esperado | Verificado |
|---|---|---|
| Login com senha incorreta | Rejeitado, usuário não autenticado | Sim |
| Sessão além do timeout de inatividade | Marcada como expirada | Sim |
| CNPJ com dígito verificador inválido | Cadastro de organização rejeitado | Sim |
| CNPJ duplicado | Cadastro de organização rejeitado | Sim |
| Lote com data de entrada futura | Cadastro de lote rejeitado | Sim |
| Lote com data de entrada > 90 dias no passado | Cadastro de lote rejeitado | Sim |
| Equipamento movido para DESMONTE sem triagem prévia | Movimentação rejeitada | Sim |
| Degradação de estado físico ≥ 2 categorias sem justificativa | Triagem rejeitada | Sim |
| Regressão de status (ex.: RECICLAGEM → TRIADO) | Movimentação rejeitada | Sim |
| Comando fora da permissão do papel autenticado | Execução bloqueada | Sim |
| Dado sensível (senha, código de barras) em texto puro no disco | Nunca ocorre — tudo criptografado | Sim |

## 8. Limitações conhecidas e evolução prevista

- **Gerenciamento de chave mestra em arquivo local**: adequado para esta
  atividade (CLI local, persistência em arquivo texto), mas deve migrar para
  uma variável de ambiente ou cofre de segredos na integração web prevista
  para as próximas etapas.
- **AES-256-CBC sem autenticação nativa**: mitigado parcialmente pelo
  checksum SHA-256 por registro do journal; a migração para AES-256-GCM é
  recomendada quando o sistema evoluir para um banco de dados relacional.
- **Revogação de sessão entre processos**: como o CLI roda em processo único
  por sessão, não há necessidade, nesta etapa, de um mecanismo de revogação
  distribuída de sessões (relevante apenas quando houver interface web com
  múltiplas sessões concorrentes).
