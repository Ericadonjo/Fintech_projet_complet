import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Colors, Spacing, Radius } from '../theme';
import { Account } from '../types';

function fmtShort(n: number) { return n.toLocaleString('fr-FR'); }
function fmtCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' XAF';
}

const TYPE_LABELS: Record<string, string> = { cash: 'Caisse', mobile: 'Mobile Money', bank: 'Banque' };
const TYPE_EMOJIS: Record<string, string> = { cash: '💵', mobile: '📱', bank: '🏦' };
const TYPE_BG: Record<string, string> = { cash: Colors.g50, mobile: Colors.a50, bank: Colors.g100 };

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [form, setForm] = useState({ name: '', type: 'cash', initial_balance: '' });

  const loadData = async () => {
    try {
      const accs: Account[] = await api.accounts.list();
      setAccounts(accs);
      const bals: Record<string, number> = {};
      for (const a of accs) {
        try { bals[a.id] = await api.accounts.balance(a.id); } catch { bals[a.id] = a.initial_balance || 0; }
      }
      setBalances(bals);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const totalBalance = Object.values(balances).reduce((s, b) => s + b, 0);

  function openAdd() { setForm({ name: '', type: 'cash', initial_balance: '' }); setEditingId(null); setModalOpen(true); }
  function openEdit(acc: Account) {
    setForm({ name: acc.name, type: acc.type, initial_balance: fmtShort(acc.initial_balance) });
    setEditingId(acc.id); setModalOpen(true);
  }
  function handleBalInput(v: string) {
    const d = v.replace(/\D/g, '');
    setForm(f => ({ ...f, initial_balance: d ? parseInt(d, 10).toLocaleString('fr-FR') : '' }));
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('Erreur', 'Veuillez entrer un nom.'); return; }
    setSaving(true);
    try {
      const data = { name: form.name, type: form.type, initial_balance: parseInt(form.initial_balance.replace(/\s/g, ''), 10) || 0 };
      if (editingId) await api.accounts.update(editingId, data);
      else await api.accounts.create(data);
      setModalOpen(false); loadData();
    } catch (err: any) { Alert.alert('Erreur', err?.message || 'Échec.'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: any) {
    Alert.alert('Supprimer', 'Supprimer ce compte ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await api.accounts.delete(id); loadData(); } },
    ]);
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header — mirrors .comptes-header + .page-header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Comptes</Text>
          <Text style={s.headerSub}>{accounts.length} portefeuille{accounts.length !== 1 ? 's' : ''} actif{accounts.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={s.btnPrimary} onPress={openAdd}>
          <Ionicons name="add" size={16} color={Colors.white} />
          <Text style={s.btnPrimaryText}>Nouveau Compte</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.g700} />}
      >
        {/* Total card — mirrors .total-card */}
        <View style={s.totalCard}>
          <View>
            <Text style={s.totalLabel}>Total Consolidé (XAF)</Text>
            <Text style={s.totalAmount}>{fmtCurrency(totalBalance)}</Text>
          </View>
          <View style={s.totalBadge}>
            <Text style={s.totalBadgeText}>Toutes devises</Text>
          </View>
        </View>

        {/* Accounts list */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Liste des Comptes</Text>
          </View>

          {accounts.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyText}>Aucun compte</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
                <Text style={s.emptyBtnText}>Ajouter un compte</Text>
              </TouchableOpacity>
            </View>
          ) : (
            accounts.map(acc => (
              <View key={String(acc.id)} style={s.accCard}>
                {/* .compte-avatar */}
                <View style={[s.avatar, { backgroundColor: TYPE_BG[acc.type] || Colors.n50 }]}>
                  <Text style={s.avatarEmoji}>{TYPE_EMOJIS[acc.type] || '💳'}</Text>
                </View>
                {/* .compte-info */}
                <View style={s.accInfo}>
                  <Text style={s.accName}>{acc.name}</Text>
                  <Text style={s.accType}>{TYPE_LABELS[acc.type] || acc.type} · XAF</Text>
                </View>
                {/* .compte-solde */}
                <View style={s.accSolde}>
                  <Text style={s.accAmount}>{fmtCurrency(balances[acc.id as string] || 0)}</Text>
                  <Text style={s.accAmountLabel}>FCFA</Text>
                </View>
                {/* Actions */}
                <View style={s.actions}>
                  <TouchableOpacity style={s.btnOutline} onPress={() => openEdit(acc)}>
                    <Ionicons name="pencil" size={14} color={Colors.n700} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnDanger} onPress={() => handleDelete(acc.id)}>
                    <Ionicons name="trash" size={14} color={Colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={s.modal} onPress={() => {}}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingId ? 'Modifier le Compte' : 'Nouveau Compte'}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={s.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Nom du compte</Text>
            <TextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Ex: Caisse, MTN..." placeholderTextColor={Colors.n300} />

            <Text style={s.label}>Type</Text>
            <View style={s.typeSelect}>
              {[['cash', 'Caisse'], ['mobile', 'Mobile Money'], ['bank', 'Banque']].map(([v, l]) => (
                <TouchableOpacity key={v} style={[s.typeOption, form.type === v && s.typeOptionActive]} onPress={() => setForm(f => ({ ...f, type: v }))}>
                  <Text style={[s.typeOptionText, form.type === v && s.typeOptionTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Solde initial</Text>
            <TextInput style={s.input} value={form.initial_balance} onChangeText={handleBalInput} placeholder="0" placeholderTextColor={Colors.n300} keyboardType="numeric" />

            <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.submitBtnText}>Enregistrer</Text>}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.white, borderRadius: Radius.lg, margin: Spacing.md, padding: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  headerTitle: { fontSize: 22, fontWeight: '600', color: Colors.g800 },
  headerSub: { fontSize: 13, color: Colors.n500, marginTop: 2 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.g700, paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm },
  btnPrimaryText: { color: Colors.white, fontSize: 13, fontWeight: '500' },
  totalCard: { backgroundColor: Colors.g800, borderRadius: Radius.md, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  totalLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  totalAmount: { fontSize: 20, fontWeight: '600', color: Colors.white },
  totalBadge: { backgroundColor: Colors.a400, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  totalBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.white },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.g700 },
  accCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.md, padding: 14, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 20 },
  accInfo: { flex: 1 },
  accName: { fontSize: 14, fontWeight: '600', color: Colors.n900 },
  accType: { fontSize: 11, color: Colors.n500 },
  accSolde: { alignItems: 'flex-end', marginRight: 8 },
  accAmount: { fontSize: 14, fontWeight: '600', color: Colors.g700 },
  accAmountLabel: { fontSize: 10, color: Colors.n500 },
  actions: { flexDirection: 'row', gap: 4 },
  btnOutline: { width: 30, height: 30, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.n100, justifyContent: 'center', alignItems: 'center' },
  btnDanger: { width: 30, height: 30, borderRadius: Radius.sm, backgroundColor: Colors.red, justifyContent: 'center', alignItems: 'center' },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: Colors.n500, fontSize: 14, marginBottom: 12 },
  emptyBtn: { backgroundColor: Colors.g700, paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.sm },
  emptyBtnText: { color: Colors.white, fontSize: 13, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.n100, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  modalClose: { fontSize: 26, color: Colors.n500, lineHeight: 28 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.n700, marginBottom: 6 },
  input: { backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 10, fontSize: 14, color: Colors.n900, marginBottom: 16 },
  typeSelect: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeOption: { flex: 1, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, paddingVertical: 8, alignItems: 'center', backgroundColor: Colors.n50 },
  typeOptionActive: { backgroundColor: Colors.g50, borderColor: Colors.g400 },
  typeOptionText: { fontSize: 12, color: Colors.n500, fontWeight: '500' },
  typeOptionTextActive: { color: Colors.g700, fontWeight: '700' },
  submitBtn: { backgroundColor: Colors.g700, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
});
