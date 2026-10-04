import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecommendationEngine } from '../services/recommendationEngine';
import { MusicApi } from '../services/musicApi';
import { audioService } from '../services/audioService';
import { TKSTBackground } from '../components/TKSTBackground';
import { Track } from '../types';

export const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 36) : 0,
    36
  );
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [recommendedTracks, setRecommendedTracks] = useState<Track[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const [recent, recommended, trending] = await Promise.all([
      RecommendationEngine.getRecentlyPlayed(),
      RecommendationEngine.getPersonalizedRecommendations(),
      MusicApi.getTrendingTracks(),
    ]);
    setRecentTracks(recent.slice(0, 6));
    setRecommendedTracks(recommended);
    setTrendingTracks(trending);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Bom dia';
    if (hours < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const handlePlayTrack = useCallback((list: Track[], index: number) => {
    const track = list[index];
    if (track) {
      RecommendationEngine.recordPlay(track);
    }
    audioService.setQueue(list, index);
  }, []);

  return (
    <TKSTBackground variant="clean" opacity={0.24}>
      <ScrollView
        style={[styles.container, { paddingTop: topInset + 14 }]}
        contentContainerStyle={{ paddingBottom: 180 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E5FF" />}
      >
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image
            source={require('../../assets/tkst/logo-header-tkst.png')}
            style={{ width: 46, height: 46 }}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.subtitle}>TKST Music Portal</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.radarButton}>
          <Ionicons name="sparkles" size={20} color="#00E5FF" />
        </TouchableOpacity>
      </View>

      {recentTracks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Continuar Ouvindo</Text>
          <View style={styles.recentGrid}>
            {recentTracks.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={styles.recentCard}
                onPress={() => handlePlayTrack(recentTracks, index)}
              >
                <Image source={{ uri: item.artworkUrl }} style={styles.recentArtwork} />
                <Text style={styles.recentText} numberOfLines={1}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recomendado para Você</Text>
          <Text style={styles.badgeText}>IA Tuning</Text>
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={recommendedTracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.cardItem}
              onPress={() => handlePlayTrack(recommendedTracks, index)}
            >
              <Image source={{ uri: item.artworkUrl }} style={styles.cardArtwork} />
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardArtist} numberOfLines={1}>{item.artist}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Tendências Globais</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={trendingTracks}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.cardItem}
              onPress={() => handlePlayTrack(trendingTracks, index)}
            >
              <Image source={{ uri: item.artworkUrl }} style={styles.cardArtwork} />
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardArtist} numberOfLines={1}>{item.artist}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </ScrollView>
    </TKSTBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#707078',
    fontSize: 14,
    marginTop: 2,
  },
  radarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161622',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 24,
    paddingLeft: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  badgeText: {
    color: '#00E5FF',
    backgroundColor: '#00E5FF15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingRight: 16,
    gap: 8,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161620',
    width: '48.5%',
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
  },
  recentArtwork: {
    width: 52,
    height: 52,
  },
  recentText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
    paddingRight: 4,
  },
  cardItem: {
    width: 140,
    marginRight: 14,
  },
  cardArtwork: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#161620',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  cardArtist: {
    color: '#707078',
    fontSize: 12,
    marginTop: 2,
  },
});
