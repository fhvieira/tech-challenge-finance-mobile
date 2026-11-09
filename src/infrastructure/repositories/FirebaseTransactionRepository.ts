import {
  addDoc,
  collection,
  count,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocsFromServer,
  getAggregateFromServer,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  sum,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import type { DocumentData, Firestore, QueryConstraint } from "firebase/firestore";
import type { Transaction, TransactionInput } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";
import type { FinancialSummary } from "../../domain/entities/FinancialSummary";
import type { TransactionCursor, TransactionPage } from "../../domain/entities/TransactionPage";
import type { TransactionFilters } from "../../domain/entities/TransactionFilters";

export class FirebaseTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Firestore) {}

  async getPage(
    userId: string,
    pageSize = 10,
    cursor?: TransactionCursor | null,
    filters: TransactionFilters = {}
  ): Promise<TransactionPage> {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || !Number.isSafeInteger(pageSize + 1)) {
      throw new Error("O tamanho da página deve ser um inteiro positivo seguro.");
    }

    const specification = pageSpecification(filters);
    const constraints = [...specification.constraints];
    if (cursor != null) {
      constraints.push(startAfter(...decodeCursor(cursor, userId, specification)));
    }
    if (specification.empty) return { transactions: [], nextCursor: null, hasMore: false };
    constraints.push(limit(pageSize + 1));

    // A cache-only partial result must not be mistaken for the final page.
    const snapshot = await getDocsFromServer(query(
      collection(this.db, "users", userId, "transactions"),
      ...constraints
    ));
    const documents = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;
    const last = documents[documents.length - 1];

    return {
      transactions: documents.map((document) => toTransaction(document.id, document.data())),
      hasMore,
      nextCursor: hasMore ? encodeCursor(userId, last.id, last.data(), specification) : null,
    };
  }

  async getCount(userId: string, filters: TransactionFilters = {}): Promise<number> {
    const specification = pageSpecification(filters);
    if (specification.empty) return 0;
    // Same universe/order constraints as pages, without cursor or limit.
    const result = await getAggregateFromServer(query(
      collection(this.db, "users", userId, "transactions"), ...specification.constraints
    ), { transactionCount: count() });
    return result.data().transactionCount;
  }

  async getFinancialSummary(userId: string): Promise<FinancialSummary> {
    // Keep the same document-existence constraint as the reactive list.
    const baseQuery = query(
      collection(this.db, "users", userId, "transactions"),
      orderBy("createdAt", "desc")
    );
    const [total, income, expense] = await Promise.all([
      getAggregateFromServer(baseQuery, { transactionCount: count() }),
      getAggregateFromServer(query(baseQuery, where("type", "==", "income")), {
        totalIncome: sum("amount"),
      }),
      getAggregateFromServer(query(baseQuery, where("type", "==", "expense")), {
        totalExpense: sum("amount"),
      }),
    ]);

    return {
      transactionCount: total.data().transactionCount,
      totalIncome: income.data().totalIncome,
      totalExpense: expense.data().totalExpense,
    };
  }

  async getById(userId: string, id: string): Promise<Transaction | null> {
    const snapshot = await getDoc(doc(this.db, "users", userId, "transactions", id));

    return snapshot.exists() ? toTransaction(snapshot.id, snapshot.data()) : null;
  }

  async create(userId: string, transaction: TransactionInput): Promise<void> {
    await addDoc(collection(this.db, "users", userId, "transactions"), {
      ...transaction,
      date: Timestamp.fromDate(transaction.date),
      createdAt: serverTimestamp(),
    });
  }

  async update(
    userId: string,
    id: string,
    transaction: TransactionInput
  ): Promise<void> {
    await updateDoc(doc(this.db, "users", userId, "transactions", id), {
      ...transaction,
      date: Timestamp.fromDate(transaction.date),
      updatedAt: serverTimestamp(),
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await deleteDoc(doc(this.db, "users", userId, "transactions", id));
  }
}

type PageSpecification = {
  constraints: QueryConstraint[];
  fields: string[];
  scope: string;
  empty: boolean;
};

function pageSpecification(filters: TransactionFilters): PageSpecification {
  const { minAmount, maxAmount, startDate, endDate } = filters;
  for (const date of [startDate, endDate]) {
    if (date !== undefined && !Number.isFinite(date.getTime())) throw new Error("Data de filtro inválida.");
  }
  // NaN and reversed intervals matched no records in the original local filters.
  // Unbounded numeric intervals retain their existing JavaScript semantics.
  const empty = Number.isNaN(minAmount) || Number.isNaN(maxAmount) ||
    minAmount === Infinity || maxAmount === -Infinity ||
    (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) ||
    (startDate !== undefined && endDate !== undefined && startDate > endDate);
  const constraints: QueryConstraint[] = [];
  const fields = ["createdAt"];
  const hasAmount = (minAmount !== undefined && minAmount !== -Infinity) ||
    (maxAmount !== undefined && maxAmount !== Infinity);
  const hasDate = startDate !== undefined || endDate !== undefined;
  if (!empty) {
    if (minAmount !== undefined && minAmount !== -Infinity) constraints.push(where("amount", ">=", minAmount));
    if (maxAmount !== undefined && maxAmount !== Infinity) constraints.push(where("amount", "<=", maxAmount));
    if (startDate !== undefined) constraints.push(where("date", ">=", Timestamp.fromDate(startDate)));
    // Entity Dates truncate nanoseconds. '< end + 1 ms' preserves that inclusive
    // comparison, including the last millisecond of the local day (also on DST).
    if (endDate !== undefined) constraints.push(where("date", "<", Timestamp.fromDate(new Date(endDate.getTime() + 1))));
  }
  if (hasAmount) fields.push("amount");
  if (hasDate) fields.push("date");
  fields.push("__name__");
  constraints.push(...fields.map((field) => orderBy(field === "__name__" ? documentId() : field, "desc")));
  return {
    constraints, fields, empty: Boolean(empty),
    scope: JSON.stringify([
      minAmount === undefined ? null : String(minAmount), maxAmount === undefined ? null : String(maxAmount),
      startDate?.getTime() ?? null, endDate?.getTime() ?? null,
      fields.map((field) => [field, "desc"]),
    ]),
  };
}

// Stateless, versioned tokens retain Firestore precision, never entity Dates.
// No snapshots or user state are retained by this repository. Consumers discard
// tokens on logout/UID changes; decodeCursor also rejects cross-user reuse.
// Tokens are not secrets or authorization: Firestore rules still protect reads.
function encodeCursor(userId: string, id: string, data: DocumentData, specification: PageSpecification): TransactionCursor {
  const boundary = {
    version: 2, userId, scope: specification.scope,
    values: specification.fields.map((field) => {
      const value = field === "__name__" ? id : data[field];
      if (value instanceof Timestamp) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
      return value;
    }),
  };
  return encodeURIComponent(JSON.stringify(boundary)) as TransactionCursor;
}

function decodeCursor(cursor: TransactionCursor, userId: string, specification: PageSpecification): unknown[] {
  try {
    const boundary = JSON.parse(decodeURIComponent(cursor));
    if (
      !boundary || boundary.version !== 2 || boundary.userId !== userId || boundary.scope !== specification.scope ||
      !Array.isArray(boundary.values) || boundary.values.length !== specification.fields.length
    ) throw new Error();
    return specification.fields.map((field, index) => {
      const value = boundary.values[index];
      if (field === "__name__") {
        if (typeof value !== "string" || !value || value.includes("/")) throw new Error();
        return value;
      }
      if (field === "amount") {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error();
        return value;
      }
      if (field === "createdAt" && value === null) return null;
      if (!value || !Number.isInteger(value.seconds) || !Number.isInteger(value.nanoseconds)) throw new Error();
      return new Timestamp(value.seconds, value.nanoseconds);
    });
  } catch {
    throw new Error("Cursor de transações inválido para o usuário, filtros ou ordenação.");
  }
}

function toTransaction(id: string, transaction: DocumentData): Transaction {
  return {
    id,
    type: transaction.type,
    amount: transaction.amount,
    category: transaction.category,
    description: transaction.description,
    date: transaction.date.toDate(),
    receiptUrl: transaction.receiptUrl,
    // Server timestamps may be pending in local snapshots.
    createdAt: transaction.createdAt?.toDate(),
    updatedAt: transaction.updatedAt?.toDate(),
  };
}
