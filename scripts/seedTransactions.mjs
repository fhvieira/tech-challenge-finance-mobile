import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  getFirestore,
} from "firebase/firestore";

// Temporary development seed.
// Required environment variables:
// - SEED_USER_EMAIL
// - SEED_USER_PASSWORD
const REQUIRED_TRANSACTION_COUNT = 100;

const firebaseConfig = {
  apiKey: "AIzaSyDyKTeaXpNsIN9fhoFg3EZRLv6N3Nr2h-0",
  authDomain: "tech-challenge-finance-mobile.firebaseapp.com",
  projectId: "tech-challenge-finance-mobile",
  storageBucket: "tech-challenge-finance-mobile.firebasestorage.app",
  messagingSenderId: "1018875833545",
  appId: "1:1018875833545:web:590b7c3638d3b4501af118",
};

const incomes = [
  {
    category: "Salário",
    description: "Pagamento mensal",
    amount: 5200,
    day: 5,
  },
  {
    category: "Freelance",
    description: "Projeto de consultoria",
    amount: 1250,
    day: 14,
  },
  {
    category: "Freelance",
    description: "Serviço avulso",
    amount: 780,
    day: 24,
  },
];

const expenseTemplates = [
  { category: "Alimentação", description: "Almoço durante a semana", min: 32, max: 68 },
  { category: "Mercado", description: "Compras do mês", min: 180, max: 640 },
  { category: "Transporte", description: "Aplicativo de transporte", min: 18, max: 95 },
  { category: "Combustível", description: "Abastecimento do veículo", min: 120, max: 320 },
  { category: "Moradia", description: "Aluguel e condomínio", min: 1450, max: 2300 },
  { category: "Lazer", description: "Cinema e restaurantes", min: 70, max: 260 },
  { category: "Saúde", description: "Farmácia e consultas", min: 45, max: 420 },
  { category: "Educação", description: "Curso e materiais", min: 90, max: 480 },
  { category: "Assinaturas", description: "Serviços digitais", min: 19, max: 89 },
  { category: "Outros", description: "Despesa eventual", min: 35, max: 250 },
];

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function amountFromRange(min, max, seed) {
  const ratio = ((seed * 37) % 100) / 100;
  return roundCurrency(min + (max - min) * ratio);
}

function createDate(monthOffset, day, hourSeed) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthOffset);
  date.setDate(day);
  date.setHours(9 + (hourSeed % 10), (hourSeed * 7) % 60, 0, 0);
  return date;
}

function buildTransactions() {
  const transactions = [];

  for (let monthOffset = 7; monthOffset >= 0; monthOffset -= 1) {
    const salary = incomes[0];
    const salaryDate = createDate(monthOffset, salary.day, monthOffset);
    const salaryTimestamp = Timestamp.fromDate(salaryDate);

    transactions.push({
      type: "income",
      amount: salary.amount + (monthOffset % 3) * 150,
      category: salary.category,
      description: salary.description,
      date: salaryTimestamp,
      receiptUrl: null,
      createdAt: salaryTimestamp,
    });

    if (monthOffset % 2 === 0) {
      const freelance = incomes[1];
      const freelanceDate = createDate(monthOffset, freelance.day, monthOffset + 3);
      const freelanceTimestamp = Timestamp.fromDate(freelanceDate);

      transactions.push({
        type: "income",
        amount: freelance.amount + monthOffset * 45,
        category: freelance.category,
        description: freelance.description,
        date: freelanceTimestamp,
        receiptUrl: null,
        createdAt: freelanceTimestamp,
      });
    }

    if (monthOffset === 1 || monthOffset === 5) {
      const freelance = incomes[2];
      const freelanceDate = createDate(monthOffset, freelance.day, monthOffset + 9);
      const freelanceTimestamp = Timestamp.fromDate(freelanceDate);

      transactions.push({
        type: "income",
        amount: freelance.amount + monthOffset * 30,
        category: freelance.category,
        description: freelance.description,
        date: freelanceTimestamp,
        receiptUrl: null,
        createdAt: freelanceTimestamp,
      });
    }
  }

  let expenseSeed = 1;

  while (transactions.length < REQUIRED_TRANSACTION_COUNT) {
    const template = expenseTemplates[expenseSeed % expenseTemplates.length];
    const monthOffset = 7 - (expenseSeed % 8);
    const day = 2 + ((expenseSeed * 3) % 26);
    const expenseDate = createDate(monthOffset, day, expenseSeed);
    const expenseTimestamp = Timestamp.fromDate(expenseDate);

    transactions.push({
      type: "expense",
      amount: amountFromRange(template.min, template.max, expenseSeed),
      category: template.category,
      description: template.description,
      date: expenseTimestamp,
      receiptUrl: null,
      createdAt: expenseTimestamp,
    });

    expenseSeed += 1;
  }

  return transactions.slice(0, REQUIRED_TRANSACTION_COUNT);
}

async function seedTransactions() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Defina SEED_USER_EMAIL e SEED_USER_PASSWORD antes de executar o seed.",
    );
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log("Autenticando usuário de teste...");
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const userId = credential.user.uid;

  const transactions = buildTransactions();
  const transactionsRef = collection(db, "users", userId, "transactions");

  console.log(`Criando ${transactions.length} transações em users/${userId}/transactions...`);

  for (const [index, transaction] of transactions.entries()) {
    await addDoc(transactionsRef, transaction);

    if ((index + 1) % 10 === 0 || index + 1 === transactions.length) {
      console.log(`${index + 1}/${transactions.length} transações criadas`);
    }
  }

  console.log(`Seed finalizado com sucesso: ${transactions.length} transações criadas.`);
}

seedTransactions().catch((error) => {
  console.error("Falha ao executar seed de transações.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
