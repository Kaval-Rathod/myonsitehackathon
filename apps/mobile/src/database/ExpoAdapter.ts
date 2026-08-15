import * as SQLite from 'expo-sqlite';
import { DatabaseAdapter, DatabaseTransaction } from './DatabaseAdapter';

export class ExpoAdapter implements DatabaseAdapter {
  constructor(private db: SQLite.SQLiteDatabase) {}

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.db.runAsync(sql, params as any);
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return await this.db.getAllAsync<T>(sql, params as any);
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    let result: T;
    // @ts-ignore
    await this.db.withTransactionAsync(async () => {
      // expo-sqlite withTransactionAsync wraps the callback in a transaction and auto-commits, or rolls back if it throws.
      // However, we don't get a 'tx' object in the new API; all commands are executed on the db instance directly inside the transaction.
      const txAdapter: DatabaseTransaction = {
        execute: async (sql: string, params: unknown[] = []) => {
          await this.db.runAsync(sql, params as any);
        },
        query: async <U>(sql: string, params: unknown[] = []) => {
          return await this.db.getAllAsync<U>(sql, params as any);
        }
      };
      result = await callback(txAdapter);
    });
    return result!;
  }
}
