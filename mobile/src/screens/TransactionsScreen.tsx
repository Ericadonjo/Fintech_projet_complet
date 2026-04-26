import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, FlatList, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Colors, Spacing, Radius } from '../theme';
import { Transaction, Category, Account } from '../types';

function fmtShort(n: number) { return n.toLocaleString('fr-FR'); }
function fmtCurrency(n: number) { return fmtShort(n) + ' XAF'; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }

export default function TransactionsScreen({ navigation }: any) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      const [txs, cats, accs] = await Promise.all([
        api.transactions.list(), api.categories.list(), api.accounts.list(),
      ]);
      setTransactions(txs); setCategories(cats); setAccounts(accs);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const filtered = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => {
      if (!search) return true;
      const cat = categories.find(c => c.id === t.category_id);
      const acc = accounts.find(a => a.id === t.account_id);
      return cat?.name?.toLowerCase().includes(search.toLowerCase())
        || acc?.name?.toLowerCase().includes(search.toLowerCase())
        || t.description?.toLowerCase().includes(search.toLowerCase());
    });

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.pageTitle}>Transactions</Text>
          <Text style={s.pageSub}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={s.btnPrimary} onPress={() => navigation.navigate('NewTransaction', {})}>
          <Ionicons name="add" size={16} color={Colors.white} />
          <Text style={s.btnPrimaryText}>Nouvelle</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
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

      {/* Filter tabs — mirrors .flux-toggle */}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.g700} />}
        ListHeaderComponent={filtered.length > 0 ? (
          <View style={s.tableHeader}>
            <Text style={[s.th, { flex: 1 }]}>Date</Text>
            <Text style={[s.th, { flex: 2 }]}>Description</Text>
            <Text style={[s.th, { flex: 2 }]}>Catégorie</Text>
            <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Montant</Text>
            <Text style={[s.th, { width: 52 }]}>Type</Text>
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={Colors.n300} />
            <Text style={s.emptyText}>Aucune transaction{search ? ` pour "${search}"` : ''}</Text>
          </View>
        }
        renderItem={({ item: tx }) => {
          const isCredit = tx.type === 'credit';
          const cat = categories.find(c => c.id === tx.category_id);
          const acc = accounts.find(a => a.id === tx.account_id);
          return (
            <TouchableOpacity 
              style={s.tableRow}
              onLongPress={() => {
                Alert.alert(
                  'Action',
                  'Voulez-vous annuler cette transaction ?\nUne transaction de correction (inverse) sera générée pour maintenir l\'intégrité.',
                  [
                    { text: 'Retour', style: 'cancel' },
                    { text: 'Annuler la transaction', style: 'destructive', onPress: async () => {
                        try {
                          await api.transactions.cancel(tx.id);
                          loadData();
                        } catch (err: any) {
                          Alert.alert('Erreur', err?.message || 'Impossible d\'annuler');
                        }
                    }}
                  ]
                );
              }}
            >
              <Text style={[s.td, { flex: 1 }]}>{fmtDate(tx.date)}</Text>
              <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{tx.description || '—'}</Text>
              <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{cat?.name || '—'}</Text>
              <Text style={[s.td, { flex: 1.5, textAlign: 'right', fontWeight: '600', color: isCredit ? Colors.g600 : Colors.red }]}>
                {isCredit ? '+' : '-'}{fmtShort(tx.amount)}
              </Text>
              <View style={{ width: 52 }}>
                <Text style={[s.typeBadge, { backgroundColor: isCredit ? Colors.g50 : Colors.redBg, color: isCredit ? Colors.g700 : Colors.red }]}>
                  {isCredit ? 'Entrée' : 'Sortie'}
                </Text>
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
  header: { backgroundColor: Colors.white, borderRadius: Radius.lg, margin: Spacing.md, marginBottom: Spacing.sm, padding: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  pageTitle: { fontSize: 22, fontWeight: '600', color: Colors.g800 },
  pageSub: { fontSize: 13, color: Colors.n500, marginTop: 2 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.g700, paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm },
  btnPrimaryText: { color: Colors.white, fontSize: 13, fontWeight: '500' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, marginHorizontal: Spacing.md, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.n100 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.n900 },
  filterRow: { flexDirection: 'row', gap: 8, marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  filterTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.n100, backgroundColor: Colors.n50 },
  filterTabAll: { backgroundColor: Colors.g700, borderColor: Colors.g700 },
  filterTabIn: { backgroundColor: Colors.g50, borderColor: Colors.g400 },
  filterTabOut: { backgroundColor: Colors.redBg, borderColor: Colors.red },
  filterTabText: { fontSize: 12, fontWeight: '500', color: Colors.n500 },
  filterTabTextActive: { fontWeight: '700', color: Colors.n900 },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.n50, paddingVertical: 8, paddingHorizontal: 6, borderRadius: Radius.sm, marginBottom: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: Colors.n100 },
  th: { fontSize: 11, fontWeight: '600', color: Colors.n500, textTransform: 'uppercase' },
  td: { fontSize: 13, color: Colors.n700 },
  typeBadge: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', textAlign: 'center' },
  emptyState: { paddingTop: 60, alignItems: 'center' },
  emptyText: { color: Colors.n500, fontSize: 14, marginTop: 12 },
});
