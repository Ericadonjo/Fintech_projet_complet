import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, Font } from '../theme';

interface Props { onLogin: () => void; }

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      return;
    }
    setLoading(true);
    await new Promise(r => setTimeout(r, 500));
    await AsyncStorage.setItem('pme_user', JSON.stringify({ email }));
    setLoading(false);
    onLogin();
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero section — mirrors .login-info */}
          <View style={s.hero}>
            <Text style={s.brand}>PME<Text style={s.brandAccent}>Compta</Text></Text>
            <Text style={s.heroTitle}>Gérez la trésorerie de votre PME en toute simplicité</Text>
            <Text style={s.heroIntro}>
              Application de comptabilité conçue pour les PME africaines. Enregistrez vos flux financiers et générez des bilans automatiques.
            </Text>

            <View style={s.features}>
              {[
                { icon: 'wallet-outline', title: 'Gestion simplifiée', desc: 'Caisse, MTN, Orange Money, Banque en un seul endroit.' },
                { icon: 'shield-checkmark-outline', title: 'Sécurité SHA-256', desc: 'Chaque transaction est protégée cryptographiquement.' },
                { icon: 'phone-portrait-outline', title: 'Multi-appareils', desc: 'Synchronisation automatique entre vos appareils.' },
                { icon: 'wifi-outline', title: 'Hors-ligne', desc: 'Utilisez l\'app même sans connexion internet.' },
              ].map(f => (
                <View key={f.title} style={s.featureItem}>
                  <View style={s.featureIcon}>
                    <Ionicons name={f.icon as any} size={16} color={Colors.a400} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.featureTitle}>{f.title}</Text>
                    <Text style={s.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Form section — mirrors .login-form-section */}
          <View style={s.formSection}>
            <Text style={s.formTitle}>Connexion</Text>
            <Text style={s.formSub}>Entrez vos identifiants pour continuer</Text>

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="exemple@email.com"
              placeholderTextColor={Colors.n300}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={s.label}>Mot de passe</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.n300}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.n500} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.loginBtn, (!email || !password || loading) && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={!email || !password || loading}
            >
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <>
                  <Ionicons name="log-in-outline" size={18} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={s.loginBtnText}>Se connecter</Text>
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
  container: { flex: 1, backgroundColor: Colors.g800 },
  scroll: { flexGrow: 1 },

  // Hero
  hero: { backgroundColor: Colors.g800, padding: Spacing.lg, paddingTop: Spacing.xl },
  brand: { fontFamily: 'DMSerifDisplay-Regular', fontSize: 32, color: Colors.white, marginBottom: Spacing.md },
  brandAccent: { color: Colors.a400 },
  heroTitle: { fontSize: 20, fontWeight: '600' as any, color: Colors.white, lineHeight: 28, marginBottom: Spacing.sm },
  heroIntro: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 20, marginBottom: Spacing.lg },
  features: { gap: 14 },
  featureItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  featureIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  featureTitle: { fontSize: 14, fontWeight: '600' as any, color: Colors.white, marginBottom: 2 },
  featureDesc: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 17 },

  // Form
  formSection: { backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingTop: Spacing.xl, marginTop: Spacing.lg, minHeight: 360 },
  formTitle: { fontSize: 22, fontWeight: '600' as any, color: Colors.g800, marginBottom: 6 },
  formSub: { fontSize: 13, color: Colors.n500, marginBottom: Spacing.lg },
  label: { fontSize: 13, fontWeight: '500' as any, color: Colors.n700, marginBottom: 6 },
  input: { backgroundColor: Colors.n50, borderWidth: 1, borderColor: Colors.n100, borderRadius: Radius.sm, padding: 11, fontSize: 14, color: Colors.n900, marginBottom: Spacing.md },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  eyeBtn: { paddingHorizontal: 10, height: 44, justifyContent: 'center' },
  loginBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.g700, borderRadius: Radius.md, paddingVertical: 14, marginTop: 8 },
  loginBtnText: { fontSize: 15, fontWeight: '600' as any, color: Colors.white },
});
