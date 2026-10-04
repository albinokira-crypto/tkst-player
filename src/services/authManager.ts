import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  role: string;
}

// Chaves seguras sem caracteres especiais proibidos pelo Android SecureStore (como '@')
const USERS_KEY_V2 = 'tkst_users_db_v2';
const SESSION_KEY_V2 = 'tkst_active_session_v2';

const LEGACY_USERS_KEY = '@tkst_users_db_v1';
const LEGACY_SESSION_KEY = '@tkst_active_session_v1';

type AuthListener = (user: UserProfile | null) => void;
const listeners: Set<AuthListener> = new Set();

const notifyListeners = (user: UserProfile | null) => {
  listeners.forEach((listener) => {
    try {
      listener(user);
    } catch (e) {
      console.warn('Erro ao notificar listener auth:', e);
    }
  });
};

// Utilitários seguros para armazenamento protegido
async function safeSecureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    console.warn(`[AuthManager] SecureStore.getItemAsync(${key}) falhou, usando AsyncStorage:`, e);
    return null;
  }
}

async function safeSecureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    console.warn(`[AuthManager] SecureStore.setItemAsync(${key}) falhou, persistindo apenas no AsyncStorage:`, e);
  }
}

async function safeSecureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    console.warn(`[AuthManager] SecureStore.deleteItemAsync(${key}) falhou:`, e);
  }
}

export const AuthManager = {
  onAuthStateChange(callback: AuthListener) {
    listeners.add(callback);
    this.getCurrentUser().then(callback).catch(() => callback(null));
    return {
      unsubscribe: () => {
        listeners.delete(callback);
      },
    };
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      // 1. Tenta SecureStore V2
      let sessionStr = await safeSecureGet(SESSION_KEY_V2);

      // 2. Tenta AsyncStorage V2
      if (!sessionStr) {
        sessionStr = await AsyncStorage.getItem(SESSION_KEY_V2);
      }

      // 3. Fallback para chaves antigas se houver
      if (!sessionStr) {
        sessionStr = await AsyncStorage.getItem(LEGACY_SESSION_KEY);
      }

      if (!sessionStr) return null;
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  },

  async signUp(email: string, password: string, name?: string): Promise<{ user: UserProfile | null; error?: string }> {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length < 5) {
      return { user: null, error: 'Por favor, informe um e-mail válido (ex: seuemail@exemplo.com).' };
    }
    if (!password || password.trim().length < 6) {
      return { user: null, error: 'A senha precisa ter no mínimo 6 caracteres.' };
    }

    try {
      // Carrega banco de usuários salvos
      let usersStr = await AsyncStorage.getItem(USERS_KEY_V2);
      if (!usersStr) {
        usersStr = await AsyncStorage.getItem(LEGACY_USERS_KEY);
      }
      const users: Record<string, { profile: UserProfile; passwordHash: string }> = usersStr ? JSON.parse(usersStr) : {};

      const rawName = name?.trim();
      const displayName = rawName && rawName.length > 0 ? rawName : cleanEmail.split('@')[0];
      const formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

      // Se a conta já existe, atualiza as credenciais e entra diretamente (sem travar o usuário)
      let targetUser: UserProfile;
      if (users[cleanEmail]) {
        targetUser = {
          ...users[cleanEmail].profile,
          name: formattedName || users[cleanEmail].profile.name,
        };
      } else {
        targetUser = {
          id: `tkst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: formattedName,
          email: cleanEmail,
          createdAt: new Date().toISOString(),
          role: 'Membro Oficial TKST',
        };
      }

      // Salva usuário no banco local
      users[cleanEmail] = {
        profile: targetUser,
        passwordHash: password,
      };
      await AsyncStorage.setItem(USERS_KEY_V2, JSON.stringify(users));

      // Salva sessão ativa
      const sessionJson = JSON.stringify(targetUser);
      await safeSecureSet(SESSION_KEY_V2, sessionJson);
      await AsyncStorage.setItem(SESSION_KEY_V2, sessionJson);

      notifyListeners(targetUser);
      return { user: targetUser };
    } catch (e: any) {
      console.error('[AuthManager] Erro no cadastro:', e);
      return { user: null, error: e?.message || 'Falha ao salvar dados de usuário.' };
    }
  },

  async signIn(email: string, password: string): Promise<{ user: UserProfile | null; error?: string }> {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { user: null, error: 'Por favor, informe um e-mail válido.' };
    }
    if (!password || password.trim().length < 6) {
      return { user: null, error: 'A senha precisa ter no mínimo 6 caracteres.' };
    }

    try {
      let usersStr = await AsyncStorage.getItem(USERS_KEY_V2);
      if (!usersStr) {
        usersStr = await AsyncStorage.getItem(LEGACY_USERS_KEY);
      }
      const users: Record<string, { profile: UserProfile; passwordHash: string }> = usersStr ? JSON.parse(usersStr) : {};

      const userRecord = users[cleanEmail];
      // Se não encontrou a conta, cria automaticamente para o usuário não ficar preso!
      if (!userRecord) {
        return await this.signUp(cleanEmail, password);
      }

      if (userRecord.passwordHash !== password) {
        return { user: null, error: 'Senha incorreta para este e-mail. Se esqueceu, use a aba "Criar Conta" para redefinir.' };
      }

      // Salva sessão ativa
      const sessionJson = JSON.stringify(userRecord.profile);
      await safeSecureSet(SESSION_KEY_V2, sessionJson);
      await AsyncStorage.setItem(SESSION_KEY_V2, sessionJson);

      notifyListeners(userRecord.profile);
      return { user: userRecord.profile };
    } catch (e: any) {
      return { user: null, error: e?.message || 'Falha ao autenticar.' };
    }
  },

  async signInAsGuest(): Promise<UserProfile> {
    const guestUser: UserProfile = {
      id: `guest_${Date.now()}`,
      name: 'Guerreiro TKST',
      email: 'convidado@tkst.app',
      createdAt: new Date().toISOString(),
      role: 'Visitante TKST',
    };

    const sessionJson = JSON.stringify(guestUser);
    await safeSecureSet(SESSION_KEY_V2, sessionJson);
    await AsyncStorage.setItem(SESSION_KEY_V2, sessionJson);

    notifyListeners(guestUser);
    return guestUser;
  },

  async signOut(): Promise<void> {
    try {
      await safeSecureDelete(SESSION_KEY_V2);
      await AsyncStorage.removeItem(SESSION_KEY_V2);
      await AsyncStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {}
    notifyListeners(null);
  },
};
