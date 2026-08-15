export interface DatabaseAdapter {
  /**
   * Executes a SQL statement (INSERT, UPDATE, DELETE).
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Queries the database and returns an array of typed objects.
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Runs the provided queries inside a transaction.
   * If any query throws, the transaction must be rolled back.
   */
  transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
}

export interface DatabaseTransaction {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}
