import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, ActivityIndicator, ScrollView, Alert, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { initDatabase } from './src/database';
import { EventRepository, StorageStats } from './src/database/repositories/eventRepository';
import { SyncManager } from './src/services/syncManager';
import { HttpApiClient } from './src/services/apiClient';
import { VerificationEvent } from '@greenlink/shared';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [stats, setStats] = useState<StorageStats | null>(null);
  
  const [repository, setRepository] = useState<EventRepository | null>(null);
  const [syncManager, setSyncManager] = useState<SyncManager | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        const adapter = await initDatabase();
        const repo = new EventRepository(adapter);
        setRepository(repo);
        
        const apiClient = new HttpApiClient();
        const manager = new SyncManager(repo, apiClient);
        setSyncManager(manager);
        
        await refreshStats(repo);
        setIsReady(true);
      } catch (e: any) {
        showAlert('Initialization Error', e.message);
      }
    };
    setup();
  }, []);

  const refreshStats = async (repo: EventRepository | null = repository) => {
    if (repo) {
      const currentStats = await repo.getStorageStats();
      setStats(currentStats);
    }
  };

  const handleGenerateEvent = async () => {
    if (!repository) return;
    try {
      const newEvent: VerificationEvent = {
        event_id: uuidv4(),
        verification_id: uuidv4(),
        source: 'manual',
        confidence: 1,
        timestamp: new Date().toISOString(),
        data: { status: 'verified', manual_note: 'Offline generated' }
      };
      await repository.createEvent(newEvent);
      await refreshStats();
      showAlert('Success', 'Offline event generated successfully.');
    } catch (e: any) {
      showAlert('Error Generating Event', e.message);
    }
  };

  const handleSyncNow = async () => {
    if (!syncManager || isSyncing) return;
    setIsSyncing(true);
    await refreshStats(); // Refresh stats on sync start
    try {
      await syncManager.syncPendingEvents();
    } catch (e: any) {
      showAlert('Sync Error', e.message);
    } finally {
      setIsSyncing(false);
      await refreshStats(); // Refresh stats on sync complete
    }
  };

  if (!isReady || !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={{ marginTop: 10 }}>Initializing Database...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>GreenLink Mobile</Text>
      <Text style={styles.subtitle}>Offline-First Sync Manager</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Storage Statistics</Text>
        <Text style={styles.statRow}>Total Events: {stats.totalEvents}</Text>
        <Text style={styles.statRow}>Pending: {stats.pendingEvents}</Text>
        <Text style={styles.statRow}>Syncing: {stats.syncingEvents}</Text>
        <Text style={styles.statRow}>Synced: {stats.syncedEvents}</Text>
        <Text style={styles.statRow}>Failed: {stats.failedEvents}</Text>
        <Text style={styles.statRow}>Conflict: {stats.conflictEvents}</Text>
      </View>

      <View style={styles.actions}>
        <Button 
          title="Generate Offline Event" 
          onPress={handleGenerateEvent}
          disabled={isSyncing} 
        />
        <View style={{ height: 20 }} />
        <Button 
          title={isSyncing ? "Syncing..." : "Sync Now"} 
          onPress={handleSyncNow} 
          disabled={isSyncing || stats.pendingEvents === 0}
        />
      </View>

      {isSyncing && (
        <ActivityIndicator size="large" color="#28a745" style={{ marginTop: 30 }} />
      )}

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  card: {
    width: '100%',
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    marginBottom: 30,
    elevation: 2, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  statRow: {
    fontSize: 16,
    marginBottom: 5,
  },
  actions: {
    width: '100%',
  },
});
