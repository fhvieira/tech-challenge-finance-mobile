# Tech Challenge — Finance Mobile · Fase 4

Aplicativo de finanças pessoais desenvolvido para o Tech Challenge da FIAP Pós-Tech. A Fase 4 evolui a aplicação mobile com Clean Architecture, consultas paginadas no Firestore, agregações financeiras, cache em memória, pré-carregamento e proteção da persistência local de autenticação.

O usuário autenticado cadastra entradas e despesas, acompanha indicadores financeiros e consulta seu extrato com filtros e comprovantes. O foco de validação é o iPhone físico com Expo Go compatível com **Expo SDK 58**.

## Tecnologias e versões

Versões instaladas e registradas no `package-lock.json` na revisão desta etapa:

| Tecnologia | Versão | Uso |
| --- | --- | --- |
| Expo | 58.0.23 | Execução e módulos nativos |
| React Native | 0.88.1 | Interface mobile |
| React | 19.3.0 | Componentes, hooks e Context |
| Expo Router | 58.0.30 | Navegação por arquivos |
| Firebase JS SDK | 12.18.0 | Authentication, Firestore e Storage |
| Expo SecureStore | 58.0.2 | Persistência segura da sessão nativa |
| Expo DocumentPicker | 58.0.4 | Seleção de imagens e PDFs |
| Expo WebBrowser | 58.0.7 | Abertura do comprovante salvo |
| DateTimePicker | 9.2.1 | Seleção de datas |
| AsyncStorage | 2.2.0 | Remoção dos registros antigos de Auth, sem fallback para tokens |
| Reanimated / Worklets | 4.7.1 / 0.13.0 | Dependências nativas instaladas; o dashboard usa `Animated` do React Native |
| TypeScript | 6.0.3 | Verificação estática |
| ESLint / eslint-config-expo | 9.39.5 / 58.0.4 | Análise de código |

Não há Redux, Zustand ou React Query. O estado compartilhado usa Context e stores de apresentação com `useSyncExternalStore`.

## Configuração e execução

### Pré-requisitos

- Node.js compatível com as dependências. O ambiente desta revisão usa **Node 24.14.1**; a versão instalada do Expo aceita `^22.13.0`, `^24.3.0`, `^26.0.0` ou `>=27.0.0`.
- npm e acesso à rede para instalar os pacotes.
- Expo Go compatível com SDK 58 no iPhone, com acesso ao servidor Metro do computador.
- Projeto Firebase com Authentication por **Email/Password**, Cloud Firestore, Storage, regras e índices compatíveis com os arquivos versionados.

### Instalação

```bash
git clone https://github.com/fhvieira/tech-challenge-finance-mobile.git
cd tech-challenge-finance-mobile
npx --yes npm@11.21.1 ci
```

O comando usa temporariamente o npm 11.21.1, adotado na migração para evitar o conflito de resolução de peers opcionais do DateTimePicker, sem substituir o npm global. `ci` utiliza o lockfile existente. Não use `--force` ou `--legacy-peer-deps` para contornar incompatibilidades.

### Configuração Firebase e variáveis de ambiente

**A implementação atual não exige variáveis de ambiente da aplicação.** Ela não lê configurações Firebase de `.env` e não possui `.env.example`. Criar variáveis `EXPO_PUBLIC_*` isoladamente não muda o projeto.

O objeto de configuração do cliente está em `firebaseConfig.ts`. Para utilizar outro projeto, configure nesse arquivo os campos `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` e `appId` com a configuração Web correspondente do Firebase Console. Nenhum valor de configuração é reproduzido neste README.

A [API key Web do Firebase](https://firebase.google.com/docs/projects/api-keys) identifica o projeto cliente; ela não substitui autenticação nem regras de autorização. Não inclua senhas, tokens de sessão, contas de serviço ou chaves privadas no aplicativo ou no repositório. `.env` e `.env.*` estão ignorados pelo Git, mas isso não implementa sua leitura. `EXPO_OS`, usado em componentes auxiliares, é fornecido pelo Expo e não precisa de configuração manual.

### Iniciar no iPhone

```bash
npm start -- --go
```

Abra o QR Code com o iPhone e carregue o projeto no Expo Go. Computador e celular precisam de conectividade entre si; em uma rede local, mantenha-os na mesma rede. Se necessário, reinicie o Metro com limpeza de cache:

```bash
npx expo start --go --clear
```

O primeiro acesso após a troca da persistência de autenticação exige reinício completo do projeto e novo login; Fast Refresh sozinho não faz essa transição. O Expo Go deve ser compatível com SDK 58.

Scripts disponíveis: `npm run ios`, `npm run android` e `npm run web`. Simuladores/emuladores exigem seus ambientes nativos. A configuração Web usa saída estática e a persistência padrão do Firebase para Web; SecureStore é utilizado somente no aplicativo nativo. A validação mobile no iPhone não comprova todos os fluxos Web/Android.

## Funcionalidades

- Cadastro, login e logout com Firebase Authentication e persistência segura da sessão nativa.
- Isolamento dos caminhos de transações e comprovantes pelo UID autenticado.
- Dashboard com saldo, entradas, despesas, gráfico comparativo e análise financeira; seções expansíveis com animações.
- Criação, edição e exclusão de transações com validações, estados de gravação, bloqueio de operações duplicadas e mensagens de erro.
- Edição por consulta direta ao ID, independente das páginas carregadas.
- Extrato com `FlatList`, páginas de 10 registros e carregamento adicional sob demanda.
- Filtros inclusivos de valor/data no Firestore e pesquisa por trecho de categoria em lotes limitados.
- Pré-carregamento e cache temporário da primeira página sem filtros, incluindo cursor e contagem.
- Upload de imagens/PDFs, preservação do comprovante existente e abertura do comprovante salvo no navegador do sistema.
- Formatação monetária e de datas brasileira, labels de acessibilidade, feedback nos botões e erros inline.

## Clean Architecture

`app/_layout.tsx` é o ponto de composição: instancia repositories Firebase, cria os casos de uso e os injeta no `TransactionsProvider`.

| Camada | Arquivos | Responsabilidade |
| --- | --- | --- |
| Domain | `src/domain/entities`, `repositories` e `errors` | Entidades, filtros, páginas, erros e contratos independentes de React, Expo ou Firebase |
| Application | `src/application/use-cases` | Criar, atualizar, excluir, obter por ID, obter resumo, obter páginas/contagem e coordenar gravação com comprovante |
| Infrastructure | `src/infrastructure/repositories` e `auth` | Firestore, Storage, conversões de datas/cursores e adaptador de persistência segura |
| Presentation | `app`, `contexts`, `hooks`, `components` e `constants` | Interface, navegação, autenticação observável, estado e coordenação das consultas |

Application depende dos contratos de Domain; Infrastructure implementa esses contratos. O Context de transações utiliza casos de uso e não importa o SDK Firebase. `AuthContext` e as telas de autenticação ainda acessam Firebase Auth diretamente: não há uma abstração de autenticação equivalente à de transações.

```text
app/
  _layout.tsx                 # Composição e navegação
  index.tsx                   # Dashboard
  login.tsx / register.tsx    # Autenticação
  transactions.tsx            # Extrato e filtros
  transaction-form.tsx        # Criação/edição e abertura de comprovante
contexts/
  AuthContext.tsx
  TransactionsContext.tsx
hooks/
  use-financial-summary.ts    # Store do resumo por UID
  use-transactions-pagination.ts # Paginação, pesquisa, cache e preloading
src/
  domain/                     # Transaction, FinancialSummary, páginas e contratos
  application/use-cases/      # Regras de coordenação da aplicação
  infrastructure/
    auth/                     # SecureAuthStorage e inicialização única
    repositories/             # FirebaseTransactionRepository / FirebaseReceiptRepository
firebaseConfig.ts
firebase.json
firestore.rules / storage.rules / firestore.indexes.json
tests/
```

A entidade `Transaction` usa `Date`, sem `Timestamp` do Firebase. O repository converte as datas ao ler/gravar. Os cursores preservam a precisão original do Firestore e não são reconstruídos a partir dos `Date` da entidade.

## Firebase e segurança

### Authentication e persistência local

O app usa Email/Password e `onAuthStateChanged()`. No nativo, `initializeAuth()` recebe `getReactNativePersistence()` com o adaptador SecureStore, que utiliza `getItemAsync()`, `setItemAsync()` e `deleteItemAsync()`, sem biometria obrigatória. Firebase continua responsável pelos tokens e pela renovação da sessão; não há gerenciamento manual desses tokens.

As chaves são codificadas deterministicamente por unidades UTF-16 de largura fixa, com escopo do projeto/Firebase App. A inicialização reutiliza Auth, adaptador e status durante Fast Refresh. Falhas do armazenamento são exibidas sem mensagens nativas sensíveis e bloqueiam o fluxo normal, desmontando os providers internos; não há fallback silencioso para AsyncStorage.

Na preparação, somente os registros legados `firebase:authUser:<apiKey>:<appName>`, `firebase:persistence:<apiKey>:<appName>` e `firebase:redirectUser:<apiKey>:<appName>` deste Firebase App são removidos do AsyncStorage. A sessão antiga não é copiada: o usuário faz login novamente. Outros dados locais e todos os dados remotos permanecem intactos. Logout remove a sessão segura e eventual registro legado correspondente.

No iOS, o Keychain pode sobreviver à reinstalação. Limites nativos de tamanho/disponibilidade variam; valores rejeitados resultam em erro explícito, sem truncamento ou armazenamento em texto puro. O cache financeiro descrito abaixo é separado da persistência de autenticação.

### Firestore, Storage e regras

- Transações: `users/{uid}/transactions/{transactionId}`.
- Comprovantes: `users/{uid}/receipts/{idAleatorio}`.
- `createdAt` e `updatedAt` são atribuídos com `serverTimestamp()` nas operações correspondentes.
- `firestore.rules` e `storage.rules` exigem usuário autenticado com UID igual ao segmento do caminho. Outros caminhos não recebem permissão nessas regras.
- As regras locais foram copiadas da configuração publicada fornecida pelo responsável pelo projeto. `firebase.json` referencia ambos os arquivos e os índices. A presença local não comprova o estado remoto atual; compare com o Firebase Console antes da entrega.
- As regras atuais isolam caminhos; não implementam validação de schema, valor monetário, tamanho ou MIME dos anexos no servidor.

As conexões dos SDKs utilizam HTTPS/TLS; Authentication, Firestore e Storage também protegem os dados em repouso, conforme a [documentação de segurança do Firebase](https://firebase.google.com/support/privacy#data_encryption). Isso não é criptografia ponta a ponta implementada pelo aplicativo. A proteção local adicionada nesta fase é a persistência nativa de Auth via SecureStore.

**URLs de download são sensíveis:** quem possuir um link válido com token poderá acessar o arquivo. Não publique esses links nem os registre em logs. As regras por UID não representam uma nova checagem de autenticação a cada acesso à URL com token.

### Índices versionados

`firestore.indexes.json` contém quatro índices da coleção `transactions`, todos com escopo `COLLECTION`:

| Finalidade | Campos na ordem do índice |
| --- | --- |
| Agregações de entradas/saídas | `type ASC`, `createdAt DESC`, `amount DESC` |
| Intervalo de valor | `createdAt DESC`, `amount DESC` |
| Intervalo de data | `createdAt DESC`, `date DESC` |
| Valor e data combinados | `createdAt DESC`, `amount DESC`, `date DESC` |

O desempate final dos índices é `__name__ DESC`. Categoria reutiliza as consultas de candidatos e não exige um índice de substring. Caso precise publicar somente os índices, após revisão e com Firebase CLI instalada/autenticada, execute explicitamente:

```bash
firebase deploy --only firestore:indexes --project tech-challenge-finance-mobile
```

Esse comando altera o Firebase remoto e não publica as regras. Aguarde todos os índices necessários ficarem ativos no Console. Alterações em regras exigem revisão e publicação explícitas separadas; iniciar o Expo não publica regras nem índices. `failed-precondition` pode indicar índice ausente/em construção e deve ser investigado, nunca tratado como coleção vazia.

## Dashboard e atualização dos dados

`GetFinancialSummary` obtém `transactionCount`, `totalIncome` e `totalExpense` por três consultas independentes com `getAggregateFromServer()`, `count()` e `sum("amount")`. As consultas mantêm `orderBy("createdAt", "desc")`, preservando o universo de documentos com esse campo. Os indicadores não dependem da lista paginada.

O saldo é entradas menos despesas. O gráfico compara os totais usando o maior entre entradas, despesas e 1 como referência. As fórmulas e animações estão em `app/index.tsx`.

O resumo é consultado na autenticação, no foco do dashboard, após CRUD confirmado e quando o aplicativo volta ao primeiro plano com o dashboard em foco. Requisições concorrentes são compartilhadas; respostas de revisões/UIDs antigos são descartadas. Antes da primeira resposta, a interface mostra carregamento; se uma atualização falhar, preserva o último resumo válido do mesmo UID e sinaliza desatualização/erro.

Context e stores publicam mudanças de estado para os componentes via hooks. Isso é atualização reativa da interface, **sem listener ilimitado `onSnapshot()` de transações**. Agregações não são assinaturas em tempo real. Alterações de outro dispositivo exigem nova consulta por foco/retorno ao primeiro plano; as três agregações não formam um snapshot atômico entre si.

## Paginação, filtros e contagem

`FirebaseTransactionRepository.getPage()` usa `getDocsFromServer()`, `limit(tamanho + 1)` e `startAfter()`. O documento adicional detecta `hasMore` e não é entregue na página. O extrato usa páginas de 10 itens com `onEndReached` para carregar dados sob demanda (lazy loading), sem limitar localmente uma coleção previamente carregada.

O painel de filtros inicia recolhido. O botão **Filtros** expande/recolhe os campos sem limpar os critérios nem reiniciar consultas. O resumo compacto dos critérios ativos, a ação **Limpar filtros** e eventuais erros de contagem com nova tentativa permanecem acessíveis no cabeçalho fixo. O resumo visual usa até duas linhas e disponibiliza o texto completo à acessibilidade. Mudanças de altura do painel não iniciam páginas adicionais: o carregamento automático retoma no próximo gesto de rolagem.

A ordem principal é sempre `createdAt DESC`. Sem intervalos, o desempate é ID descendente. Com valor, acrescenta `amount DESC`; com data, acrescenta `date DESC`; com ambos, valor precede data. O ID é sempre o último critério. A lista deduplica IDs; nenhuma ordenação global é simulada somente dentro da página.

Os limites de valor são inclusivos. A tela normaliza as datas para início/fim do dia local; no repository, o fim é expresso como menor que o milissegundo seguinte, incluindo os nanossegundos do último milissegundo. Não são filtros por `createdAt`: o intervalo de data usa o campo `date` da transação.

Sem categoria, `GetTransactionsCount` usa agregação `count()` com os mesmos filtros e campos de ordenação, sem cursor ou limite. Enquanto o total não está disponível, a interface não apresenta contagem parcial como total exato. Erros de página/contagem têm tratamento próprio e nova tentativa, sem indicar fim do histórico indevidamente.

O cursor opaco vincula UID, filtros, ordenação e valores originais do último documento entregue, incluindo segundos/nanossegundos dos timestamps. Ele não é uma credencial. Troca de UID/filtros, reinício e CRUD confirmado invalidam respostas antigas. Consultas já enviadas não são canceladas fisicamente pelo SDK; seus resultados são descartados quando obsoletos.

### Pesquisa por categoria

A semântica é `category.toLowerCase().includes(texto.trim().toLowerCase())`: remove espaços nas extremidades da pesquisa e ignora maiúsculas/minúsculas, sem retirar acentos ou espaços internos.

`GetTransactionsPage` busca lotes de candidatos pelo mesmo repository, com os filtros remotos de data/valor, e aplica a categoria localmente a cada lote. Continua até preencher a página, esgotar candidatos ou atingir o orçamento por ação. A composição configura lotes de até 10 e **100 leituras potenciais por ação**, reservando `tamanho do lote + 1` para incluir o documento adicional de paginação. Portanto, uma ação pode examinar menos de 100 candidatos; esse orçamento não é uma medição completa do faturamento de entradas de índice/regras.

Todo candidato examinado avança o cursor, mesmo sem corresponder à categoria. Se o orçamento terminar com candidatos restantes, aparece **Continuar pesquisa** e o carregamento automático fica suspenso. O total só se torna conhecido ao esgotar a varredura; antes disso, a interface mostra a quantidade encontrada e pesquisa em andamento. A mensagem de ausência de resultados só aparece após esgotar os candidatos.

Falhas intermediárias não publicam itens/cursor parciais daquela ação. A tentativa seguinte retoma do cursor anterior e pode repetir leituras, preservando as páginas concluídas. Pesquisas raras/inexistentes podem exigir várias ações e examinar todos os candidatos ao longo delas; não há consulta ilimitada para calcular a contagem.

## Cache, preloading e gerenciamento de estado

Ao receber foco autenticado, o dashboard chama `preloadFirstPage()`. O store existente reutiliza os casos de uso de página/contagem e guarda em memória somente a **primeira página sem filtros**, cursor, `hasMore` e contagem. Não há um segundo mecanismo de paginação.

- Chave com UID e filtros normalizados; consultas filtradas não alimentam nem reutilizam esse cache.
- TTL de **30 segundos**, contado após a conclusão bem-sucedida da página e da contagem; acessos não renovam a validade.
- Expiração verificada no acesso, sem polling ou temporizador.
- Dentro do TTL, abrir o extrato sem filtros reutiliza página/contagem sem repetir `getPage()`/`getCount()`; páginas seguintes continuam com o cursor original.
- Preloading e abertura simultâneos compartilham a operação em andamento. Falhas de preloading não impedem a abertura normal.
- Sair da tela limpa o estado visível e invalida respostas pendentes, mas preserva o cache até expirar.
- CRUD confirmado, logout, troca de UID ou desmontagem do Provider invalidam os dados afetados. Respostas antigas não podem repovoar o cache.
- Nenhum dado financeiro é persistido em AsyncStorage, SecureStore ou disco por esse cache.

Os stores de paginação/resumo pertencem ao UID e expõem snapshots por `useSyncExternalStore`; Context disponibiliza as operações. Há estados separados para carregamento inicial, páginas adicionais, contagem, resumo e erros, com bloqueios de concorrência e descarte de respostas antigas.

Para comprovar o cache, os testes de preloading contam chamadas ao repository. No dispositivo, abra o extrato sem filtros em menos de 30 segundos após o preloading; `firstPageSource` no Context deve ser `"cache"`. Uma consulta da próxima página com cursor não é uma repetição da primeira. Não são necessários logs permanentes. Alterações externas podem ficar desatualizadas durante o TTL; preloading pode gerar leituras mesmo se o usuário não abrir o extrato.

## CRUD e comprovantes

O formulário rejeita `NaN`, infinitos, zero e valores negativos. Os casos de uso de criação/edição também exigem valor finito maior que zero. Há bloqueio síncrono antes da próxima renderização para toques rápidos em Salvar, botão desabilitado durante gravação e proteção contra exclusões/confirmações repetidas. O Context compartilha operações equivalentes em andamento por UID e rejeita ausência de autenticação.

`SaveTransactionWithReceipt` coordena upload e os casos de uso existentes. Erros preservam os campos e o arquivo selecionado; a tela só retorna após sucesso confirmado. Falhas na atualização de página/resumo não transformam uma gravação bem-sucedida em erro de salvamento.

### Upload e visualização

1. DocumentPicker seleciona imagem/PDF e fornece URI, nome e MIME.
2. `FirebaseReceiptRepository` cria um caminho com ID aleatório, sem sobrescrever o comprovante anterior.
3. O MIME segue a prioridade: tipo específico do picker, extensão conhecida (`pdf`, `jpg`, `jpeg`, `png`), tipo específico do Blob e, por fim, `application/octet-stream` para desconhecidos.
4. O upload informa explicitamente `contentType` e `contentDisposition: "inline"`.
5. `getDownloadURL()` fornece a URL que será salva em `receiptUrl` no documento da transação.

A edição usa `GetTransactionById` e preserva a URL antiga quando não há novo arquivo. **Abrir comprovante atual** aparece somente na edição com URL salva e usa `expo-web-browser.openBrowserAsync()`, sem gravar dados. A abertura possui bloqueio de toques repetidos e erro amigável, sem logs de URLs/tokens. Novo arquivo selecionado aparece como **ainda não salvo**; abrir o atual continua apontando para o comprovante já gravado.

A renderização de PDF/imagem depende do formato e dos metadados HTTP. Erros HTTP podem aparecer no próprio navegador e não ser uma rejeição de `openBrowserAsync()`. A correção de MIME só afeta novos uploads; metadados de arquivos antigos não são alterados automaticamente.

### Limpeza conservadora

Somente o upload novo pode ser removido automaticamente, quando não foi associado: após rejeição explícita da gravação (`permission-denied`, `unauthenticated`, `invalid-argument`, `not-found`, `already-exists`) ou falha em obter a URL antes de tentar gravar a transação. Falhas de limpeza são informadas sem ocultar o erro original.

Em resultado inconclusivo, o arquivo é preservado e a interface orienta conferir o extrato antes de repetir. Comprovantes antigos não são apagados automaticamente em edição ou exclusão. A autorização local de limpeza é descartada ao terminar a tentativa e não substitui as regras remotas. Storage e Firestore não são uma operação atômica: encerramento do app, limpeza malsucedida ou resultado inconclusivo podem deixar órfãos.

## Testes e verificações

Os testes usam `node:test`, TypeScript para carregar os módulos e mocks controlados dos serviços nativos/Firebase. Parte das verificações exercita contratos do SDK instalado e construção de consultas; não existe uma suíte de regras em Emulator Suite ou testes end-to-end de dispositivo neste repositório.

```bash
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
git diff --check
```

Na revisão desta etapa, a suíte contém **131 testes**, cobrindo:

- Agregações financeiras e seus estados de erro, atualização, concorrência e isolamento por UID.
- Páginas vazias/intermediárias/finais, precisão dos cursores, filtros, contagem e rejeição de cursores incompatíveis.
- Categoria rara/inexistente, orçamento com documento adicional, continuação e falhas de rede.
- Cache/preloading, TTL com relógio controlado, compartilhamento de operações, invalidação e continuidade.
- Falhas de CRUD/upload/limpeza, toques rápidos, ausência de usuário, valores inválidos e preservação do formulário.
- Visualização sem gravações, MIME de PDF/JPEG/PNG, arquivos desconhecidos e ausência de alterações automáticas em objetos antigos.
- Persistência segura, limpeza das chaves legadas, logout, Fast Refresh e mensagens sanitizadas.

Os testes não comprovam regras/índices publicados, cobrança real, Keychain nativo ou renderização de arquivos no iPhone. Não há percentual de cobertura configurado; a quantidade de testes não representa cobertura total dos comportamentos.

### Roteiro de validação no iPhone

1. Cadastrar/logar, fechar/reabrir mantendo sessão, fazer logout e confirmar que ela não reaparece; alternar entre duas contas.
2. Criar/editar/excluir com toques rápidos; conferir resultados, atualização do dashboard e limpeza dos campos somente por navegação após sucesso.
3. Testar desconexão/reconexão: uma gravação pode permanecer pendente até a rede voltar, sem sucesso antecipado. Após erro, conferir campos preservados e nova tentativa.
4. Percorrer conjuntos com 0, 1, 10, 11 e mais de 20 transações; combinar limites de data/valor e conferir a contagem.
5. Pesquisar categoria comum, rara e inexistente; usar **Continuar pesquisa** quando houver candidatos restantes e testar alteração de filtros durante leitura.
6. Abrir o extrato dentro e fora do TTL; verificar continuidade das páginas, CRUD e troca de UID sem reutilização incompatível.
7. Enviar um PDF novo e uma imagem JPEG/PNG nova; salvar, reabrir a edição e visualizar. Confirmar MIME/`inline` no Storage e preservação do formulário ao voltar.
8. Selecionar novo comprovante sem salvar e abrir o atual; confirmar que a URL salva continua sendo usada. Verificar edição sem novo arquivo e cancelamento sem gravação.
9. Testar as permissões e os quatro índices no ambiente Firebase autorizado; mocks locais não substituem essa verificação.

## Limitações conhecidas

- Não há sincronização contínua da coleção ou agregações: os dados são renovados nas ações descritas, com possível defasagem por cache/foco.
- Páginas, contagem e agregações são leituras independentes. Alterações concorrentes podem mudar o universo, gerar diferenças temporárias ou fazer itens cruzarem fronteiras; deduplicar IDs não cria um snapshot atômico. Reiniciar a consulta atualiza o universo.
- Categoria usa varredura limitada no cliente, sem mecanismo de busca textual do servidor; continuar até o fim pode examinar todo o conjunto de candidatos e repetir documentos adicionais de paginação.
- `limit()` e o orçamento de categoria restringem documentos potencialmente entregues, sem limitar todos os custos de entradas de índice. A ordem por criação pode exigir mais varredura de índice nos intervalos.
- A edição por ID usa `getDoc()` padrão do SDK, enquanto páginas/agregações exigem servidor; não há uma política própria de cache/offline para edição.
- O Firestore pode manter gravações pendentes offline. Não foi adicionado timeout que anuncie falha enquanto a operação ainda pode ser confirmada depois.
- Comprovantes dependem de conectividade, formato e metadados. Arquivos antigos podem precisar de correção explícita; anexos antigos e órfãos não têm coleta automática.
- SecureStore protege a persistência nativa de Auth, sem garantir suporte a qualquer tamanho de payload. Não há biometria obrigatória, App Check ou criptografia ponta a ponta implementados.
- Auth ainda depende diretamente do Firebase em Presentation; a separação por repositories/casos de uso está concentrada nas transações e comprovantes.
- A suíte automatizada não inclui Firebase remoto, regras em emulador ou testes end-to-end. A validação no iPhone permanece necessária antes da entrega.
