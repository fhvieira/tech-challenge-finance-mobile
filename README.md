# Tech Challenge – Finance Mobile

Aplicativo mobile de gerenciamento financeiro desenvolvido para a Fase 3 do FIAP Pós-Tech Tech Challenge. Usuários autenticados gerenciam suas finanças de forma individual, com dashboard, entradas, despesas, filtros, comprovantes e persistência em serviços Firebase. O app usa Firebase Authentication, Cloud Firestore e Firebase Storage para autenticação, dados e arquivos.

## Como Executar

### Pré-requisitos

- Node.js / npm.
- Ambiente compatível com Expo.
- Projeto Firebase com Authentication, Cloud Firestore e Firebase Storage.
- Provedor Email/Password habilitado no Firebase Authentication.

### Instalação

```bash
git clone https://github.com/fhvieira/tech-challenge-finance-mobile.git
cd tech-challenge-finance-mobile
npm install
```

### Configuração do Firebase

A configuração Web do Firebase fica em `firebaseConfig.ts`. Para usar outro projeto Firebase, substitua os valores desse arquivo pelos dados do seu projeto no Firebase Console.

A Web API key do Firebase identifica o projeto no cliente e não é uma credencial secreta. A proteção dos dados depende do Firebase Authentication e das regras de segurança publicadas no Firestore e no Storage.

Publique regras compatíveis com:

- `users/{uid}/transactions/{transactionId}`
- `users/{uid}/receipts/{arquivo}`

### Execução

```bash
npm start
```

Ou:

```bash
npx expo start
```

O Expo exibirá opções como Expo Go, iOS Simulator, Android Emulator ou navegador web, conforme o ambiente local.

## Funcionalidades

- Cadastro, login e logout com Firebase Authentication.
- Isolamento das transações por usuário autenticado.
- Dashboard com saldo, entradas, despesas, gráfico comparativo e análise financeira.
- Seções do dashboard com animações e transições de expandir/recolher.
- Criação, edição e exclusão de transações.
- Tipos de transação: Entrada e Despesa.
- Validação inline dos formulários.
- Filtros por categoria, valor mínimo, valor máximo e período.
- Carregamento progressivo/infinite scroll das transações.
- Upload de comprovantes ou documentos.
- Persistência das transações no Cloud Firestore.
- Armazenamento de comprovantes no Firebase Storage.

## Tecnologias Utilizadas

- React Native 0.86.3.
- React 19.2.3.
- TypeScript.
- Expo 57.
- Expo Router.
- Firebase 12.18.0.
- Firebase Authentication.
- Cloud Firestore.
- Firebase Storage.
- React Context API.
- Expo Document Picker.
- React Native Community DateTimePicker.

## Arquitetura

O projeto usa Expo Router para navegação baseada em arquivos. Os providers globais são aplicados em `app/_layout.tsx`.

Telas principais:

- `app/login.tsx`: login.
- `app/register.tsx`: cadastro.
- `app/index.tsx`: dashboard financeiro.
- `app/transactions.tsx`: extrato, filtros e lista de transações.
- `app/transaction-form.tsx`: criação e edição de transações.

Contextos:

- `AuthContext`: estado do usuário autenticado.
- `TransactionsContext`: estado das transações e operações de CRUD no Firestore.

Estrutura resumida:

```text
.
├── app
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── login.tsx
│   ├── register.tsx
│   ├── transaction-form.tsx
│   └── transactions.tsx
├── constants
│   ├── formatters.ts
│   ├── formValidationStyles.ts
│   ├── pressableFeedback.ts
│   └── theme.ts
├── contexts
│   ├── AuthContext.tsx
│   └── TransactionsContext.tsx
├── hooks
├── scripts
├── firebaseConfig.ts
└── package.json
```

O app usa React Context API. `AuthProvider` observa o Firebase Authentication com `onAuthStateChanged` e expõe o usuário atual. `TransactionsProvider` fica dentro do `AuthProvider`, pois as transações dependem do UID autenticado; ele disponibiliza páginas por cursor, pesquisa e operações de adicionar, editar e excluir. Não há listener de transações carregando o histórico completo.

## Firebase

### Authentication

Firebase Authentication com Email/Password é usado para cadastro, login, logout e identificação do usuário atual.

### Cloud Firestore

As transações são armazenadas em:

```text
users/{uid}/transactions/{transactionId}
```

Cada usuário possui sua própria subcoleção. A aplicação consulta as transações por `createdAt` em ordem decrescente.

O arquivo `firestore.indexes.json`, referenciado por `firebase.json`, define o índice composto de `transactions` com escopo `COLLECTION`: `type ASCENDING`, `createdAt DESCENDING` e `amount DESCENDING`. Ele atende às agregações financeiras de entradas e saídas do dashboard, que filtram por tipo, ordenam por criação e somam o valor.

Para publicar somente os índices, com a Firebase CLI instalada e autenticada:

```bash
firebase deploy --only firestore:indexes --project tech-challenge-finance-mobile
```

Após a publicação, aguarde o índice ficar ativo no Firebase Console antes de validar as agregações. Esse comando não publica regras de segurança.

### Firebase Storage

Comprovantes são enviados para:

```text
users/{uid}/receipts/{arquivo}
```

A URL de download é salva em `receiptUrl` no documento da transação.

### Confiabilidade da gravação e dos comprovantes

O formulário bloqueia envios repetidos durante a gravação, preserva campos e arquivo selecionado após falhas e só retorna à tela anterior após confirmação. A exclusão também impede confirmações repetidas e apresenta falhas ao usuário. Sem usuário autenticado, as operações rejeitam explicitamente. Valores precisam ser finitos e maiores que zero, tanto no formulário quanto nos casos de uso de criação e edição.

`SaveTransactionWithReceipt` reutiliza os casos de uso existentes e coordena `ReceiptRepository`, implementado pelo Firebase Storage. Cada novo upload recebe um caminho com ID aleatório, sem sobrescrever o comprovante anterior. A limpeza remove somente uploads desta tentativa quando o Firestore rejeita explicitamente a gravação (`permission-denied`, `unauthenticated`, `invalid-argument`, `not-found` ou `already-exists`) ou quando o upload foi confirmado, mas a obtenção da URL falhou antes de qualquer gravação. A permissão local de limpeza é descartada ao terminar a tentativa; ela não é um mecanismo de autorização remoto.

Em resultados inconclusivos, o arquivo é preservado e a interface orienta conferir o extrato antes de repetir a gravação. Falhas de limpeza são informadas sem substituir o erro original. Comprovantes antigos não são removidos automaticamente na edição ou exclusão. Storage e Firestore não fazem parte de uma operação atômica: encerramento do aplicativo, falhas de limpeza ou resultados inconclusivos ainda podem deixar arquivos órfãos. Durante falta de conexão, o SDK pode manter a gravação pendente até reconectar; o aplicativo mantém o bloqueio e não anuncia sucesso antecipadamente.

Testes locais: `node --test tests/transaction-mutations.test.cjs`. No iPhone, validar toques rápidos em Salvar/Excluir, erro e retomada com os campos preservados, envio de PDF/imagem, edição sem novo comprovante e atualização do extrato/dashboard após sucesso. Os testes simulam Firestore e Storage; falhas reais e permissões precisam de validação em ambiente de teste, sem alterar as regras publicadas.

## Segurança e Autorização

Autenticação identifica o usuário logado. Autorização restringe o acesso no Firestore e no Storage com base no UID autenticado.

As regras configuradas impedem que um usuário acesse transações ou comprovantes de outro usuário. O projeto foi testado com usuários autenticados diferentes, confirmando que um usuário recém-criado não recebe as transações de outro usuário.

Exemplo de regra para o Firestore:

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/transactions/{transactionId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

Exemplo de regra para o Firebase Storage:

```text
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/receipts/{fileName} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

### Regras de segurança versionadas

As regras de Firestore (`firestore.rules`) e Storage (`storage.rules`) estão versionadas e referenciadas em `firebase.json`, preservando a configuração dos índices. Os arquivos foram copiados da configuração publicada no Firebase Console, conforme as regras fornecidas para este projeto, sem alteração de lógica.

Nas operações protegidas pelas regras, cada usuário autenticado só pode acessar seus próprios caminhos: `users/{uid}/transactions/{transactionId}` no Firestore e `users/{uid}/receipts/{fileName}` no Storage. Alterações futuras precisam ser revisadas e publicadas explicitamente; modificar os arquivos locais não altera o Firebase remoto.

URLs de comprovantes geradas com tokens de download exigem cuidado: quem possuir o link poderá acessar o arquivo. Esses links devem ser tratados como dados sensíveis, sem publicação ou registro em logs; a proteção dos caminhos por UID não deve ser interpretada como uma nova checagem de autenticação em cada uso do link.

### Persistência local segura da autenticação

No aplicativo nativo, o Firebase Auth usa `getReactNativePersistence()` com o adaptador `SecureAuthStorage`, baseado em `expo-secure-store` compatível com SDK 58 e Expo Go. O Firebase continua responsável por serializar a sessão, renovar tokens e executar logout. O adaptador utiliza `getItemAsync()`, `setItemAsync()` e `deleteItemAsync()`, sem biometria obrigatória. A versão Web mantém a inicialização anterior.

As chaves são codificadas por unidades UTF-16 de largura fixa, com namespace do projeto e do Firebase App, de forma determinística e sem colisões. Não há fallback para guardar tokens no AsyncStorage, nem truncamento ou fragmentação do conteúdo. Valores grandes podem ser rejeitados pelo armazenamento nativo; essa condição é tratada como erro explícito, sem registrar o conteúdo ou mensagens nativas potencialmente sensíveis.

**Transição:** não há migração da sessão antiga. Na preparação, são removidas somente as chaves legadas `firebase:authUser:<apiKey>:<appName>`, `firebase:persistence:<apiKey>:<appName>` e `firebase:redirectUser:<apiKey>:<appName>` deste aplicativo no AsyncStorage. Nenhuma outra chave é apagada e nenhum registro antigo é lido para restaurar login. O usuário fará login novamente uma única vez; depois, a sessão será restaurada pelo SecureStore. Logout remove a sessão segura e eventual registro legado correspondente. Transações e comprovantes remotos não são modificados.

O adaptador e seu status são reutilizados durante Fast Refresh. Na primeira atualização sobre uma instância antiga de Auth, o aplicativo exige reinício completo, evitando apresentar a persistência antiga como segura. Feche e reabra o projeto no Expo Go para validar a transição; Fast Refresh isoladamente não é suficiente.

Falhas na limpeza legada, disponibilidade ou operações do SecureStore são sinalizadas na interface. O fluxo normal é bloqueado e os providers internos são desmontados, limpando seus stores em memória, até reiniciar o aplicativo e concluir a preparação. Isso também impede continuar silenciosamente caso o teste de disponibilidade do Firebase tente selecionar persistência apenas em memória. O armazenamento no Keychain do iOS pode sobreviver à reinstalação; desinstalar não substitui testar o logout.

Validação: `node --test tests/secure-auth-storage.test.cjs` exercita o contrato real da persistência React Native do Firebase com um backend seguro simulado. No iPhone, verificar o primeiro login após reinício completo, fechar/reabrir mantendo a sessão, renovação normal da sessão, logout seguido de reinício e troca entre duas contas sem reaparecimento dos dados anteriores. Os testes locais não comprovam limites de tamanho ou disponibilidade do Keychain real; falhas nativas devem aparecer explicitamente, sem fallback para texto puro.

## Dashboard

O dashboard exibe saldo, total de entradas, total de despesas, comparação visual entre entradas e despesas e uma análise financeira simples. As seções têm transições de expandir/recolher, e o gráfico usa barras animadas para representar a proporção entre entradas e despesas.

## Transações e Filtros

A tela de transações permite consultar, editar e excluir registros. A exclusão exige confirmação antes de remover o documento do Firestore.

Filtros disponíveis:

- Categoria.
- Valor mínimo.
- Valor máximo.
- Data inicial.
- Data final.

O extrato consulta páginas de 10 transações no Firestore, usando `limit()` e `startAfter()`. Valor mínimo/máximo são inclusivos. As datas selecionadas abrangem o dia local completo, incluindo a precisão em nanossegundos no último milissegundo do dia. `createdAt DESC` permanece como ordenação principal. Sem intervalos, o desempate é por ID descendente; com intervalos, os campos de valor/data filtrados aparecem antes do ID, que é sempre o último critério.

Sem categoria, uma agregação `count()` com os mesmos filtros e campos de ordenação fornece o total, sem cursor nem limite. O contador mostra, por exemplo, `20 de 37 transações filtradas`; enquanto a contagem não estiver disponível, informa apenas os itens carregados, sem apresentar um total parcial ou um zero presumido. Falhas na contagem têm uma ação própria de nova tentativa e não descartam páginas válidas. Contagem e páginas são leituras independentes: alterações concorrentes podem causar diferenças temporárias entre esses resultados. Receber foco, mudar filtros e operações CRUD confirmadas reiniciam as páginas e a contagem; sair da tela limpa a sessão.

O cursor opaco (versão 2) contém UID, identidade dos filtros/ordenação e todos os valores de ordenação do último documento entregue. Timestamps conservam segundos e nanossegundos originais. Cursores de outra consulta/UID ou versões antigas são rejeitados; alterações de filtros/UID e reinícios descartam respostas pendentes. Os tokens não são credenciais e não substituem as regras do Firestore.

### Pesquisa por categoria com leituras limitadas

A pesquisa mantém `category.toLowerCase().includes(texto.trim().toLowerCase())`, sem remover acentos nem mudar os espaços internos. `GetTransactionsPage`, na Application, reutiliza as páginas do repository como lotes de candidatos; valor e data continuam filtrados no Firestore antes do teste local de categoria. Não existe mais fallback de histórico completo nem `onSnapshot()` de transações. `ObserveTransactions` e `TransactionRepository.subscribe()` foram removidos; dashboard e edição por ID permanecem independentes da listagem.

O caso de uso continua consultando até obter 10 correspondências, esgotar os candidatos ou atingir o orçamento por ação. `app/_layout.tsx` configura `candidateBatchSize: 10` e `maxCandidateReads: 100`. Cada lote pede no máximo a quantidade de correspondências que falta para a página, evitando sobras e perdas; todo candidato examinado avança o cursor, mesmo sem corresponder à categoria. O orçamento reserva `tamanho do lote + 1`, incluindo o documento adicional de detecção da próxima página. Portanto, o limite é conservador e pode encerrar a ação antes de examinar 100 candidatos. Ele limita documentos potencialmente retornados pelas consultas, não custos de entradas de índice ou leituras adicionais exigidas por regras de segurança.

Ao atingir o orçamento com candidatos restantes, o extrato mostra **Continuar pesquisa**; `onEndReached` fica suspenso até a ação explícita do usuário. Isso também funciona quando não houve nenhuma correspondência. O contador apresenta apenas `N transações encontradas — pesquisa em andamento`, sem total exato. Só ao esgotar os candidatos a quantidade de correspondências únicas examinadas pode ser mostrada como total. A mensagem de ausência de resultados aparece apenas após a pesquisa terminar sem correspondências; falhas de rede mostram erro e nova tentativa.

O cursor da pesquisa é um envelope opaco que vincula UID, categoria normalizada e filtros ao cursor original do repository. O cursor interno continua preservando toda a precisão e a ordenação do Firestore. Não há outro mecanismo de offsets nem reconstrução por `Date`. Cursores de consultas incompatíveis são rejeitados. Reinício, logout, mudança de UID/filtros e CRUD invalidam as requisições antigas, impedindo novos lotes após uma resposta obsoleta; uma consulta de rede que já começou não pode ser cancelada pelo SDK.

Em falha intermediária, os itens e o cursor parcial daquela ação não são publicados. A nova tentativa repete a ação a partir do cursor anterior, preservando as páginas já concluídas e evitando perder documentos. Pode haver repetição de leituras dentro desse orçamento. Categorias raras ou inexistentes podem exigir várias ações e, se o usuário continuar até o fim, examinar todos os candidatos; nenhuma ação faz uma leitura ilimitada nem consulta a coleção inteira apenas para obter a contagem.

Durante o carregamento adicional, a tela mostra `Carregando mais transações...`. As páginas são leituras pontuais: mudanças de outro dispositivo são refletidas ao reabrir o extrato. Não há snapshot atômico de todo o histórico: inclusões/edições/exclusões concorrentes podem mudar o universo durante a navegação. A lista deduplica IDs e o total da pesquisa descreve a varredura concluída, sem garantir a contagem atual do servidor durante alterações concorrentes. Reabrir a tela reinicia a consulta para obter dados atualizados.

### Cache em memória e pré-carregamento

Ao receber foco após a autenticação, o dashboard chama `preloadFirstPage()`, disponibilizado pelo `TransactionsContext`. O método reutiliza `GetTransactionsPage` e `GetTransactionsCount` no store de paginação existente. A chamada depende do UID e do foco, sem se repetir a cada renderização; os cálculos e as agregações financeiras do dashboard permanecem independentes.

O store guarda **somente a primeira página sem filtros**, com até 10 transações, cursor opaco original, `hasMore` e contagem. A chave considera UID e filtros normalizados; filtros preenchidos (incluindo categoria) não reutilizam nem alimentam esse cache. Assim, o comportamento da pesquisa por categoria e de **Continuar pesquisa** permanece inalterado. Não há persistência desses dados em AsyncStorage, disco ou outro armazenamento.

O TTL padrão é de **30 segundos**, contado da conclusão bem-sucedida da página e da contagem, sem renovação em acessos ao cache. A expiração é verificada no próximo acesso, sem temporizador ou polling. Antes do vencimento, abrir ou reabrir o extrato sem filtros restaura a primeira página e seu cursor sem repetir as consultas de listagem e contagem. As páginas seguintes continuam sendo consultadas normalmente. O TTL não interrompe uma paginação já iniciada nem representa uma garantia de atualização em tempo real.

Reiniciar/encerrar a navegação limpa o estado visível e invalida respostas pendentes, mas preserva esse cache até o TTL. CRUD confirmado invalida todo o cache da sessão e mantém a atualização da paginação existente; uma falha de atualização não transforma uma gravação bem-sucedida em erro de salvamento. Logout, troca de UID ou desmontagem do Provider eliminam o cache. Uma resposta anterior à invalidação não pode repovoá-lo.

Se o extrato abrir durante o preloading, compartilha a mesma operação, inclusive quando a página já chegou e a contagem ainda está pendente. Falhas de preloading são tratadas, não bloqueiam o dashboard e não são armazenadas no cache; abrir o extrato depois da falha tenta o carregamento normal novamente. Dados alterados em outro dispositivo podem permanecer desatualizados por até o TTL antes de uma nova abertura consultar a rede.

Para comprovar o benefício:

1. Autenticar e permanecer no dashboard até concluir o preloading.
2. No React Native DevTools, colocar breakpoints em `FirebaseTransactionRepository.getPage()` (primeira página: `cursor == null`) e `getCount()` para observar as chamadas antecipadas. As agregações financeiras usam outro método e não entram nessa contagem.
3. Abrir o extrato sem filtros em menos de 30 segundos. `firstPageSource`, exposto pelo Context para diagnóstico, deve ser `"cache"`; página inicial e contagem não devem consultar novamente. As transações e a continuidade devem aparecer normalmente. Se `onEndReached` pedir outra página, essa consulta terá cursor preenchido e não representa repetição da primeira.
4. Rolar para a próxima página: somente a nova página deve consultar o repository, usando o cursor preservado. Após o TTL, uma nova abertura deve apresentar `firstPageSource: "network"` e executar novamente página/contagem.
5. Repetir com CRUD, logout/troca de conta e filtros; nenhum cache incompatível ou invalidado deve aparecer. Aguardar e retomar a pesquisa por categoria continua obedecendo ao orçamento existente.

Os testes em `tests/transactions-preloading.test.cjs` contam as chamadas aos casos de uso e cobrem reaproveitamento, concorrência, TTL com relógio controlado, invalidação, sessão, falhas e continuidade. O benefício verificável é eliminar a repetição das consultas antecipadas na abertura do extrato; o preloading pode executar consultas mesmo se o usuário não visitar a tela.

### Índices e validação remota dos intervalos

Além do índice existente do dashboard, `firestore.indexes.json` define três índices de `transactions`, escopo `COLLECTION`:

| Intervalos | Campos, na ordem do índice |
| --- | --- |
| Valor | `createdAt DESC`, `amount DESC` |
| Data | `createdAt DESC`, `date DESC` |
| Valor e data | `createdAt DESC`, `amount DESC`, `date DESC` |

O Firestore acrescenta `__name__ DESC` ao final desses índices. As consultas de página e contagem compartilham os mesmos índices. O índice anterior com prefixo `type` atende ao dashboard, mas não substitui esses índices sem filtro de tipo. Manter `createdAt` primeiro pode exigir varrer mais entradas do índice; o limite restringe os documentos entregues, não garante um limite equivalente nas entradas de índice lidas.

Nenhum deploy foi executado nesta etapa. Os quatro índices já foram habilitados e os filtros remotos de data/valor foram validados no iPhone. A categoria reutiliza as mesmas consultas e não exige índices novos. Testes locais com mocks e a construção de consultas pelo SDK **não substituem testes no servidor**. Para validar a pesquisa por categoria no iPhone:

1. Verificar mínimo, máximo e ambos os valores, incluindo documentos exatamente nos limites.
2. Verificar início, fim e período, incluindo transações nas extremidades do dia local e excluindo o próximo dia.
3. Combinar valor e data; percorrer mais de duas páginas e conferir o total agregado com os registros conhecidos no Console.
4. Incluir documentos com o mesmo `createdAt` para conferir os novos desempates e ausência de repetições/lacunas em um conjunto sem alterações concorrentes.
5. Alterar filtros rapidamente durante leituras, limpar filtros, fazer CRUD e trocar de conta; nenhum item/total da consulta anterior deve reaparecer.
6. Confirmar resultados e contagem numérica em cada combinação. Mensagens de erro (incluindo índice ausente/em construção) não são validação bem-sucedida, coleção vazia nem fim do histórico. Se necessário, investigar a exceção original do repository sem registrar tokens ou credenciais.
7. Pesquisar categoria presente no início, somente após muitos lotes e inexistente; conferir pausa pelo orçamento, ausência de falso total/coleção vazia e continuação sem reinício.
8. Combinar categoria, data e valor; desconectar a rede após uma pausa e tentar continuar, depois reconectar e repetir a tentativa. O cursor deve retomar a ação que falhou, mesmo com zero itens encontrados.

## Upload de Comprovantes

Fluxo implementado:

1. O usuário seleciona imagem ou PDF com Expo Document Picker.
2. O arquivo é enviado para Firebase Storage.
3. A aplicação obtém a URL de download.
4. A URL é salva em `receiptUrl` no Firestore.

Ao editar uma transação sem selecionar novo comprovante, a URL existente é preservada.

## Acessibilidade e UX

A aplicação inclui labels de acessibilidade, áreas de toque adequadas, feedback visual nas ações, fechamento do teclado em formulários, validações inline e formatação de valores monetários e datas no padrão brasileiro.
