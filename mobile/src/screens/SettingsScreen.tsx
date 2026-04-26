import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, RefreshControl, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { Colors, Spacing, Radius } from '../theme';

const DEFAULT_RATES = { USD: { XAF: 615 }, EUR: { XAF: 655 } };

interface Props { onLogout: () => void; }

export default function SettingsScreen({ onLogout }: Props) {
  const [withdrawalLimit, setWithdrawalLimit] = useState('');
  const [savingLimit, setSavingLimit] = useState(false);
  const [syncLog, setSyncLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const limit = await api.settings.get('withdrawal_limit').catch(() => null);
      if (limit) setWithdrawalLimit(Number(limit).toLocaleString('fr-FR'));
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  function formatLimit(v: string) {
    const d = v.replace(/\D/g, '');
    setWithdrawalLimit(d ? parseInt(d, 10).toLocaleString('fr-FR') : '');
  }

  function getLimitValue() {
    return parseInt(withdrawalLimit.replace(/\s/g, ''), 10) || 0;
  }

  async function saveLimit() {
    setSavingLimit(true);
    try {
      await api.settings.set('withdrawal_limit', getLimitValue());
      Alert.alert('Succès', 'Limite de retrait enregistrée !');
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'enregistrer.');
    } finally { setSavingLimit(false); }
  }

  async function handleLogout() {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('pme_user');
          onLogout();
        }
      },
    ]);
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.g700} />}
      >
        {/* Page Header */}
        <View style={s.pageHeader}>
          <Text style={s.pageTitle}>Paramètres</Text>
          <Text style={s.pageSub}>Configuration et données</Text>
        </View>

        {/* Withdrawal Limit */}
        <Text style={s.sectionTitle}>Limite de retrait</Text>
        <View style={s.card}>
          <Text style={s.cardNote}>Montant maximum autorisé pour une sortie d'argent</Text>
          <View style={s.row}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={withdrawalLimit}
              onChangeText={formatLimit}
              placeholder="Ex: 500 000"
              placeholderTextColor={Colors.n300}
              keyboardType="numeric"
            />
            <TouchableOpacity style={[s.iconBtn, savingLimit && { opacity: 0.6 }]} onPress={saveLimit} disabled={savingLimit}>
              {savingLimit ? <ActivityIndicator color={Colors.white} size="small" /> : <Ionicons name="save-outline" size={18} color={Colors.white} />}
            </TouchableOpacity>
          </View>
          {getLimitValue() > 0 && (
            <Text style={s.limitHint}>Limite actuelle : {getLimitValue().toLocaleString('fr-FR')} XAF</Text>
          )}
        </View>

        {/* Exchange Rates */}
        <Text style={s.sectionTitle}>Taux de change</Text>
        <View style={s.card}>
          <View style={s.settingsRow}>
            <Text style={s.settingsLabel}>1 USD</Text>
            <Text style={s.settingsValue}>{DEFAULT_RATES.USD.XAF} XAF</Text>
          </View>
          <View style={[s.settingsRow, { borderBottomWidth: 0 }]}>
            <Text style={s.settingsLabel}>1 EUR</Text>
            <Text style={s.settingsValue}>{DEFAULT_RATES.EUR.XAF} XAF</Text>
          </View>
        </View>

        {/* Data */}
        <Text style={s.sectionTitle}>Données</Text>
        <View style={s.card}>
          {[
            { icon: 'download-outline', label: 'Exporter (JSON)', onPress: () => Alert.alert('Info', 'Export disponible sur la version web.'), danger: false },
            { icon: 'cloud-upload-outline', label: 'Importer (JSON)', onPress: () => Alert.alert('Info', 'Import disponible sur la version web.'), danger: false },
            { icon: 'trash-outline', label: 'Supprimer transactions', onPress: () => Alert.alert('Info', 'Cette action est réservée à la version web.'), danger: true },
          ].map((item, i) => (
            <TouchableOpacity key={item.label} style={[s.dataBtn, item.danger && s.dataBtnDanger, i > 0 && { marginTop: 8 }]} onPress={item.onPress}>
              <Ionicons name={item.icon as any} size={16} color={item.danger ? Colors.white : Colors.n700} style={{ marginRight: 8 }} />
              <Text style={[s.dataBtnText, item.danger && { color: Colors.white }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Security / Integrity */}
        <Text style={s.sectionTitle}>Sécurité</Text>
        <View style={[s.card, s.integrityCard]}>
          <Text style={s.integrityIcon}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.integrityTitle}>Intégrité cryptographique</Text>
            <Text style={s.integritySub}>Hash SHA-256 sur chaque transaction</Text>
          </View>
        </View>

        {/* About */}
        <Text style={s.sectionTitle}>À propos</Text>
        <View style={s.card}>
          <Text style={s.aboutText}>PMECompta v1.0.0{'\n'}Système de Certification Financière pour PME{'\n'}3ème Année GI · ENSPY · Avril 2026</Text>
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color={Colors.red} style={{ marginRight: 8 }} />
          <Text style={s.logoutBtnText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pageHeader: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  pageTitle: { fontSize: 22, fontWeight: '600', color: Colors.g800 },
  pageSub: { fontSize: 13, color: Colors.n500, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: Colors.n500, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 4, paddingHorizontal: 4 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  cardNote: { fontSize: 11, color: Colors.n500, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 10, fontSize: 14, color: Colors.n900 },
  iconBtn: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Colors.g700, justifyContent: 'center', alignItems: 'center' },
  limitHint: { fontSize: 10, color: Colors.g600, marginTop: 8 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.n100 },
  settingsLabel: { fontSize: 13, color: Colors.n700 },
  settingsValue: { fontSize: 13, fontWeight: '600', color: Colors.n900 },
  dataBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 10 },
  dataBtnDanger: { backgroundColor: Colors.red, borderColor: Colors.red },
  dataBtnText: { fontSize: 13, fontWeight: '500', color: Colors.n700 },
  integrityCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  integrityIcon: { fontSize: 24 },
  integrityTitle: { fontSize: 14, fontWeight: '600', color: Colors.n900 },
  integritySub: { fontSize: 12, color: Colors.n500, marginTop: 2 },
  aboutText: { fontSize: 12, color: Colors.n500, lineHeight: 20 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.red, borderRadius: Radius.lg, padding: 14, marginTop: 8, marginBottom: 16 },
  logoutBtnText: { fontSize: 15, fontWeight: '600', color: Colors.red },
});
