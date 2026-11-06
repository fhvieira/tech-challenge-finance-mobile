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

O app usa React Context API. `AuthProvider` observa o Firebase Authentication com `onAuthStateChanged` e expõe o usuário atual. `TransactionsProvider` fica dentro do `AuthProvider`, pois as transações dependem do UID autenticado; ele escuta a coleção do usuário em tempo real e disponibiliza adicionar, editar e excluir.

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

A lista usa carregamento progressivo client-side em lotes de 10 itens. As transações do usuário são carregadas pelo contexto, os filtros são aplicados localmente e mais itens são revelados conforme o usuário chega ao final da lista.

A tela exibe contador progressivo, como `20 de 100 transações`, ou `20 de 37 transações filtradas` quando há filtros ativos. Durante o carregamento de mais itens, mostra `Carregando mais transações...`.

## Upload de Comprovantes

Fluxo implementado:

1. O usuário seleciona imagem ou PDF com Expo Document Picker.
2. O arquivo é enviado para Firebase Storage.
3. A aplicação obtém a URL de download.
4. A URL é salva em `receiptUrl` no Firestore.

Ao editar uma transação sem selecionar novo comprovante, a URL existente é preservada.

## Acessibilidade e UX

A aplicação inclui labels de acessibilidade, áreas de toque adequadas, feedback visual nas ações, fechamento do teclado em formulários, validações inline e formatação de valores monetários e datas no padrão brasileiro.
