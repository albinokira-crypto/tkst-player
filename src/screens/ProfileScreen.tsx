import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { AuthManager, UserProfile } from '../services/authManager';
import { DownloadManager } from '../services/downloadManager';
import { TKSTBackground } from '../components/TKSTBackground';

export const ProfileScreen = () => {
  const [user, setUser] = useState<UserProfile | null>(null);

  // Modo de autenticação: 'login' ou 'signup'
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [downloadCount, setDownloadCount] = useState(0);

  useEffect(() => {
    const authSubscription = AuthManager.onAuthStateChange((currentUser) => {
      setUser(currentUser);
    });

    DownloadManager.getDownloadedTracks()
      .then((tracks) => {
        setDownloadCount(tracks.length);
      })
      .catch(() => {});

    return () => authSubscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha seu e-mail e sua senha.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await AuthManager.signIn(email, password);
      if (res.error) {
        Alert.alert('Atenção', res.error);
      } else {
        Alert.alert('Bem-vindo(a)!', `Olá, ${res.user?.name || res.user?.email}! Sessão iniciada.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, informe seu e-mail e uma senha de no mínimo 6 caracteres.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha curta', 'A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await AuthManager.signUp(email, password, name);
      if (res.error) {
        Alert.alert('Erro ao cadastrar', res.error);
      } else {
        Alert.alert('Conta Pronta!', `Bem-vindo(a) ao TKST Player, ${res.user?.name}!`);
        setName('');
        setEmail('');
        setPassword('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsSubmitting(true);
    try {
      const guest = await AuthManager.signInAsGuest();
      Alert.alert('Acesso como Visitante', `Bem-vindo(a), ${guest.name}! Você já pode usar todos os recursos do app.`);
    } finally {
      setIsSubmitting(false);
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
    setUpdateMessage('Conectando ao servidor da Vercel...');

    try {
      if (__DEV__ || !Updates.isEnabled) {
        setUpdateMessage(null);
        Alert.alert(
          'Diagnóstico Local',
          `Updates.isEnabled: ${Updates.isEnabled ? 'Sim' : 'Não'}\n__DEV__: ${__DEV__ ? 'Sim' : 'Não'}\n\nNo APK instalado, as atualizações são baixadas automaticamente da Vercel.`
        );
        return;
      }

      setUpdateMessage('Consultando novo pacote na nuvem...');
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        setUpdateMessage('Baixando nova versão do app...');
        await Updates.fetchUpdateAsync();
        setUpdateMessage('Atualização pronta!');
        Alert.alert(
          'Nova Versão Instalada!',
          'A atualização mais recente da Vercel (v1.3.1) foi baixada com sucesso no seu dispositivo.\n\nDeseja reiniciar o aplicativo agora para carregar as novidades?',
          [
            { text: 'Mais tarde', style: 'cancel' },
            {
              text: 'Reiniciar Agora',
              onPress: async () => {
                await Updates.reloadAsync();
              },
            },
          ]
        );
      } else {
        setUpdateMessage('Aplicativo sincronizado com a Vercel.');
        const activeId = Updates.updateId ? Updates.updateId.substring(0, 8) : 'Base APK';
        Alert.alert(
          'Sincronizado com a Vercel',
          `O seu dispositivo está conectado ao servidor mais recente!\n\n• Versão: v1.3.1\n• Motores: YouTube Music + SoundCloud\n• Pacote: ${activeId}\n\nDeseja recarregar o app agora para garantir que a versão em cache está ativa?`,
          [
            { text: 'Fechar', style: 'cancel' },
            {
              text: 'Recarregar Agora',
              onPress: async () => {
                await Updates.reloadAsync();
              },
            },
          ]
        );
      }
    } catch (err: any) {
      console.warn('Erro ao verificar atualizações:', err);
      setUpdateMessage('Falha na verificação: ' + (err?.message || 'Erro de rede'));
      Alert.alert(
        'Diagnóstico de Atualização',
        `Mensagem: ${err?.message || 'Falha ao conectar com a Vercel'}\n\nRuntime: ${Updates.runtimeVersion || '1.1.0'}\nID: ${Updates.updateId ? Updates.updateId.substring(0, 8) : 'Base'}\n\nVocê também pode clicar no botão "Recarregar App Agora" abaixo para reiniciar com o pacote baixado.`
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleForceReload = async () => {
    setIsReloading(true);
    try {
      if (!Updates.isEnabled && !__DEV__) {
        Alert.alert('Aviso', 'O módulo de recarregamento OTA só funciona no APK instalado.');
        return;
      }
      await Updates.reloadAsync();
    } catch (e: any) {
      Alert.alert('Erro ao recarregar', e?.message || 'Não foi possível recarregar o app agora.');
    } finally {
      setIsReloading(false);
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
          /* CARD: Usuário Logado */
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
                <Text style={styles.statNumber}>v1.3.1</Text>
                <Text style={styles.statLabel}>Versão do App</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color="#FF453A" />
              <Text style={styles.logoutText}>Encerrar Sessão</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* CARD: Login / Cadastro Separados por Abas */
          <View style={styles.card}>
            {/* Seletor de Abas: Fazer Login vs Criar Conta */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, authMode === 'login' && styles.tabButtonActive]}
                onPress={() => setAuthMode('login')}
              >
                <Ionicons
                  name="log-in-outline"
                  size={18}
                  color={authMode === 'login' ? '#08080A' : '#A0A0B0'}
                />
                <Text style={[styles.tabText, authMode === 'login' && styles.tabTextActive]}>
                  Fazer Login
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, authMode === 'signup' && styles.tabButtonActive]}
                onPress={() => setAuthMode('signup')}
              >
                <Ionicons
                  name="person-add-outline"
                  size={18}
                  color={authMode === 'signup' ? '#08080A' : '#A0A0B0'}
                />
                <Text style={[styles.tabText, authMode === 'signup' && styles.tabTextActive]}>
                  Criar Conta
                </Text>
              </TouchableOpacity>
            </View>

            {authMode === 'login' ? (
              /* ABA: LOGIN */
              <View style={{ marginTop: 6 }}>
                <Text style={styles.loginTitle}>Entrar na sua Conta</Text>
                <Text style={styles.loginSubtitle}>
                  Digite seu e-mail e sua senha cadastrada para acessar suas playlists e músicas.
                </Text>

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
                  placeholder="Sua Senha"
                  placeholderTextColor="#707078"
                  style={styles.input}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />

                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handleLogin}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#08080A" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="log-in-outline" size={20} color="#08080A" />
                      <Text style={styles.loginButtonText}>Entrar no TKST</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeLink}
                  onPress={() => setAuthMode('signup')}
                >
                  <Text style={styles.switchModeText}>
                    Ainda não tem conta? <Text style={styles.switchModeHighlight}>Cadastre-se aqui</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ABA: CRIAR CONTA */
              <View style={{ marginTop: 6 }}>
                <Text style={styles.loginTitle}>Criar Nova Conta TKST</Text>
                <Text style={styles.loginSubtitle}>
                  Preencha seus dados para criar sua conta oficial e salvar suas preferências.
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
                  placeholder="Senha (mínimo 6 caracteres)"
                  placeholderTextColor="#707078"
                  style={styles.input}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />

                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handleSignUp}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#08080A" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="checkmark-circle-outline" size={20} color="#08080A" />
                      <Text style={styles.loginButtonText}>Cadastrar e Entrar</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeLink}
                  onPress={() => setAuthMode('login')}
                >
                  <Text style={styles.switchModeText}>
                    Já tem uma conta cadastrada? <Text style={styles.switchModeHighlight}>Fazer Login</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Divisor & Botão de Convidado */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OU</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.guestButton}
              onPress={handleGuestLogin}
              disabled={isSubmitting}
            >
              <Ionicons name="sparkles-outline" size={18} color="#00E5FF" />
              <Text style={styles.guestButtonText}>Continuar como Convidado</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* CARD: Atualização OTA e Informações do Sistema */}
        <View style={[styles.card, { marginTop: 18 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#00E5FF" />
            <Text style={[styles.loginTitle, { marginBottom: 0, marginLeft: 8 }]}>
              Versão do Sistema & OTA
            </Text>
          </View>
          <Text style={styles.updateInfoText}>
            O TKST Player atualiza recursos silenciosamente pela nuvem Vercel sem precisar reinstalar o APK.
          </Text>

          {/* Painel Informativo da Versão */}
          <View style={styles.versionContainer}>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Versão do App:</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionValue}>v1.3.1 (YouTube & SoundCloud)</Text>
              </View>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Motor de Áudio:</Text>
              <Text style={styles.versionSubValue}>YouTube + SoundCloud (Vocais Reais)</Text>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Filtro Ativo:</Text>
              <Text style={[styles.versionSubValue, { color: '#30D158' }]}>Sem Instrumental / Karaokê</Text>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>Pacote Ativo:</Text>
              <Text
                style={[
                  styles.versionSubValue,
                  { color: Updates.updateId ? '#30D158' : '#00E5FF', fontWeight: '700' },
                ]}
              >
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
              <Text style={styles.versionSubValue}>tkst-player.vercel.app</Text>
            </View>
          </View>

          {/* Feedback de status da atualização */}
          {updateMessage && (
            <View style={styles.updateStatusBox}>
              <Ionicons name="information-circle-outline" size={16} color="#00E5FF" />
              <Text style={styles.updateStatusText}>{updateMessage}</Text>
            </View>
          )}

          {/* Botão 1: Verificar e Baixar Atualização */}
          <TouchableOpacity
            style={styles.updateButton}
            onPress={handleCheckUpdates}
            disabled={isCheckingUpdates || isReloading}
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

          {/* Botão 2: Forçar Recarregamento Imediato do App */}
          <TouchableOpacity
            style={styles.reloadButton}
            onPress={handleForceReload}
            disabled={isCheckingUpdates || isReloading}
          >
            {isReloading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="refresh-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.reloadButtonText}>Recarregar App Agora (Aplicar Versão)</Text>
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
  /* Abas de Navegação Auth */
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1C28',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A3C',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#00E5FF',
  },
  tabText: {
    color: '#A0A0B0',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#08080A',
    fontWeight: '700',
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
  switchModeLink: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 4,
  },
  switchModeText: {
    color: '#A0A0B0',
    fontSize: 13,
  },
  switchModeHighlight: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2A3C',
  },
  dividerText: {
    color: '#606070',
    fontSize: 12,
    fontWeight: '600',
  },
  guestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00E5FF40',
    backgroundColor: '#00E5FF0D',
    gap: 8,
  },
  guestButtonText: {
    color: '#00E5FF',
    fontSize: 14,
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
    height: 48,
    gap: 8,
  },
  updateButtonText: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 14,
  },
  reloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242436',
    borderRadius: 12,
    height: 46,
    marginTop: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#383850',
  },
  reloadButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  updateStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00E5FF12',
    borderWidth: 1,
    borderColor: '#00E5FF30',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  updateStatusText: {
    color: '#00E5FF',
    fontSize: 12,
    flex: 1,
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
