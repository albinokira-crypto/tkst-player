import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { supabase } from '../services/supabaseClient';
import { DownloadManager } from '../services/downloadManager';
import { TKSTBackground } from '../components/TKSTBackground';

export const ProfileScreen = () => {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    }).catch(() => {});

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha o e-mail e a senha.');
      return;
    }
    setIsLoggingIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        let msg = error.message;
        if (msg.includes('Invalid login credentials')) {
          msg = 'E-mail ou senha incorretos.';
        } else if (msg.includes('Email not confirmed')) {
          msg = 'Por favor, confirme seu e-mail antes de entrar.';
        }
        Alert.alert('Erro ao entrar', msg);
      }
    } catch (err: any) {
      Alert.alert('Erro ao entrar', err.message || 'Falha de conexão.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha o e-mail e a senha.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha curta', 'A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    setIsSigningUp(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        Alert.alert('Erro ao cadastrar', error.message);
      } else if (data?.session) {
        Alert.alert('Sucesso', 'Conta criada e autenticada com sucesso!');
      } else {
        Alert.alert('Sucesso', 'Verifique seu e-mail para confirmar a conta.');
      }
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar', err.message || 'Falha de conexão.');
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleCloudBackup = async () => {
    if (!user) {
      Alert.alert('Atenção', 'Faça login antes de sincronizar seu backup.');
      return;
    }
    setIsSyncing(true);
    try {
      const tracks = await DownloadManager.getDownloadedTracks();
      const payload = {
        user_id: user.id,
        synced_at: new Date().toISOString(),
        tracks_metadata: tracks.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          artworkUrl: t.artworkUrl,
          audioUrl: t.audioUrl,
        })),
      };

      const { error } = await supabase
        .from('user_backups')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;
      Alert.alert('Backup Concluído', `${tracks.length} faixas sincronizadas no seu cofre na nuvem.`);
    } catch (err: any) {
      Alert.alert('Erro no Backup', err.message || 'Falha ao sincronizar.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckUpdates = async () => {
    if (__DEV__ || !Updates.isEnabled) {
      Alert.alert(
        'Modo Local / Expo Go',
        'As atualizações automáticas via nuvem (OTA) funcionam no aplicativo instalado (.apk / build preview). No modo de desenvolvimento, suas alterações já são atualizadas instantaneamente via Fast Refresh.'
      );
      return;
    }
    setIsCheckingUpdates(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert('Atualização Disponível', 'Baixando as novidades do TKST Player...');
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Atualização Concluída',
          'Nova versão pronta! Deseja reiniciar agora para carregar as alterações?',
          [
            { text: 'Mais tarde', style: 'cancel' },
            { text: 'Reiniciar Agora', onPress: () => Updates.reloadAsync() },
          ]
        );
      } else {
        Alert.alert('Tudo Atualizado', 'Você já está rodando a versão mais recente do TKST Player.');
      }
    } catch {
      Alert.alert('Aviso', 'Não foi possível verificar atualizações no momento.');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  return (
    <TKSTBackground variant="tiger" opacity={0.09}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 180 }}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.heading}>Perfil & Backup</Text>

      {user ? (
        <View style={styles.card}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.email?.[0]?.toUpperCase() || 'U'}</Text>
            </View>
            <View style={{ marginLeft: 14 }}>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userBadge}>Assinante TKST Cloud</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.backupButton}
            onPress={handleCloudBackup}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator color="#08080A" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#08080A" />
                <Text style={styles.backupButtonText}>Sincronizar Backup na Nuvem</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Encerrar Sessão</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.loginTitle}>Acesse sua conta</Text>
          <TextInput
            placeholder="Seu E-mail"
            placeholderTextColor="#707078"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
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
              <ActivityIndicator color="#8E8E93" />
            ) : (
              <Text style={styles.signupButtonText}>Criar Nova Conta</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.card, { marginTop: 18 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Ionicons name="cloud-download-outline" size={20} color="#00E5FF" />
          <Text style={[styles.loginTitle, { marginBottom: 0, marginLeft: 8 }]}>Atualizações Automáticas (OTA)</Text>
        </View>
        <Text style={styles.updateInfoText}>
          O TKST Player recebe melhorias e correções silenciosamente pela nuvem sem necessidade de reinstalar o APK.
        </Text>
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
              <Text style={styles.updateButtonText}>Verificar Atualizações</Text>
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
    paddingTop: 54,
    paddingHorizontal: 16,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#161620',
    borderRadius: 16,
    padding: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#08080A',
    fontSize: 22,
    fontWeight: '800',
  },
  userEmail: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  userBadge: {
    color: '#00E5FF',
    fontSize: 12,
    marginTop: 2,
  },
  backupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  backupButtonText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 15,
  },
  logoutButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 10,
  },
  logoutText: {
    color: '#FF453A',
    fontSize: 14,
  },
  loginTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#20202C',
    borderRadius: 10,
    color: '#FFFFFF',
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  loginButton: {
    backgroundColor: '#00E5FF',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  loginButtonText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 15,
  },
  signupButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 6,
  },
  signupButtonText: {
    color: '#8E8E93',
    fontSize: 14,
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
    borderRadius: 10,
    height: 44,
    gap: 8,
  },
  updateButtonText: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 14,
  },
});
