/** Inclusive bounds, matching comparisons against the entity's Date/number. */
export type TransactionFilters = {
  minAmount?: number;
  maxAmount?: number;
  startDate?: Date;
  /** Inclusive millisecond; includes Firestore precision within that millisecond. */
  endDate?: Date;
};

/** Category is evaluated by Application on bounded repository candidate pages. */
export type TransactionSearchFilters = TransactionFilters & { category?: string };
