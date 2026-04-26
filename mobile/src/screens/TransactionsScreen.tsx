import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, FlatList, TextInput, Alert, Modal,
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

  // Split State
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [splitAmount, setSplitAmount] = useState('');
  const [splitRef, setSplitRef] = useState('');

  const loadData = async (triggerSync = true) => {
    try {
      const [cats, accs] = await Promise.all([
        api.categories.list().catch(() => []), 
        api.accounts.list().catch(() => [])
      ]);
      setCategories(cats); setAccounts(accs);
      const localTxs = await offlineService.getTransactions();
      setTransactions(localTxs);
      if (triggerSync) {
        offlineService.syncWithServer().then(success => {
          if (success) offlineService.getTransactions().then(txs => setTransactions(txs));
        });
      }
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadData(true); }, []));

  const handleAction = (tx: any) => {
    Alert.alert(
      "Actions transaction",
      `Transaction de ${fmtShort(tx.amount)} XAF`,
      [
        { text: "Annuler (Correction)", style: "destructive", onPress: () => handleCancel(tx.id) },
        { text: "Fragmenter (Split)", onPress: () => { setSelectedTx(tx); setSplitModalVisible(true); } },
        { text: "Retour", style: "cancel" },
      ]
    );
  };

  const handleCancel = async (id: string) => {
    Alert.alert("Confirmer", "Annuler cette transaction et créer une correction ?", [
      { text: "Non", style: "cancel" },
      { text: "Oui", style: "destructive", onPress: async () => {
        try { await api.transactions.cancel(id); loadData(true); } 
        catch { Alert.alert("Erreur", "Action impossible"); }
      }}
    ]);
  };

  const handleSplit = async () => {
    const amt = parseFloat(splitAmount.replace(/\s/g, ''));
    if (isNaN(amt) || amt <= 0 || amt >= selectedTx.amount) {
      Alert.alert("Erreur", "Le montant du fragment doit être inférieur au montant total.");
      return;
    }

    try {
      // Logic: Cancel original and create two new ones
      // 1. Cancel original
      await api.transactions.cancel(selectedTx.id);
      
      // 2. Create Fragment 1
      await api.transactions.create({
        ...selectedTx,
        id: Math.random().toString(36).substr(2, 9),
        amount: amt,
        reference: splitRef || `${selectedTx.reference || ''} (F1)`,
        note: `Fragment de ${selectedTx.id}`
      });

      // 3. Create Fragment 2 (the rest)
      await api.transactions.create({
        ...selectedTx,
        id: Math.random().toString(36).substr(2, 9),
        amount: selectedTx.amount - amt,
        reference: `${selectedTx.reference || ''} (F2)`,
        note: `Reste de ${selectedTx.id}`
      });

      setSplitModalVisible(false);
      setSplitAmount('');
      setSplitRef('');
      loadData(true);
      Alert.alert("Succès", "La transaction a été fragmentée.");
    } catch {
      Alert.alert("Erreur", "Échec de la fragmentation.");
    }
  };

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

  if (loading) return <View style={s.loader}><ActivityIndicator color={Colors.g700} /></View>;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header & Filter UI (same as before) */}
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

      <View style={s.searchBox}>
        <Ionicons name="search-outline" size={16} color={Colors.n500} style={{ marginRight: 8 }} />
        <TextInput style={s.searchInput} placeholder="Rechercher..." placeholderTextColor={Colors.n300} value={search} onChangeText={setSearch} />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={Colors.g700} />}
        renderItem={({ item }) => {
          const cat = categories.find(c => c.id === item.category_id);
          const acc = accounts.find(a => a.id === item.account_id);
          const isCredit = item.type === 'credit';
          return (
            <TouchableOpacity style={s.row} onPress={() => handleAction(item)}>
              <View style={[s.rowIcon, { backgroundColor: isCredit ? Colors.g50 : Colors.redBg }]}>
                <Text style={{fontSize: 16}}>{isCredit ? '↑' : '↓'}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.rowTitle}>{cat?.name || 'Catégorie'}</Text>
                  <Text style={[s.rowAmount, { color: isCredit ? Colors.g700 : Colors.red }]}>{isCredit ? '+' : '-'}{fmtShort(item.amount)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={s.rowSub}>{acc?.name || 'Compte'} • {fmtDate(item.date)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {!item.synced && <Ionicons name="cloud-offline-outline" size={12} color={Colors.a500} style={{ marginRight: 4 }} />}
                    <Text style={s.rowRef}>{item.reference ? `#${item.reference}` : ''}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Split Modal */}
      <Modal visible={splitModalVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Fragmenter la transaction</Text>
            <Text style={s.modalSub}>Montant total : {selectedTx ? fmtShort(selectedTx.amount) : 0} XAF</Text>
            
            <View style={s.modalField}>
              <Text style={s.modalLabel}>Montant du 1er fragment</Text>
              <TextInput style={s.modalInput} keyboardType="numeric" value={splitAmount} onChangeText={setSplitAmount} placeholder="Ex: 5000" />
            </View>

            <View style={s.modalField}>
              <Text style={s.modalLabel}>Référence interne (Facture n°)</Text>
              <TextInput style={s.modalInput} value={splitRef} onChangeText={setSplitRef} placeholder="Ex: FACT-2024-001" />
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => setSplitModalVisible(false)}>
                <Text>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnConfirm} onPress={handleSplit}>
                <Text style={{ color: Colors.white, fontWeight: '600' }}>Confirmer le Split</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.n100 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: Colors.g800 },
  pageSub: { fontSize: 12, color: Colors.n500, marginTop: 2 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.g800, marginBottom: 4 },
  modalSub: { fontSize: 13, color: Colors.n500, marginBottom: 20 },
  modalField: { marginBottom: 15 },
  modalLabel: { fontSize: 13, fontWeight: '500', color: Colors.n700, marginBottom: 6 },
  modalInput: { backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  modalBtnCancel: { padding: 12 },
  modalBtnConfirm: { backgroundColor: Colors.g700, paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.sm },
});
