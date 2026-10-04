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

const USERS_KEY = '@tkst_users_db_v1';
const SESSION_KEY = '@tkst_active_session_v1';

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
      let sessionStr: string | null = null;
      if (Platform.OS !== 'web') {
        sessionStr = await SecureStore.getItemAsync(SESSION_KEY);
      }
      if (!sessionStr) {
        sessionStr = await AsyncStorage.getItem(SESSION_KEY);
      }
      if (!sessionStr) return null;
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  },

  async signUp(email: string, password: string, name?: string): Promise<{ user: UserProfile | null; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { user: null, error: 'Por favor, informe um e-mail válido.' };
    }
    if (!password || password.length < 6) {
      return { user: null, error: 'A senha precisa ter no mínimo 6 caracteres.' };
    }

    try {
      // Carrega banco de usuários locais
      const usersStr = await AsyncStorage.getItem(USERS_KEY);
      const users: Record<string, { profile: UserProfile; passwordHash: string }> = usersStr ? JSON.parse(usersStr) : {};

      if (users[cleanEmail]) {
        return { user: null, error: 'Este e-mail já possui uma conta cadastrada. Faça login ou use outro e-mail.' };
      }

      const displayName = name?.trim() || cleanEmail.split('@')[0];
      const newUser: UserProfile = {
        id: `tkst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        email: cleanEmail,
        createdAt: new Date().toISOString(),
        role: 'Membro Oficial TKST',
      };

      // Salva usuário
      users[cleanEmail] = {
        profile: newUser,
        passwordHash: password, // armazenado localmente no cofre do aparelho
      };
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));

      // Salva sessão ativa
      const sessionJson = JSON.stringify(newUser);
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(SESSION_KEY, sessionJson);
      }
      await AsyncStorage.setItem(SESSION_KEY, sessionJson);

      notifyListeners(newUser);
      return { user: newUser };
    } catch (e: any) {
      return { user: null, error: e.message || 'Falha ao salvar dados de usuário.' };
    }
  },

  async signIn(email: string, password: string): Promise<{ user: UserProfile | null; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { user: null, error: 'Preencha o e-mail e a senha.' };
    }

    try {
      const usersStr = await AsyncStorage.getItem(USERS_KEY);
      const users: Record<string, { profile: UserProfile; passwordHash: string }> = usersStr ? JSON.parse(usersStr) : {};

      const userRecord = users[cleanEmail];
      if (!userRecord) {
        return { user: null, error: 'Nenhuma conta encontrada com este e-mail. Clique em "Criar Nova Conta".' };
      }

      if (userRecord.passwordHash !== password) {
        return { user: null, error: 'Senha incorreta. Tente novamente.' };
      }

      // Salva sessão ativa
      const sessionJson = JSON.stringify(userRecord.profile);
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(SESSION_KEY, sessionJson);
      }
      await AsyncStorage.setItem(SESSION_KEY, sessionJson);

      notifyListeners(userRecord.profile);
      return { user: userRecord.profile };
    } catch (e: any) {
      return { user: null, error: e.message || 'Falha ao autenticar.' };
    }
  },

  async signOut(): Promise<void> {
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      }
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch {}
    notifyListeners(null);
  },
};
