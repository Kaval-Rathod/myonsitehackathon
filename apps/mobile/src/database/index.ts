import * as SQLite from 'expo-sqlite';
import { createTablesSQL, PRAGMAS } from './schema';
import { DatabaseAdapter } from './DatabaseAdapter';
import { ExpoAdapter } from './ExpoAdapter';
import { WebDatabaseAdapter } from './WebDatabaseAdapter';
import { Platform } from 'react-native';

let adapterInstance: DatabaseAdapter | null = null;

export const initDatabase = async (): Promise<DatabaseAdapter> => {
  if (!adapterInstance) {
    if (Platform.OS === 'web') {
      adapterInstance = new WebDatabaseAdapter();
    } else {
      const db = await SQLite.openDatabaseAsync('greenlink.db');
      const adapter = new ExpoAdapter(db);
      await adapter.execute(PRAGMAS);
      for (const sql of createTablesSQL) {
        await adapter.execute(sql);
      }
      adapterInstance = adapter;
    }
  }
  return adapterInstance;
};

export const getDatabaseAdapter = (): DatabaseAdapter => {
  if (!adapterInstance) {
    throw new Error('Database not initialized');
  }
  return adapterInstance;
};

export const setTestDatabaseAdapter = async (adapter: DatabaseAdapter): Promise<void> => {
  adapterInstance = adapter;
  await adapter.execute(PRAGMAS);
  for (const sql of createTablesSQL) {
    await adapter.execute(sql);
  }
};
