import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';

import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { PlaylistsScreen } from './src/screens/PlaylistsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { MiniPlayer } from './src/components/MiniPlayer';
import { MainPlayerModal } from './src/components/MainPlayerModal';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('TKST Player ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Erro ao inicializar</Text>
          <Text style={errorStyles.message}>
            {this.state.error?.message || 'Ocorreu um problema ao renderizar a tela.'}
          </Text>
          <TouchableOpacity
            style={errorStyles.retryButton}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={errorStyles.retryText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0E',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    color: '#00E5FF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  message: {
    color: '#A0A0B0',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#00E5FF',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
  },
  retryText: {
    color: '#0A0A0E',
    fontSize: 14,
    fontWeight: '700',
  },
});

const Tab = createBottomTabNavigator();

function MainApp() {
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function checkAutoUpdates() {
      try {
        if (!__DEV__) {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            // Atualização baixada silenciosamente no cache local.
            // Será aplicada suavemente na próxima inicialização ou via tela de Perfil,
            // evitando cortes de tela e recarregamento forçado durante o uso.
          }
        }
      } catch (err) {
        // Falha de rede ou offline - segue normalmente
      }
    }
    checkAutoUpdates();
  }, []);

  // Em dispositivos Android com barra de 3 botões (Home, Voltar, Recentes) ou gestos,
  // insets.bottom fornece a altura exata da barra do sistema operacional.
  // Garantimos no mínimo 20dp de respiro para que nenhum botão fique sobreposto.
  const bottomInset = Math.max(insets.bottom, 20);
  const tabBarHeight = 58 + bottomInset;

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0E" />
      <View style={styles.root}>
        <Tab.Navigator
          backBehavior="history"
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#101016',
              borderTopColor: '#202028',
              borderTopWidth: 1,
              height: tabBarHeight,
              paddingBottom: bottomInset,
              paddingTop: 8,
              elevation: 12,
            },
            tabBarActiveTintColor: '#00E5FF',
            tabBarInactiveTintColor: '#707078',
            tabBarLabelStyle: styles.tabLabel,
            tabBarIcon: ({ color, focused }) => {
              let iconName: any = 'home';
              if (route.name === 'Início') iconName = focused ? 'home' : 'home-outline';
              else if (route.name === 'Busca') iconName = focused ? 'search' : 'search-outline';
              else if (route.name === 'Playlists') iconName = focused ? 'library' : 'library-outline';
              else if (route.name === 'Perfil') iconName = focused ? 'person' : 'person-outline';

              return <Ionicons name={iconName} size={22} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Início" component={HomeScreen} />
          <Tab.Screen name="Busca" component={SearchScreen} />
          <Tab.Screen name="Playlists" component={PlaylistsScreen} />
          <Tab.Screen name="Perfil" component={ProfileScreen} />
        </Tab.Navigator>

        <MiniPlayer
          onPress={() => setIsPlayerModalOpen(true)}
          bottomOffset={tabBarHeight + 8}
        />

        <MainPlayerModal
          visible={isPlayerModalOpen}
          onClose={() => setIsPlayerModalOpen(false)}
        />
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <MainApp />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0E',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
