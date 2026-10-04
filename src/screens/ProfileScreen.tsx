import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { AuthManager, UserProfile } from '../services/authManager';
import { DownloadManager } from '../services/downloadManager';
import { TKSTBackground } from '../components/TKSTBackground';

export const ProfileScreen = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [downloadCount, setDownloadCount] = useState(0);

  useEffect(() => {
    const authSubscription = AuthManager.onAuthStateChange((currentUser) => {
      setUser(currentUser);
    });

    DownloadManager.getDownloadedTracks().then((tracks) => {
      setDownloadCount(tracks.length);
    }).catch(() => {});

    return () => authSubscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha seu e-mail e sua senha.');
      return;
    }
    setIsLoggingIn(true);
    try {
      const res = await AuthManager.signIn(email, password);
      if (res.error) {
        Alert.alert('Erro ao entrar', res.error);
      } else {
        Alert.alert('Bem-vindo(a)!', `Olá, ${res.user?.name || res.user?.email}! Sessão iniciada.`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha o e-mail e uma senha para criar sua conta.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha curta', 'A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    setIsSigningUp(true);
    try {
      const res = await AuthManager.signUp(email, password, name);
      if (res.error) {
        Alert.alert('Erro ao cadastrar', res.error);
      } else {
        Alert.alert('Conta Criada!', `Bem-vindo(a) ao TKST Player, ${res.user?.name}! Sua conta foi criada com sucesso.`);
        setName('');
        setEmail('');
        setPassword('');
      }
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Encerrar Sessão', 'Deseja realmente sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await AuthManager.signOut();
        },
      },
    ]);
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      if (__DEV__ || !Updates.isEnabled) {
        Alert.alert(
          'Diagnóstico Local',
          `Updates.isEnabled: ${Updates.isEnabled ? 'Sim' : 'Não'}\n__DEV__: ${__DEV__ ? 'Sim' : 'Não'}\n\nNo APK instalado as atualizações são baixadas automaticamente da Vercel.`
        );
        return;
      }

      Alert.alert('Buscando Atualizações', 'Conectando ao servidor da Vercel...');
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        Alert.alert('Atualização Encontrada!', 'Baixando nova versão com busca global...');
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Atualização Baixada com Sucesso!',
          'A nova versão foi instalada no seu dispositivo. Deseja reiniciar agora para aplicar as novidades?',
          [
            { text: 'Mais tarde', style: 'cancel' },
            { text: 'Reiniciar Agora', onPress: () => Updates.reloadAsync() },
          ]
        );
      } else {
        const activeId = Updates.updateId ? Updates.updateId.substring(0, 8) : 'Base APK';
        Alert.alert(
          'Tudo Atualizado!',
          `Você já está executando a versão mais recente do TKST Player!\n\n• Versão: v1.3.0\n• Motor de Áudio: Músicas Completas (Global)\n• Pacote Ativo: ${activeId}\n• Runtime: ${Updates.runtimeVersion || '1.1.0'}`
        );
      }
    } catch (err: any) {
      console.warn('Erro ao verificar atualizações:', err);
      Alert.alert(
        'Diagnóstico de Atualização',
        `Mensagem: ${err?.message || 'Falha ao conectar com a Vercel'}\n\nRuntime do App: ${Updates.runtimeVersion || '1.1.0'}\nID Atual: ${Updates.updateId ? Updates.updateId.substring(0, 8) : 'Base'}`
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  return (
    <TKSTBackground variant="tiger" opacity={0.25}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 180 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header com Marca TKST */}
        <View style={styles.topHeader}>
          <Image
            source={require('../../assets/tkst/logo-header-tkst.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.heading}>Perfil & Conta</Text>
        </View>

        {user ? (
          <View style={styles.card}>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user.name || user.email)?.[0]?.toUpperCase() || 'T'}
                </Text>
              </View>
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={styles.userName}>{user.name || 'Guerreiro TKST'}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                <View style={styles.badgeRow}>
                  <Ionicons name="shield-checkmark" size={14} color="#00E5FF" />
                  <Text style={styles.userBadge}>{user.role || 'Membro Oficial TKST'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="musical-notes" size={20} color="#00E5FF" />
                <Text style={styles.statNumber}>{downloadCount}</Text>
                <Text style={styles.statLabel}>Músicas Offline</Text>
              </View>
              <View style={styles.statBox}>
                <Ionicons name="shield" size={20} color="#00E5FF" />
                <Text style={styles.statNumber}>v1.3.0</Text>
                <Text style={styles.statLabel}>Versão do App</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color="#FF453A" />
              <Text style={styles.logoutText}>Encerrar Sessão</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.loginTitle}>Acesse sua conta TKST</Text>
            <Text style={styles.loginSubtitle}>
              Crie uma conta para salvar suas preferências e identificar seu perfil no app.
            </Text>

            <TextInput
              placeholder="Seu Nome ou Apelido"
              placeholderTextColor="#707078"
              style={styles.input}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              placeholder="Seu E-mail"
              placeholderTextColor="#707078"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Sua Senha (mínimo 6 caracteres)"
              placeholderTextColor="#707078"
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={isLoggingIn || isSigningUp}
            >
              {isLoggingIn ? (
                <ActivityIndicator color="#08080A" />
              ) : (
                <Text style={styles.loginButtonText}>Entrar</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signupButton}
              onPress={handleSignUp}
              disabled={isLoggingIn || isSigningUp}
            >
              {isSigningUp ? (
                <ActivityIndicator color="#00E5FF" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="person-add-outline" size={18} color="#00E5FF" />
                  <Text style={styles.signupButtonText}>Criar Nova Conta</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.card, { marginTop: 18 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#00E5FF" />
            <Text style={[styles.loginTitle, { marginBottom: 0, marginLeft: 8 }]}>Versão do Sistema & OTA</Text>
          </View>
          <Text style={styles.updateInfoText}>
            O TKST Player atualiza recursos e acervos silenciosamente pela nuvem Vercel sem precisar reinstalar o APK.
          </Text>

          {/* Painel Informativo da Versão */}
          <View style={styles.versionContainer}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Versão do App:</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionValue}>v1.3.0 (Músicas Completas)</Text>
              </View>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Motor de Áudio:</Text>
              <Text style={styles.versionSubValue}>Acervo Global (Músicas Inteiras)</Text>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Pacote Ativo:</Text>
              <Text style={[styles.versionSubValue, { color: Updates.updateId ? '#30D158' : '#00E5FF', fontWeight: '700' }]}>
                {Updates.updateId
                  ? `Nuvem Vercel (${Updates.updateId.substring(0, 8)})`
                  : 'Instalação Base (APK)'}
              </Text>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Runtime Version:</Text>
              <Text style={styles.versionSubValue}>{Updates.runtimeVersion || '1.1.0'}</Text>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Servidor Cloud:</Text>
              <Text style={styles.versionSubValue}>tkst-player-valeiroguerrente.vercel.app</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.updateButton}
            onPress={handleCheckUpdates}
            disabled={isCheckingUpdates}
          >
            {isCheckingUpdates ? (
              <ActivityIndicator color="#00E5FF" />
            ) : (
              <>
                <Ionicons name="sync" size={16} color="#00E5FF" />
                <Text style={styles.updateButtonText}>Verificar Atualizações na Vercel</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </TKSTBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#12121AEE',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#242436',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#08080A',
    fontSize: 24,
    fontWeight: '800',
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  userEmail: {
    color: '#A0A0B0',
    fontSize: 14,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  userBadge: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#181824',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262638',
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  statLabel: {
    color: '#707078',
    fontSize: 11,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    backgroundColor: '#FF453A15',
    borderRadius: 10,
  },
  logoutText: {
    color: '#FF453A',
    fontSize: 14,
    fontWeight: '600',
  },
  loginTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  loginSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1E1E2C',
    borderRadius: 12,
    color: '#FFFFFF',
    height: 50,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A3C',
    fontSize: 15,
  },
  loginButton: {
    backgroundColor: '#00E5FF',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  loginButtonText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 16,
  },
  signupButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#00E5FF40',
    borderRadius: 12,
    backgroundColor: '#00E5FF10',
  },
  signupButtonText: {
    color: '#00E5FF',
    fontSize: 15,
    fontWeight: '600',
  },
  updateInfoText: {
    color: '#A0A0B0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#00E5FF',
    borderWidth: 1,
    borderRadius: 12,
    height: 46,
    gap: 8,
  },
  updateButtonText: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 14,
  },
  versionContainer: {
    backgroundColor: '#161622',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#242436',
    gap: 10,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  versionLabel: {
    color: '#8E8E98',
    fontSize: 13,
  },
  versionSubValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  versionBadge: {
    backgroundColor: '#00E5FF18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00E5FF40',
  },
  versionValue: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '800',
  },
});
