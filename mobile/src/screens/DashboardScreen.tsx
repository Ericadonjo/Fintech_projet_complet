import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Colors, Spacing, Radius } from '../theme';
import { Account, Transaction, Category } from '../types';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' XAF';
}
function fmtShort(n: number) { return n.toLocaleString('fr-FR'); }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function DashboardScreen({ navigation }: any) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [accs, cats, txs] = await Promise.all([
        api.accounts.list(), api.categories.list(), api.transactions.list(),
      ]);
      setAccounts(accs); setCategories(cats); setTransactions(txs);
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
  const now = new Date();
  const monthTxs = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyIn = monthTxs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const monthlyOut = monthTxs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const netBalance = monthlyIn - monthlyOut;

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.g700} />}
      >
        {/* Page Header */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.pageTitle}>Dashboard</Text>
            <Text style={s.pageSub}>Vue d'ensemble de votre trésorerie</Text>
          </View>
          <TouchableOpacity style={s.newTxBtn} onPress={() => navigation.navigate('NewTransaction', {})}>
            <Ionicons name="add" size={16} color={Colors.white} />
            <Text style={s.newTxBtnText}>Nouvelle Transaction</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Grid — 4 cards like the web */}
        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Total Trésorerie</Text>
            <Text style={[s.statAmount, { color: Colors.g600 }]}>{fmtShort(totalBalance)}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>↑ Entrées — {now.toLocaleDateString('fr-FR', { month: 'long' })}</Text>
            <Text style={[s.statAmount, { color: Colors.g600 }]}>{fmtShort(monthlyIn)}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>↓ Sorties — {now.toLocaleDateString('fr-FR', { month: 'long' })}</Text>
            <Text style={[s.statAmount, { color: Colors.red }]}>{fmtShort(monthlyOut)}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Solde du mois</Text>
            <Text style={[s.statAmount, { color: netBalance >= 0 ? Colors.g600 : Colors.red }]}>{fmtShort(netBalance)}</Text>
          </View>
        </View>

        {/* Recent Transactions — mirrors .card with table */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Transactions Récentes</Text>
          </View>

          {transactions.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="wallet-outline" size={48} color={Colors.n300} />
              <Text style={s.emptyText}>Aucune transaction</Text>
              <TouchableOpacity style={s.btnPrimary} onPress={() => navigation.navigate('NewTransaction', {})}>
                <Text style={s.btnPrimaryText}>Créer une transaction</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Table header */}
              <View style={s.tableHeader}>
                <Text style={[s.th, { flex: 1 }]}>Date</Text>
                <Text style={[s.th, { flex: 2 }]}>Catégorie</Text>
                <Text style={[s.th, { flex: 2 }]}>Compte</Text>
                <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Montant</Text>
              </View>
              {transactions.slice(0, 10).map(tx => {
                const isCredit = tx.type === 'credit';
                const cat = categories.find(c => c.id === tx.category_id);
                const acc = accounts.find(a => a.id === tx.account_id);
                return (
                  <View key={String(tx.id)} style={s.tableRow}>
                    <Text style={[s.td, { flex: 1 }]}>{fmtDate(tx.date)}</Text>
                    <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{cat?.name || '—'}</Text>
                    <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{acc?.name || '—'}</Text>
                    <Text style={[s.td, { flex: 1.5, textAlign: 'right', fontWeight: '600', color: isCredit ? Colors.g600 : Colors.red }]}>
                      {isCredit ? '+' : '-'}{fmtShort(tx.amount)}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Accounts — mirrors second .card with table */}
        <View style={[s.card, { marginBottom: 100 }]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Comptes</Text>
          </View>
          <View style={s.tableHeader}>
            <Text style={[s.th, { flex: 2 }]}>Compte</Text>
            <Text style={[s.th, { flex: 1 }]}>Type</Text>
            <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Solde</Text>
          </View>
          {accounts.map(acc => {
            const typeLabel = acc.type === 'cash' ? 'Caisse' : acc.type === 'mobile' ? 'Mobile Money' : 'Banque';
            const typeBg = acc.type === 'cash' ? Colors.g50 : acc.type === 'mobile' ? Colors.a50 : Colors.g100;
            const typeColor = acc.type === 'cash' ? Colors.g700 : '#7a5500';
            return (
              <View key={String(acc.id)} style={s.tableRow}>
                <Text style={[s.td, { flex: 2, fontWeight: '500' }]} numberOfLines={1}>{acc.name}</Text>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={[s.badge, { backgroundColor: typeBg, color: typeColor }]}>{typeLabel}</Text>
                </View>
                <Text style={[s.td, { flex: 1.5, textAlign: 'right', fontWeight: '600', color: Colors.g700 }]}>
                  {fmtShort(balances[acc.id as string] || 0)}
                </Text>
              </View>
            );
          })}
          {accounts.length === 0 && <Text style={s.emptyText}>Aucun compte configuré</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pageHeader: { backgroundColor: Colors.white, borderRadius: Radius.lg, margin: Spacing.md, padding: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  pageTitle: { fontSize: 22, fontWeight: '600', color: Colors.g800 },
  pageSub: { fontSize: 13, color: Colors.n500, marginTop: 2 },
  newTxBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.g700, paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm },
  newTxBtnText: { color: Colors.white, fontSize: 13, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.md, gap: 12, marginBottom: Spacing.sm },
  statCard: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, width: '47%' },
  statLabel: { fontSize: 11, color: Colors.n500, textTransform: 'uppercase', marginBottom: 6 },
  statAmount: { fontSize: 18, fontWeight: '700', color: Colors.g700 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.g700 },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.n50, paddingVertical: 8, paddingHorizontal: 6, borderRadius: Radius.sm, marginBottom: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: Colors.n100 },
  th: { fontSize: 11, fontWeight: '600', color: Colors.n500, textTransform: 'uppercase' },
  td: { fontSize: 13, color: Colors.n700 },
  badge: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: Colors.n500, fontSize: 14, marginTop: 8, marginBottom: 16, textAlign: 'center' },
  btnPrimary: { backgroundColor: Colors.g700, paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.sm },
  btnPrimaryText: { color: Colors.white, fontWeight: '600', fontSize: 13 },
});
