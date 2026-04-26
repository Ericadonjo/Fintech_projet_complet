import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Colors, Spacing, Radius } from '../theme';
import { Account, Category } from '../types';

function fmtShort(n: number) { return n.toLocaleString('fr-FR'); }

const CAT_CODE_TO_ICON: Record<string, string> = {
  VENTE_CLIENT: '💰', ACHAT_MARCHANDISE: '🛒', CHARGE_PERSONNEL: '👤',
  CHARGE_LOYER: '🏠', CHARGE_TRANSPORT: '🚚', REMBOURSEMENT_DETTE: '🏦',
  EMPRUNT_RECU: '📥', APPORT_DIRIGEANT: '🔼', RETRAIT_DIRIGEANT: '🔽',
  AUTRE_ENTREE: '➕', AUTRE_SORTIE: '➖',
};

export default function NewTransactionScreen({ navigation, route }: any) {
  const defaultType = route?.params?.defaultType || 'debit';
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [withdrawalLimit, setWithdrawalLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<'IMAGE' | 'AUDIO' | 'SMS_SCREENSHOT'>('IMAGE');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [form, setForm] = useState({
    type: defaultType as 'credit' | 'debit',
    amount: '',
    currency: 'XAF',
    category_id: null as any,
    account_id: null as any,
    description: '',
    reference: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [accs, cats, limit] = await Promise.all([
        api.accounts.list(), api.categories.list(), api.settings.get('withdrawal_limit').catch(() => 0),
      ]);
      setAccounts(accs); setCategories(cats); setWithdrawalLimit(Number(limit) || 0);
      const bals: Record<string, number> = {};
      for (const a of accs) {
        try { bals[a.id] = await api.accounts.balance(a.id); } catch { bals[a.id] = a.initial_balance || 0; }
      }
      setBalances(bals);
      if (accs.length > 0) setForm(f => ({ ...f, account_id: accs[0].id }));
      if (cats.length > 0) setForm(f => ({ ...f, category_id: cats[0].id }));
    } catch { }
    finally { setLoading(false); }
  }

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission refusée', 'L\'accès au micro est nécessaire pour enregistrer une note vocale.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
    } catch (err) { Alert.alert('Erreur', 'Impossible de démarrer l\'enregistrement'); }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setAttachmentUri(uri);
    setAttachmentType('AUDIO');
    setRecording(null);
  }

  async function pickImage(type: 'IMAGE' | 'SMS_SCREENSHOT') {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        setAttachmentUri(result.assets[0].uri);
        setAttachmentType(type);
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de sélectionner la photo');
    }
  }

  function handleAmountChange(val: string) {
    const d = val.replace(/\D/g, '');
    setForm(f => ({ ...f, amount: d ? parseInt(d, 10).toLocaleString('fr-FR') : '' }));
  }
  function getAmountNum() { return parseInt(form.amount.replace(/\s/g, ''), 10) || 0; }

  async function handleSubmit() {
    const amountNum = getAmountNum();
    if (!form.account_id || !amountNum || !form.category_id) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires.'); return;
    }
    
    if (form.type === 'debit') {
      const bal = balances[form.account_id] || 0;
      if (amountNum > bal) { Alert.alert('Solde insuffisant', `Solde actuel : ${fmtShort(bal)} XAF`); return; }
      if (withdrawalLimit > 0 && amountNum > withdrawalLimit) {
        Alert.alert('Limite dépassée', `Limite de retrait : ${fmtShort(withdrawalLimit)} XAF`); return;
      }
    }

    setSaving(true);
    try {
      const tx = await api.transactions.create({ ...form, amount: amountNum, account_id: form.account_id, category_id: form.category_id });
      
      if (attachmentUri && tx.id) {
        const mimeType = attachmentType === 'AUDIO' ? 'audio/m4a' : 'image/jpeg';
        await api.transactions.uploadAttachment(tx.id, attachmentUri, mimeType, attachmentType);
      }
      
      navigation.goBack();
    } catch (err: any) { Alert.alert('Erreur', err?.message || 'Impossible d\'enregistrer.'); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  const amountNum = getAmountValue ? getAmountNum() : 0;
  const currentBal = form.account_id ? (balances[form.account_id] || 0) : 0;
  const filteredCats = categories;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={Colors.n700} />
            </TouchableOpacity>
            <View>
              <Text style={s.pageTitle}>Nouvelle Transaction</Text>
              <Text style={s.pageSub}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            </View>
          </View>

          <View style={s.body}>
            <View style={s.fluxToggle}>
              <TouchableOpacity
                style={[s.fluxBtn, form.type === 'credit' && s.fluxBtnIn]}
                onPress={() => setForm(f => ({ ...f, type: 'credit' }))}
              >
                <Ionicons name="trending-up" size={16} color={form.type === 'credit' ? Colors.g700 : Colors.n700} style={{ marginRight: 6 }} />
                <Text style={[s.fluxBtnText, form.type === 'credit' && s.fluxBtnTextIn]}>Entrée d'argent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.fluxBtn, form.type === 'debit' && s.fluxBtnOut]}
                onPress={() => setForm(f => ({ ...f, type: 'debit' }))}
              >
                <Ionicons name="trending-down" size={16} color={form.type === 'debit' ? Colors.red : Colors.n700} style={{ marginRight: 6 }} />
                <Text style={[s.fluxBtnText, form.type === 'debit' && s.fluxBtnTextOut]}>Sortie d'argent</Text>
              </TouchableOpacity>
            </View>

            <View style={s.formField}>
              <Text style={s.label}>Montant</Text>
              <View style={s.amountRow}>
                <TextInput
                  style={[s.fieldInput, { flex: 1 }]}
                  value={form.amount}
                  onChangeText={handleAmountChange}
                  placeholder="0"
                  placeholderTextColor={Colors.n300}
                  keyboardType="numeric"
                />
                <View style={s.devisePicker}>
                  {['XAF', 'USD', 'EUR'].map(c => (
                    <TouchableOpacity key={c} style={[s.deviseOption, form.currency === c && s.deviseOptionActive]} onPress={() => setForm(f => ({ ...f, currency: c }))}>
                      <Text style={[s.deviseText, form.currency === c && { color: Colors.g700, fontWeight: '600' }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {withdrawalLimit > 0 && form.type === 'debit' && (
                <Text style={s.limitHint}>Limite de retrait : {fmtShort(withdrawalLimit)} XAF</Text>
              )}
              {form.type === 'debit' && form.account_id && (
                <Text style={[s.limitHint, amountNum > currentBal && { color: Colors.red }]}>
                  Solde disponible : {fmtShort(currentBal)} XAF
                </Text>
              )}
            </View>

            <View style={s.formField}>
              <Text style={s.label}>Catégorie</Text>
              <View style={s.catGrid}>
                {filteredCats.map(cat => {
                  const icon = CAT_CODE_TO_ICON[(cat as any).code] || cat.icon || '📌';
                  return (
                    <TouchableOpacity
                      key={String(cat.id)}
                      style={[s.catChip, form.category_id === cat.id && s.catChipSelected]}
                      onPress={() => setForm(f => ({ ...f, category_id: cat.id }))}
                    >
                      <Text style={{ fontSize: 14 }}>{icon}</Text>
                      <Text style={[s.catChipText, form.category_id === cat.id && s.catChipTextSelected]} numberOfLines={2}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={s.formField}>
              <Text style={s.label}>Compte</Text>
              <View style={s.comptesRow}>
                {accounts.map(acc => {
                  const emoji = acc.type === 'cash' ? '💵' : acc.type === 'mobile' ? '📱' : '🏦';
                  return (
                    <TouchableOpacity
                      key={String(acc.id)}
                      style={[s.compteChip, form.account_id === acc.id && s.compteChipSelected]}
                      onPress={() => setForm(f => ({ ...f, account_id: acc.id }))}
                    >
                      <Text style={s.compteChipDot}>{emoji}</Text>
                      <Text style={[s.compteChipText, form.account_id === acc.id && { color: Colors.g700, fontWeight: '600' }]}>{acc.name}</Text>
                      {(balances[acc.id as string] || 0) > 0 && (
                        <Text style={s.compteChipBal}> ({fmtShort(balances[acc.id as string])} XAF)</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={s.formField}>
              <Text style={s.label}>Description (optionnel)</Text>
              <TextInput style={s.fieldInput} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Client, reference..." placeholderTextColor={Colors.n300} />
            </View>

            <View style={s.formField}>
              <Text style={s.label}>Référence externe (optionnel)</Text>
              <TextInput style={s.fieldInput} value={form.reference} onChangeText={v => setForm(f => ({ ...f, reference: v }))} placeholder="N° facture, transaction MoMo..." placeholderTextColor={Colors.n300} />
            </View>

            <View style={s.formField}>
              <Text style={s.label}>Date</Text>
              <TextInput style={s.fieldInput} value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="AAAA-MM-JJ" placeholderTextColor={Colors.n300} />
            </View>

            <View style={s.formField}>
              <Text style={s.label}>Justificatif</Text>
              <View style={s.justifRow}>
                <TouchableOpacity 
                  style={[s.justifBtn, attachmentType === 'IMAGE' && attachmentUri && s.justifBtnActive]} 
                  onPress={() => pickImage('IMAGE')}
                >
                  <Text style={s.justifIcon}>📷</Text>
                  <Text style={s.justifLabel}>Photo reçu</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[s.justifBtn, attachmentType === 'SMS_SCREENSHOT' && attachmentUri && s.justifBtnActive]} 
                  onPress={() => pickImage('SMS_SCREENSHOT')}
                >
                  <Text style={s.justifIcon}>📱</Text>
                  <Text style={s.justifLabel}>Capture SMS</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[s.justifBtn, attachmentType === 'AUDIO' && attachmentUri && s.justifBtnActive, isRecording && { backgroundColor: Colors.redBg }]} 
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  <Text style={s.justifIcon}>{isRecording ? '⏹️' : '🎤'}</Text>
                  <Text style={s.justifLabel}>{isRecording ? 'Arrêter' : 'Note vocale'}</Text>
                </TouchableOpacity>
              </View>
              {attachmentUri && (
                <View style={s.previewRow}>
                  {attachmentType === 'AUDIO' ? (
                    <View style={s.audioPreview}>
                      <Ionicons name="musical-notes" size={20} color={Colors.g700} />
                      <Text style={s.audioText}>Note vocale enregistrée</Text>
                      <TouchableOpacity onPress={() => setAttachmentUri(null)}><Ionicons name="close-circle" size={20} color={Colors.red} /></TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.imagePreview}>
                      <Image source={{ uri: attachmentUri }} style={s.thumbnail} />
                      <TouchableOpacity style={s.removeImage} onPress={() => setAttachmentUri(null)}>
                        <Ionicons name="close-circle" size={20} color={Colors.red} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>

            <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={handleSubmit} disabled={saving}>
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : <>
                  <Ionicons name="save-outline" size={18} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={s.submitBtnText}>Enregistrer la transaction</Text>
                </>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { backgroundColor: Colors.white, borderRadius: Radius.lg, margin: Spacing.md, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.n100, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 20, fontWeight: '600', color: Colors.g800 },
  pageSub: { fontSize: 12, color: Colors.n500, marginTop: 2 },
  body: { backgroundColor: Colors.white, borderRadius: Radius.lg, margin: Spacing.md, padding: Spacing.md },
  fluxToggle: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
  fluxBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.n100, backgroundColor: Colors.n50 },
  fluxBtnIn: { backgroundColor: Colors.g50, borderColor: Colors.g400 },
  fluxBtnOut: { backgroundColor: Colors.redBg, borderColor: Colors.red },
  fluxBtnText: { fontSize: 13, fontWeight: '500', color: Colors.n700 },
  fluxBtnTextIn: { color: Colors.g700 },
  fluxBtnTextOut: { color: Colors.red },
  formField: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '500', color: Colors.n700, marginBottom: 6 },
  fieldInput: { backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 10, fontSize: 14, color: Colors.n900 },
  amountRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  devisePicker: { borderWidth: 1, borderColor: Colors.g200, borderRadius: Radius.sm, overflow: 'hidden' },
  deviseOption: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.n50 },
  deviseOptionActive: { backgroundColor: Colors.g50 },
  deviseText: { fontSize: 13, color: Colors.n500 },
  limitHint: { fontSize: 12, color: Colors.a500, marginTop: 6 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { width: '22%', backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 10, alignItems: 'center' },
  catChipSelected: { backgroundColor: Colors.g50, borderColor: Colors.g400 },
  catChipText: { fontSize: 10, color: Colors.n700, textAlign: 'center', marginTop: 4 },
  catChipTextSelected: { color: Colors.g700, fontWeight: '600' },
  comptesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compteChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  compteChipSelected: { backgroundColor: Colors.g50, borderColor: Colors.g400 },
  compteChipDot: { fontSize: 14, marginRight: 6 },
  compteChipText: { fontSize: 12, color: Colors.n700 },
  compteChipBal: { fontSize: 12, color: Colors.n300 },
  justifRow: { flexDirection: 'row', gap: 6 },
  justifBtn: { flex: 1, backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 12, alignItems: 'center' },
  justifBtnActive: { backgroundColor: Colors.g50, borderColor: Colors.g400 },
  justifIcon: { fontSize: 18, marginBottom: 3 },
  justifLabel: { fontSize: 9, color: Colors.n500, textAlign: 'center' },
  previewRow: { marginTop: 10 },
  audioPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.g50, padding: 10, borderRadius: Radius.sm, gap: 10 },
  audioText: { flex: 1, fontSize: 12, color: Colors.g800 },
  imagePreview: { position: 'relative', width: 60, height: 60 },
  thumbnail: { width: 60, height: 60, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.n200 },
  removeImage: { position: 'absolute', top: -5, right: -5, backgroundColor: Colors.red, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.g700, borderRadius: Radius.sm, paddingVertical: 13, marginTop: 4 },
  submitBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
