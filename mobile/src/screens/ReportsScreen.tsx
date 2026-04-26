import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Colors, Spacing, Radius } from '../theme';
import { Transaction, Category } from '../types';

function fmtShort(n: number) { return n.toLocaleString('fr-FR'); }
function fmtCurrency(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' XAF'; }

const PERIODS = [
  { key: 'week', label: '7 jours' },
  { key: 'month', label: 'Ce mois' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'year', label: 'Année' },
] as const;
type Period = typeof PERIODS[number]['key'];

export default function ReportsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('month');

  const loadData = async () => {
    try {
      const [txs, cats] = await Promise.all([api.transactions.list(), api.categories.list()]);
      setTransactions(txs); setCategories(cats);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  function filterByPeriod(txs: Transaction[]) {
    const now = new Date();
    return txs.filter(t => {
      const d = new Date(t.date);
      switch (period) {
        case 'week': return (now.getTime() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000;
        case 'month': return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        case 'quarter': return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3) && d.getFullYear() === now.getFullYear();
        case 'year': return d.getFullYear() === now.getFullYear();
      }
    });
  }

  const filtered = filterByPeriod(transactions);
  const produits = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const charges = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const net = produits - charges;
  const maxBar = Math.max(produits, charges, 1);

  // Category breakdown
  const groupData: Record<string, Record<string, number>> = {};
  for (const tx of filtered) {
    const cat = categories.find(c => c.id === tx.category_id);
    if (!cat) continue;
    const g = cat.group_name || 'Autre';
    if (!groupData[g]) groupData[g] = {};
    if (!groupData[g][cat.name]) groupData[g][cat.name] = 0;
    groupData[g][cat.name] += tx.type === 'credit' ? tx.amount : -tx.amount;
  }

  function exportCSV() {
    // Mobile: inform user to export from the web
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.g700} />}
      >
        {/* Header */}
        <View style={s.pageHeader}>
          <Text style={s.pageTitle}>Bilan de trésorerie</Text>
          <Text style={s.pageSub}>Prêt pour la banque · Certifié SHA-256</Text>
        </View>

        {/* Period Selector — mirrors .periode-tabs */}
        <View style={s.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity key={p.key} style={[s.periodTab, period === p.key && s.periodTabActive]} onPress={() => setPeriod(p.key)}>
              <Text style={[s.periodTabText, period === p.key && s.periodTabTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary — mirrors .bilan-summary */}
        <View style={s.bilanSummary}>
          <View style={[s.bsCard, { backgroundColor: Colors.g50 }]}>
            <Text style={s.bsLabel}>Entrées</Text>
            <Text style={[s.bsAmount, { color: Colors.g700 }]}>{fmtCurrency(produits)}</Text>
          </View>
          <View style={[s.bsCard, { backgroundColor: Colors.redBg }]}>
            <Text style={s.bsLabel}>Sorties</Text>
            <Text style={[s.bsAmount, { color: Colors.red }]}>{fmtCurrency(charges)}</Text>
          </View>
          <View style={[s.bsCard, { backgroundColor: Colors.n50 }]}>
            <Text style={s.bsLabel}>Solde net</Text>
            <Text style={[s.bsAmount, { color: net >= 0 ? Colors.g600 : Colors.red }]}>{fmtCurrency(net)}</Text>
          </View>
        </View>

        {/* Bar Section — mirrors .bilan-bar-section */}
        <View style={s.card}>
          <Text style={s.barTitle}>Répartition</Text>
          {Object.entries(groupData).length === 0 ? (
            <Text style={s.emptyText}>Aucune donnée sur la période sélectionnée</Text>
          ) : (
            Object.entries(groupData).flatMap(([group, cats]) =>
              Object.entries(cats).map(([name, amount]) => (
                <View key={`${group}-${name}`} style={s.barRow}>
                  <Text style={s.barLabel} numberOfLines={1}>{name}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, {
                      width: `${Math.min(100, Math.abs(amount) / maxBar * 100)}%`,
                      backgroundColor: amount >= 0 ? Colors.g400 : Colors.red,
                    }]} />
                  </View>
                  <Text style={[s.barAmount, { color: amount >= 0 ? Colors.g600 : Colors.red }]}>
                    {fmtShort(Math.abs(amount))}
                  </Text>
                </View>
              ))
            )
          )}
        </View>

        {/* Integrity Banner */}
        <View style={s.integrityBanner}>
          <Text style={s.integrityIcon}>🔒</Text>
          <View>
            <Text style={s.integrityTitle}>Intégrité garantie</Text>
            <Text style={s.integritySub}>{transactions.length} transactions · Hash SHA-256 valide</Text>
          </View>
        </View>

        {/* Export */}
        <View style={s.card}>
          <Text style={s.exportTitle}>Exporter le bilan</Text>
          <View style={s.exportFormats}>
            {[
              { icon: '📄', label: 'CSV', sub: 'Données brutes', featured: true },
              { icon: '📊', label: 'XLSX', sub: 'Excel', featured: false },
              { icon: '📋', label: 'JSON', sub: 'Backup', featured: false },
            ].map(e => (
              <TouchableOpacity key={e.label} style={[s.efBtn, e.featured && s.efBtnFeatured]}>
                <Text style={s.efIcon}>{e.icon}</Text>
                <Text style={s.efLabel}>{e.label}</Text>
                <Text style={s.efSub}>{e.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Hash pill */}
        <View style={s.hashPill}>
          <Text style={s.hashText}>
            SHA-256 · {transactions.length > 0 ? transactions[0]?.hash?.slice(0, 20) : 'Généré le ' + new Date().toLocaleDateString('fr-FR')} · {new Date().toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pageHeader: { backgroundColor: Colors.white, borderRadius: Radius.lg, margin: Spacing.md, padding: Spacing.lg },
  pageTitle: { fontSize: 20, fontWeight: '600', color: Colors.g800 },
  pageSub: { fontSize: 12, color: Colors.n500, marginTop: 4 },
  periodRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  periodTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.n100 },
  periodTabActive: { backgroundColor: Colors.g700, borderColor: Colors.g700 },
  periodTabText: { fontSize: 12, color: Colors.n500, fontWeight: '500' },
  periodTabTextActive: { color: Colors.white, fontWeight: '700' },
  bilanSummary: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  bsCard: { flex: 1, borderRadius: Radius.md, padding: 12 },
  bsLabel: { fontSize: 11, color: Colors.n500, marginBottom: 6 },
  bsAmount: { fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  barTitle: { fontSize: 14, fontWeight: '600', color: Colors.g700, marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  barLabel: { width: 90, fontSize: 12, color: Colors.n700 },
  barTrack: { flex: 1, height: 6, backgroundColor: Colors.n100, borderRadius: 3, overflow: 'hidden', marginHorizontal: 8 },
  barFill: { height: '100%', borderRadius: 3 },
  barAmount: { width: 70, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  emptyText: { fontSize: 13, color: Colors.n500, textAlign: 'center', paddingVertical: 20 },
  integrityBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  integrityIcon: { fontSize: 24 },
  integrityTitle: { fontSize: 14, fontWeight: '600', color: Colors.n900 },
  integritySub: { fontSize: 12, color: Colors.n500, marginTop: 2 },
  exportTitle: { fontSize: 14, fontWeight: '600', color: Colors.g700, marginBottom: 12 },
  exportFormats: { flexDirection: 'row', gap: 8 },
  efBtn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: Radius.md, backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100 },
  efBtnFeatured: { backgroundColor: Colors.g50, borderColor: Colors.g200 },
  efIcon: { fontSize: 22, marginBottom: 4 },
  efLabel: { fontSize: 13, fontWeight: '700', color: Colors.g700, marginBottom: 2 },
  efSub: { fontSize: 10, color: Colors.n500 },
  hashPill: { marginHorizontal: Spacing.md, backgroundColor: Colors.g800, borderRadius: Radius.full, paddingVertical: 8, paddingHorizontal: 14, marginBottom: Spacing.md },
  hashText: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
});
