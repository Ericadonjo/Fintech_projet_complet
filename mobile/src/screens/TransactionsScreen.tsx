import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, FlatList, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { offlineService } from '../services/offline';
import { Colors, Spacing, Radius } from '../theme';
import { Transaction, Category, Account } from '../types';

function fmtShort(n: number) { return n.toLocaleString('fr-FR'); }
function fmtCurrency(n: number) { return fmtShort(n) + ' XAF'; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }

export default function TransactionsScreen({ navigation }: any) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [search, setSearch] = useState('');

  const loadData = async (triggerSync = true) => {
    try {
      // 1. Load categories and accounts (still from API for now, could be cached too)
      const [cats, accs] = await Promise.all([
        api.categories.list().catch(() => []), 
        api.accounts.list().catch(() => [])
      ]);
      setCategories(cats); setAccounts(accs);

      // 2. Load transactions from Offline Service
      const localTxs = await offlineService.getTransactions();
      setTransactions(localTxs);

      // 3. Trigger sync in background if requested
      if (triggerSync) {
        offlineService.syncWithServer().then(success => {
          if (success) {
            offlineService.getTransactions().then(txs => setTransactions(txs));
          }
        });
      }
    } catch (err) {
      console.warn('Error loading data:', err);
    } finally {
      setLoading(false); 
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(true); }, []));

  const filtered = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => {
      if (!search) return true;
      const cat = categories.find(c => c.id === t.category_id);
      const acc = accounts.find(a => a.id === t.account_id);
      return cat?.name?.toLowerCase().includes(search.toLowerCase())
        || acc?.name?.toLowerCase().includes(search.toLowerCase())
        || t.description?.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleCancel = async (id: string) => {
    Alert.alert(
      "Annuler la transaction",
      "Cette opération est irréversible. Une transaction d'annulation sera créée.",
      [
        { text: "Retour", style: "cancel" },
        { 
          text: "Confirmer l'annulation", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.transactions.cancel(id);
              loadData(true);
            } catch (err) {
              Alert.alert("Erreur", "Impossible d'annuler cette transaction.");
            }
          }
        }
      ]
    );
  };

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={s.pageTitle}>Transactions</Text>
          <Text style={s.pageSub}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.btnCircle]} onPress={() => { setRefreshing(true); loadData(true); }}>
            <Ionicons name="sync" size={20} color={Colors.g700} />
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={() => navigation.navigate('NewTransaction', {})}>
            <Ionicons name="add" size={16} color={Colors.white} />
            <Text style={s.btnPrimaryText}>Nouvelle</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={16} color={Colors.n500} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Rechercher..."
          placeholderTextColor={Colors.n300}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close" size={16} color={Colors.n500} /></TouchableOpacity> : null}
      </View>

      <View style={s.filterRow}>
        {([['all', 'Toutes'], ['credit', '↑ Entrées'], ['debit', '↓ Sorties']] as const).map(([val, lbl]) => (
          <TouchableOpacity key={val} style={[s.filterTab, filter === val && (val === 'credit' ? s.filterTabIn : val === 'debit' ? s.filterTabOut : s.filterTabAll)]} onPress={() => setFilter(val)}>
            <Text style={[s.filterTabText, filter === val && s.filterTabTextActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={Colors.g700} />}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={48} color={Colors.n300} />
            <Text style={{ marginTop: 10, color: Colors.n500 }}>Aucune transaction trouvée</Text>
          </View>
        }
        renderItem={({ item }) => {
          const cat = categories.find(c => c.id === item.category_id);
          const acc = accounts.find(a => a.id === item.account_id);
          const isCredit = item.type === 'credit';
          
          return (
            <TouchableOpacity 
              style={s.row} 
              onLongPress={() => handleCancel(item.id)}
              activeOpacity={0.7}
            >
              <View style={[s.rowIcon, { backgroundColor: isCredit ? Colors.g50 : Colors.redBg }]}>
                <Text style={{fontSize: 16}}>{isCredit ? '↑' : '↓'}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.rowTitle}>{cat?.name || 'Catégorie'}</Text>
                  <Text style={[s.rowAmount, { color: isCredit ? Colors.g700 : Colors.red }]}>
                    {isCredit ? '+' : '-'}{fmtShort(item.amount)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={s.rowSub}>{acc?.name || 'Compte'} • {fmtDate(item.date)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {!item.synced && <Ionicons name="cloud-offline-outline" size={12} color={Colors.a500} style={{ marginRight: 4 }} />}
                    {item.synced && <Ionicons name="checkmark-circle-outline" size={12} color={Colors.g400} style={{ marginRight: 4 }} />}
                    <Text style={s.rowRef}>{item.reference ? `#${item.reference}` : ''}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.n100 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: Colors.g800 },
  pageSub: { fontSize: 12, color: Colors.n500, marginTop: 2 },
  btnCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.n50, justifyContent: 'center', alignItems: 'center' },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.g700, paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.sm },
  btnPrimaryText: { color: Colors.white, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, margin: Spacing.md, paddingHorizontal: 12, borderRadius: Radius.sm, height: 40, borderWidth: 1, borderColor: Colors.n100 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.n900 },
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: 8, marginBottom: Spacing.sm },
  filterTab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100 },
  filterTabAll: { backgroundColor: Colors.g50, borderColor: Colors.g200 },
  filterTabIn: { backgroundColor: Colors.g50, borderColor: Colors.g400 },
  filterTabOut: { backgroundColor: Colors.redBg, borderColor: Colors.red },
  filterTabText: { fontSize: 12, color: Colors.n500, fontWeight: '500' },
  filterTabTextActive: { color: Colors.n900, fontWeight: '600' },
  row: { flexDirection: 'row', backgroundColor: Colors.white, padding: Spacing.md, borderRadius: Radius.sm, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.n100 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.n900 },
  rowAmount: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, color: Colors.n500 },
  rowRef: { fontSize: 11, color: Colors.n300 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: Spacing.md, marginBottom: 8 },
  th: { fontSize: 11, fontWeight: '600', color: Colors.n500, textTransform: 'uppercase' },
});
