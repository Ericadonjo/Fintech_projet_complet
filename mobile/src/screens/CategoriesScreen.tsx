import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Colors, Spacing, Radius, Font } from '../theme';
import { Category } from '../types';

const GROUP_MAP: Record<string, { label: string; bg: string; color: string }> = {
  produit:  { label: 'Produit',  bg: Colors.g50,    color: Colors.g700 },
  charge:   { label: 'Charge',   bg: Colors.redBg,  color: Colors.red  },
  autre:    { label: 'Autre',    bg: Colors.a50,     color: Colors.a500 },
  // schema_v2 groups
  CHIFFRE_AFFAIRES:             { label: 'CA',       bg: Colors.g50,   color: Colors.g700 },
  ACHATS_CHARGES_EXPLOITATION:  { label: 'Achats',   bg: Colors.redBg, color: Colors.red  },
  CHARGES_PERSONNEL:            { label: 'Personnel',bg: Colors.redBg, color: Colors.red  },
  CHARGES_EXTERNES:             { label: 'Ext.',     bg: Colors.redBg, color: Colors.red  },
  FLUX_FINANCEMENT:             { label: 'Finanmt',  bg: Colors.a50,   color: Colors.a500 },
  FLUX_CAPITAL:                 { label: 'Capital',  bg: Colors.a50,   color: Colors.a500 },
  PRODUITS_DIVERS:              { label: 'Divers +', bg: Colors.g50,   color: Colors.g700 },
  CHARGES_DIVERSES:             { label: 'Divers -', bg: Colors.redBg, color: Colors.red  },
};

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<any>(null);
  const [form, setForm] = useState({ name: '', group_name: 'charge' });

  const loadData = async () => {
    try { setCategories(await api.categories.list()); } catch { }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  function openAdd() { setForm({ name: '', group_name: 'charge' }); setEditingId(null); setModalOpen(true); }
  function openEdit(cat: Category) { setForm({ name: cat.name, group_name: cat.group_name || 'charge' }); setEditingId(cat.id); setModalOpen(true); }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('Erreur', 'Veuillez entrer un nom.'); return; }
    setSaving(true);
    try {
      if (editingId) await api.categories.update(editingId, form);
      else await api.categories.create(form);
      setModalOpen(false);
      loadData();
    } catch (err: any) { Alert.alert('Erreur', err?.message || 'Échec.'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: any) {
    Alert.alert('Supprimer', 'Supprimer cette catégorie ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await api.categories.delete(id); loadData(); } },
    ]);
  }

  if (loading) return (
    <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={Colors.g700} />
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header — mirrors .comptes-header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Catégories</Text>
          <Text style={s.sub}>{categories.length} catégorie{categories.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Text style={s.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.g700} />}
      >
        {categories.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="pricetags-outline" size={48} color={Colors.n300} />
            <Text style={s.emptyText}>Aucune catégorie</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
              <Text style={s.emptyBtnText}>Ajouter une catégorie</Text>
            </TouchableOpacity>
          </View>
        ) : (
          categories.map(cat => {
            const info = GROUP_MAP[cat.group_name || ''] || { label: cat.group_name || '?', bg: Colors.n50, color: Colors.n700 };
            return (
              <View key={String(cat.id)} style={s.catCard}>
                {/* .compte-avatar */}
                <View style={[s.avatar, { backgroundColor: info.bg }]}>
                  <Text style={[s.avatarText, { color: info.color }]}>{info.label}</Text>
                </View>
                {/* .compte-info */}
                <View style={s.catInfo}>
                  <Text style={s.catName}>{cat.name}</Text>
                  <Text style={s.catGroup}>{info.label}</Text>
                </View>
                {/* Actions */}
                <View style={s.actions}>
                  <TouchableOpacity style={s.actionBtnOutline} onPress={() => openEdit(cat)}>
                    <Ionicons name="pencil" size={14} color={Colors.n700} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtnDanger} onPress={() => handleDelete(cat.id)}>
                    <Ionicons name="trash" size={14} color={Colors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal — mirrors web modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={s.modal} onPress={() => {}}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingId ? 'Modifier' : 'Nouvelle'} catégorie</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Text style={s.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Nom</Text>
            <TextInput
              style={s.input}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="Ex: Vente, Loyer..."
              placeholderTextColor={Colors.n300}
            />

            <Text style={s.label}>Groupe</Text>
            {[
              { value: 'produit', label: 'Produit (Revenu)' },
              { value: 'charge', label: 'Charge (Dépense)' },
              { value: 'autre', label: 'Autre' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.radioRow, form.group_name === opt.value && s.radioRowActive]}
                onPress={() => setForm(f => ({ ...f, group_name: opt.value }))}
              >
                <View style={[s.radio, form.group_name === opt.value && s.radioActive]} />
                <Text style={[s.radioLabel, form.group_name === opt.value && { color: Colors.g700, fontWeight: '600' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}

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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.white, padding: Spacing.lg, borderRadius: Radius.lg, margin: Spacing.md },
  title: { fontSize: 20, fontWeight: '600', color: Colors.g800 },
  sub: { fontSize: 12, color: Colors.n500, marginTop: 4 },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.g700, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: Colors.white, fontSize: 20, lineHeight: 24 },
  catCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.md, padding: 14, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 10, fontWeight: '700' },
  catInfo: { flex: 1 },
  catName: { fontSize: 14, fontWeight: '600', color: Colors.n900 },
  catGroup: { fontSize: 11, color: Colors.n500 },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtnOutline: { width: 30, height: 30, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.n100, justifyContent: 'center', alignItems: 'center' },
  actionBtnDanger: { width: 30, height: 30, borderRadius: Radius.sm, backgroundColor: Colors.red, justifyContent: 'center', alignItems: 'center' },
  emptyState: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 40, alignItems: 'center' },
  emptyText: { color: Colors.n500, fontSize: 14, marginTop: 12, marginBottom: 16 },
  emptyBtn: { backgroundColor: Colors.g700, paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.sm },
  emptyBtnText: { color: Colors.white, fontWeight: '600', fontSize: 13 },
  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.n100, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.n900 },
  modalClose: { fontSize: 26, color: Colors.n500, lineHeight: 28 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.n700, marginBottom: 6 },
  input: { backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 10, fontSize: 14, color: Colors.n900, marginBottom: 16 },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.sm, marginBottom: 6 },
  radioRowActive: { backgroundColor: Colors.g50 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Colors.n300, marginRight: 10 },
  radioActive: { borderColor: Colors.g600, backgroundColor: Colors.g600 },
  radioLabel: { fontSize: 14, color: Colors.n700 },
  submitBtn: { backgroundColor: Colors.g700, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  submitBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
});
