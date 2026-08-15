import sqlite3 from 'sqlite3';
import { DatabaseAdapter, DatabaseTransaction } from '../src/database/DatabaseAdapter';

export class NodeAdapter implements DatabaseAdapter {
  private db: sqlite3.Database;

  constructor(filename: string = ':memory:') {
    this.db = new sqlite3.Database(filename);
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    await this.execute('BEGIN TRANSACTION');
    try {
      const txAdapter: DatabaseTransaction = {
        execute: (sql: string, params: unknown[] = []) => this.execute(sql, params),
        query: <U>(sql: string, params: unknown[] = []) => this.query<U>(sql, params)
      };
      const result = await callback(txAdapter);
      await this.execute('COMMIT');
      return result;
    } catch (error) {
      await this.execute('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
