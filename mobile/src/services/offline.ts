import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const TX_KEY = '@pme_offline_txs';
const LAST_SYNC_KEY = '@pme_last_sync';

export const offlineService = {
  async saveTransaction(tx: any) {
    const existing = await this.getTransactions();
    const newTx = { ...tx, id: tx.id || Date.now().toString(), synced: false };
    await AsyncStorage.setItem(TX_KEY, JSON.stringify([...existing, newTx]));
    return newTx;
  },

  async getTransactions() {
    const data = await AsyncStorage.getItem(TX_KEY);
    return data ? JSON.parse(data) : [];
  },

  async markAsSynced(txIds: string[]) {
    const existing = await this.getTransactions();
    const updated = existing.map((tx: any) => 
      txIds.includes(tx.id) ? { ...tx, synced: true } : tx
    );
    await AsyncStorage.setItem(TX_KEY, JSON.stringify(updated));
  },

  async syncWithServer() {
    try {
      const localTxs = await this.getTransactions();
      const unSynced = localTxs.filter((tx: any) => !tx.synced);
      
      // 1. Push un-synced
      if (unSynced.length > 0) {
        await api.sync.push(unSynced);
        await this.markAsSynced(unSynced.map((t: any) => t.id));
      }

      // 2. Pull new
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const serverTxs = await api.sync.pull(lastSync || undefined);
      
      if (serverTxs.length > 0) {
        const merged = await this.mergeServerTransactions(serverTxs);
        await AsyncStorage.setItem(TX_KEY, JSON.stringify(merged));
        await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      }
      
      return true;
    } catch (err) {
      console.warn('Sync failed:', err);
      return false;
    }
  },

  async mergeServerTransactions(serverTxs: any[]) {
    const local = await this.getTransactions();
    const localMap = new Map(local.map((tx: any) => [tx.id, tx]));
    
    serverTxs.forEach(stx => {
      localMap.set(stx.id, { ...stx, synced: true });
    });
    
    return Array.from(localMap.values());
  }
};
