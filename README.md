# Tech Challenge — Finance Mobile · Fase 4

Aplicativo de finanças pessoais desenvolvido para o **Tech Challenge Fase 4 da FIAP Pós-Tech**, com registro de entradas e despesas, indicadores financeiros e extrato com filtros e comprovantes.

**Tecnologias principais:** Expo SDK 58, React Native, TypeScript, Expo Router e Firebase (Authentication, Firestore e Storage). As versões estão em [`package.json`](package.json) e `package-lock.json`. O foco de validação é o iPhone físico com Expo Go compatível.

## Funcionalidades

- Cadastro, login, logout e persistência segura da sessão nativa.
- Dashboard com saldo, entradas, despesas, gráfico e análise financeira.
- Criação, edição e exclusão de transações com validações e feedback de erros.
- Extrato paginado com filtros de valor, data e categoria.
- Upload de imagens/PDFs e abertura dos comprovantes salvos.
- Pré-carregamento e cache temporário do extrato, formatação brasileira e recursos de acessibilidade.

## Requisitos da Fase 4

| Requisito | Implementação |
| --- | --- |
| Clean Architecture | Quatro camadas, com contratos e casos de uso para transações e comprovantes. |
| Gerenciamento de estado | Context API e stores com `useSyncExternalStore`. |
| Programação reativa | Componentes atualizados pelos stores e autenticação observada com `onAuthStateChanged()`. |
| Lazy loading | `FlatList` carrega páginas de 10 transações sob demanda, com paginação no Firestore. |
| Preloading | Dashboard antecipa a primeira página sem filtros e sua contagem. |
| Cache | Primeira página e contagem em memória por 30 segundos, isoladas por usuário. |
| Segurança | Firebase Authentication, regras por UID e SecureStore para persistência nativa da sessão. |

**Consulta rápida:** [Arquitetura](#clean-architecture) · [Execução](#configuração-e-execução) · [Funcionamento](#funcionamento) · [Segurança](#segurança) · [Testes](#testes-e-verificações) · [Dados de teste](#script-opcional-de-dados-de-teste)

## Clean Architecture

| Camada | Responsabilidade |
| --- | --- |
| Domain | Entidades e contratos independentes de React, Expo e Firebase. |
| Application | Casos de uso para consultas, resumo financeiro e gravações com comprovantes. |
| Infrastructure | Implementação dos repositories de Firestore/Storage e persistência segura de Auth. |
| Presentation | Telas, navegação, Contexts e stores responsáveis pela interface e seu estado. |

[`app/_layout.tsx`](app/_layout.tsx) compõe os repositories e casos de uso e os injeta no `TransactionsProvider`. Application depende dos contratos de Domain, implementados por Infrastructure.

A separação arquitetural está concentrada em **transações e comprovantes**. O Context e as telas de autenticação ainda acessam Firebase Auth diretamente.

## Configuração e execução

### Pré-requisitos

- Node.js compatível; a versão de referência do projeto é **24.14.1**.
- npm e acesso à rede para instalar as dependências.
- Expo Go compatível com **SDK 58** e conectividade entre iPhone e computador.
- Projeto Firebase com **Email/Password** habilitado em Authentication, Firestore e Storage configurados.

### Instalação

```bash
git clone https://github.com/fhvieira/tech-challenge-finance-mobile.git
cd tech-challenge-finance-mobile
npx --yes npm@11.21.1 ci
```

O npm 11.21.1 é usado temporariamente para compatibilidade na instalação, sem substituir o npm global. O comando respeita o lockfile; evite `--force` e `--legacy-peer-deps`.

### Configuração Firebase e variáveis de ambiente

Copie o modelo na raiz do projeto, sem sobrescrever um `.env` já preenchido:

```bash
cp .env.example .env
```

Preencha as seis variáveis com a **configuração Web do seu projeto Firebase**, disponível no Firebase Console:

| Variável | Campo Firebase |
| --- | --- |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | `appId` |

Reinicie o Expo e recarregue o aplicativo após preencher o arquivo. Campos ausentes ou vazios impedem a inicialização. O `.env` é ignorado pelo Git; versione apenas o `.env.example` com valores vazios.

**Essas variáveis são públicas no aplicativo. Não inclua senhas, tokens ou chaves privadas.** A proteção dos dados depende da autenticação e das regras do Firebase.

Confira no Firebase Console as regras e os índices correspondentes a [`firestore.rules`](firestore.rules), [`storage.rules`](storage.rules) e [`firestore.indexes.json`](firestore.indexes.json). Os arquivos locais não comprovam a configuração remota; iniciar o Expo não os publica. Os quatro índices devem estar ativos para as consultas de agregação e filtros.

### Iniciar o aplicativo

```bash
npm start -- --go
```

Abra o QR Code no iPhone com Expo Go. Em rede local, mantenha computador e celular na mesma rede. Se necessário, limpe o cache do Metro:

```bash
npx expo start --go --clear
```

Também estão disponíveis `npm run ios`, `npm run android` e `npm run web`; simuladores/emuladores exigem seus ambientes nativos. A validação no iPhone não comprova todos os fluxos Android/Web.

## Funcionamento

### Estado reativo e dashboard

A **Context API** disponibiliza as operações, enquanto stores com **`useSyncExternalStore`** atualizam os componentes e controlam estados de carregamento e erro por usuário.

O dashboard calcula saldo, entradas e despesas com agregações do Firestore, independentes das páginas do extrato. Atualiza os dados na autenticação, no foco da tela, após CRUD confirmado e no retorno ao primeiro plano com o dashboard em foco.

A interface é reativa, mas **não há sincronização contínua das transações**. Alterações de outro dispositivo dependem de nova consulta; páginas, contagens e agregações são leituras independentes.

### Paginação e filtros

O extrato usa `FlatList` e `onEndReached` para buscar **10 registros por página**, com `limit()` e `startAfter()` no Firestore, ordenados principalmente por criação decrescente.

- **Valor e data:** filtros inclusivos executados no Firestore; a data considera o dia local da transação. A contagem usa os mesmos filtros.
- **Categoria:** pesquisa por trecho, sem diferenciar maiúsculas/minúsculas, aplicada no cliente a lotes de candidatos. O orçamento é de 100 leituras potenciais por ação.
- **Continuação:** quando necessário, **Continuar pesquisa** permite avançar; o total por categoria só é conhecido ao concluir a busca. Pesquisas raras podem percorrer todos os candidatos em várias ações.

O painel de filtros pode ser recolhido sem perder critérios. Falhas de consulta exibem erro e opção de nova tentativa.

### Cache e preloading

Ao receber foco autenticado, o dashboard pré-carrega a **primeira página sem filtros e sua contagem**. O extrato reutiliza esses dados em memória durante **30 segundos**, mantendo a continuidade da paginação.

Consultas filtradas não usam esse cache. CRUD confirmado, logout, troca de usuário ou desmontagem do Provider invalidam os dados. O cache não persiste dados financeiros em disco; alterações externas podem ficar desatualizadas durante sua validade, e o preloading pode gerar leituras sem abertura do extrato.

### CRUD e comprovantes

O formulário valida valores positivos e finitos, bloqueia envios repetidos e preserva os campos em caso de erro. A edição busca a transação pelo ID, independentemente das páginas carregadas. Gravações só são apresentadas como concluídas após confirmação; sem rede, podem permanecer pendentes.

Comprovantes de imagem/PDF são enviados ao Storage e vinculados à transação. A edição preserva o comprovante existente quando não há novo arquivo; **Abrir comprovante atual** abre a URL salva no navegador do sistema, sem gravar alterações.

A visualização depende da conectividade e dos metadados do arquivo. Storage e Firestore não gravam de forma atômica, e anexos antigos ou órfãos não têm coleta automática.

## Segurança

- Firebase Authentication identifica o usuário; as regras de Firestore e Storage restringem os caminhos ao seu **UID**.
- **SecureStore** protege a persistência nativa de Auth, sem fallback para tokens em AsyncStorage. Na Web, utiliza-se a persistência padrão do Firebase.
- A migração da persistência antiga exige reinício completo e novo login. No iOS, a sessão no Keychain pode sobreviver à reinstalação.
- As regras atuais isolam usuários, mas não validam schema, tamanho ou MIME de anexos no servidor. Não há App Check nem criptografia ponta a ponta implementados.
- **URLs de comprovantes com token permitem acesso a quem possuir o link:** não as publique nem registre em logs.

## Testes e verificações

A suíte contém **139 testes** com `node:test` e mocks de Firebase/serviços nativos. Abrange resumo financeiro, paginação, filtros, cache/preloading, CRUD, comprovantes, autenticação segura e configuração por ambiente.

```bash
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
git diff --check
```

Não há percentual de cobertura configurado, suíte de regras em emulador ou testes end-to-end. Os testes locais não comprovam regras/índices publicados nem comportamento nativo no iPhone.

Para validação manual, confira login/logout e troca de conta, CRUD, paginação/filtros, cache dentro e fora do TTL, upload/abertura de PDF e imagem e comportamento sem conexão.

## Script opcional de dados de teste

`scripts/seedTransactions.mjs` usa as mesmas seis variáveis Firebase e exige `SEED_USER_EMAIL` e `SEED_USER_PASSWORD` no terminal ou no `.env` local. Essas credenciais não recebem prefixo `EXPO_PUBLIC_` e não devem ser versionadas.

**Cada execução adiciona 100 transações ao Firestore do usuário informado, sem apagar as anteriores. Execute somente em conta/ambiente de teste autorizado; não é necessário para iniciar o aplicativo.**

```bash
node --env-file=.env scripts/seedTransactions.mjs
```
