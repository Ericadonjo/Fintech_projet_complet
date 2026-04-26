import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { Colors, Spacing, Radius } from '../theme';

const { width } = Dimensions.get('window');

function fmtShort(n: number) { return n.toLocaleString('fr-FR'); }
function fmtCurrency(n: number) { return fmtShort(n) + ' XAF'; }

export default function ReportsScreen() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasFraud, setHasFraud] = useState(false);

  const loadData = async () => {
    try {
      const [res, txs] = await Promise.all([api.reports.cashflow(), api.transactions.list()]);
      setData(res);
      setHasFraud(txs.some((t: any) => t.is_backdated));
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  const maxVal = Math.max(...data.map(m => Math.max(m.income, m.expense)), 1);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView 
        contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
      >
        <View style={s.header}>
          <Text style={s.title}>Rapport Bancaire (6 Mois)</Text>
          <Text style={s.sub}>Flux de trésorerie mensuels</Text>
        </View>

        {hasFraud && (
          <View style={{
            backgroundColor: '#fff1f1', padding: 12, borderRadius: 8, marginBottom: 16, 
            borderWidth: 1, borderColor: Colors.red, flexDirection: 'row', alignItems: 'center', gap: 10
          }}>
            <Text style={{fontSize: 20}}>⚠️</Text>
            <View style={{flex: 1}}>
              <Text style={{fontWeight: '700', color: Colors.red, fontSize: 13}}>Alerte Intégrité</Text>
              <Text style={{fontSize: 11, color: Colors.red}}>Des écritures rétro-datées (>3j) ont été détectées.</Text>
            </View>
          </View>
        )}

        {/* Simple Visual Bars */}
        <View style={s.chartCard}>
          <Text style={s.cardTitle}>Graphique de Flux</Text>
          <View style={s.chartContainer}>
            {data.map((m, i) => (
              <View key={m.month} style={s.monthCol}>
                <View style={s.barStack}>
                  <View style={[s.bar, { height: (m.income / maxVal) * 150, backgroundColor: Colors.g400 }]} />
                  <View style={[s.bar, { height: (m.expense / maxVal) * 150, backgroundColor: Colors.red, marginLeft: 2 }]} />
                </View>
                <Text style={s.monthLabel}>{m.month.split('-')[1]}</Text>
              </View>
            ))}
          </View>
          <View style={s.legend}>
            <View style={s.legendItem}><View style={[s.dot, { backgroundColor: Colors.g400 }]} /><Text style={s.legendText}>Entrées</Text></View>
            <View style={s.legendItem}><View style={[s.dot, { backgroundColor: Colors.red }]} /><Text style={s.legendText}>Sorties</Text></View>
          </View>
        </View>

        {/* Data List */}
        {data.map(m => (
          <View key={m.month} style={s.monthCard}>
            <Text style={s.monthTitle}>{new Date(m.month + "-01").toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</Text>
            <View style={s.row}>
              <Text style={s.label}>Entrées</Text>
              <Text style={[s.val, { color: Colors.g700 }]}>+{fmtCurrency(m.income)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Sorties</Text>
              <Text style={[s.val, { color: Colors.red }]}>-{fmtCurrency(m.expense)}</Text>
            </View>
            <View style={[s.row, s.totalRow]}>
              <Text style={s.totalLabel}>Solde</Text>
              <Text style={[s.totalVal, { color: m.balance >= 0 ? Colors.g700 : Colors.red }]}>
                {fmtCurrency(m.balance)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { marginBottom: Spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: Colors.g800 },
  sub: { fontSize: 14, color: Colors.n500, marginTop: 4 },
  chartCard: { backgroundColor: Colors.white, padding: Spacing.md, borderRadius: Radius.lg, marginBottom: Spacing.lg },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.n700, marginBottom: 16 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 180, paddingBottom: 10 },
  monthCol: { alignItems: 'center', flex: 1 },
  barStack: { flexDirection: 'row', alignItems: 'flex-end' },
  bar: { width: 12, borderRadius: 2 },
  monthLabel: { fontSize: 10, color: Colors.n500, marginTop: 8 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: Colors.n500 },
  monthCard: { backgroundColor: Colors.white, padding: Spacing.md, borderRadius: Radius.lg, marginBottom: Spacing.md },
  monthTitle: { fontSize: 14, fontWeight: '700', color: Colors.n900, marginBottom: 12, textTransform: 'capitalize' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, color: Colors.n500 },
  val: { fontSize: 13, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.n100, paddingTop: 8, marginTop: 4 },
  totalLabel: { fontSize: 14, fontWeight: '600', color: Colors.n700 },
  totalVal: { fontSize: 16, fontWeight: '700' },
});
