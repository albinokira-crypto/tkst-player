import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchService } from '../services/searchService';
import { audioService } from '../services/audioService';
import { StreamResolver } from '../services/streamResolver';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { TKSTBackground } from '../components/TKSTBackground';
import { Track, PlaybackState } from '../types';

const CATEGORIES = [
  { id: '1', label: '🔥 Em Alta', query: 'Top Hits 2026' },
  { id: '2', label: '🎸 Rock', query: 'Rock Classics' },
  { id: '3', label: '🇧🇷 Sertanejo', query: 'Sertanejo' },
  { id: '4', label: '🎤 Pop', query: 'Pop Hits' },
  { id: '5', label: '🎧 Eletrônica', query: 'Eletrônica EDM' },
  { id: '6', label: '⚡ Metal', query: 'Heavy Metal' },
  { id: '7', label: '🎷 MPB', query: 'MPB Classicos' },
  { id: '8', label: '📻 Hip-Hop', query: 'Hip Hop Rap' },
];

/**
 * Componente Skeleton Animado para simular carregamento suave
 */
const SkeletonTrackRow = () => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.skeletonRow}>
      <Animated.View style={[styles.skeletonArtwork, { opacity: pulseAnim }]} />
      <View style={styles.skeletonInfo}>
        <Animated.View style={[styles.skeletonBar, { width: '70%', height: 16, opacity: pulseAnim }]} />
        <Animated.View style={[styles.skeletonBar, { width: '45%', height: 12, marginTop: 8, opacity: pulseAnim }]} />
      </View>
      <Animated.View style={[styles.skeletonCircle, { opacity: pulseAnim }]} />
    </View>
  );
};

interface TrackRowProps {
  track: Track;
  isPlaying: boolean;
  onPlay: () => void;
  onAddToPlaylist: () => void;
}

const TrackRowItem: React.FC<TrackRowProps> = React.memo(
  ({ track, isPlaying, onPlay, onAddToPlaylist }) => {
    return (
      <TouchableOpacity
        style={[styles.trackRow, isPlaying && styles.trackRowActive]}
        onPress={onPlay}
        activeOpacity={0.7}
      >
        <Image
          source={{
            uri:
              track.artworkUrl ||
              'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
          }}
          style={styles.rowArtwork}
        />

        <View style={styles.rowInfo}>
          <Text
            style={[styles.rowTitle, isPlaying && styles.rowTitleActive]}
            numberOfLines={1}
          >
            {track.title}
          </Text>
          <Text style={styles.rowArtist} numberOfLines={1}>
            {track.artist} {track.album ? `• ${track.album}` : ''}
          </Text>
          <View style={styles.rowMeta}>
            <Text style={styles.rowDuration}>
              {StreamResolver.formatDuration(track.durationSeconds)}
            </Text>
            {track.id.startsWith('ytm_') && (
              <Text style={[styles.providerBadge, { color: '#FF2A2A', borderColor: '#FF2A2A' }]}>YouTube Music</Text>
            )}
            {track.id.startsWith('yt_') && (
              <Text style={[styles.providerBadge, { color: '#FF3B30', borderColor: '#FF3B30' }]}>YouTube</Text>
            )}
            {track.id.startsWith('sc_') && (
              <Text style={[styles.providerBadge, { color: '#FF9500', borderColor: '#FF9500' }]}>SoundCloud</Text>
            )}
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onAddToPlaylist}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="bookmark-outline" size={20} color="#707078" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.playBtn} onPress={onPlay}>
            <Ionicons
              name={isPlaying ? 'pause-circle' : 'play-circle'}
              size={32}
              color={isPlaying ? '#00E5FF' : '#00E5FF'}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }
);

export const SearchScreen = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Modal para adicionar a playlist
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState<Track | null>(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);

  // Estado de reprodução em tempo real
  const [playback, setPlayback] = useState<PlaybackState>(audioService.getState());

  useEffect(() => {
    return audioService.subscribe((state) => {
      setPlayback(state);
    });
  }, []);

  // Timer para debounce na digitação
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = async (searchTerm: string, pageNumber = 0, isPagination = false) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (isPagination) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setHasSearched(true);
      setPage(0);
    }

    try {
      const res = await SearchService.searchTracks(trimmed, pageNumber, 25);
      if (isPagination) {
        setResults((prev) => {
          // Evita duplicatas ao paginar
          const existingIds = new Set(prev.map((t) => t.id));
          const newUnique = res.tracks.filter((t) => !existingIds.has(t.id));
          return [...prev, ...newUnique];
        });
      } else {
        setResults(res.tracks);
      }
      setHasMore(res.hasMore);
      setPage(pageNumber);
    } catch (err) {
      console.warn('Erro ao executar busca profunda:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleTextChange = (text: string) => {
    setQuery(text);
    setActiveCategory(null);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (text.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    if (text.trim().length >= 2) {
      setLoading(true);
      debounceTimeout.current = setTimeout(() => {
        performSearch(text, 0, false);
      }, 350);
    }
  };

  const handleSelectCategory = (cat: { id: string; label: string; query: string }) => {
    Keyboard.dismiss();
    setActiveCategory(cat.id);
    setQuery(cat.query);
    performSearch(cat.query, 0, false);
  };

  const handleClear = () => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setActiveCategory(null);
    setLoading(false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore && query.trim().length >= 2) {
      performSearch(query, page + 1, true);
    }
  };

  const handlePlayTrack = useCallback(
    (track: Track, index: number) => {
      // Se a faixa tocada já é a atual, alterna pause/play
      if (playback.currentTrack?.id === track.id) {
        audioService.togglePlayPause();
      } else {
        audioService.setQueue(results, index);
      }
    },
    [results, playback.currentTrack]
  );

  const openPlaylistModal = useCallback((track: Track) => {
    setSelectedTrackForPlaylist(track);
    setIsPlaylistModalOpen(true);
  }, []);

  const renderTrackItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => {
      const isPlaying = playback.currentTrack?.id === item.id && playback.isPlaying;
      return (
        <TrackRowItem
          track={item}
          isPlaying={isPlaying}
          onPlay={() => handlePlayTrack(item, index)}
          onAddToPlaylist={() => openPlaylistModal(item)}
        />
      );
    },
    [playback.currentTrack, playback.isPlaying, handlePlayTrack, openPlaylistModal]
  );

  return (
    <TKSTBackground variant="kanji" opacity={0.25}>
      <View style={styles.container}>
        {/* Barra de Pesquisa */}
        <View style={styles.header}>
          <Text style={styles.title}>Busca Global TKST</Text>
          <Text style={styles.subtitle}>YouTube Music • SoundCloud • Músicas Completas</Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#00E5FF" />
          <TextInput
            placeholder="YouTube Music, SoundCloud, artista ou música..."
            placeholderTextColor="#707078"
            style={styles.input}
            value={query}
            onChangeText={handleTextChange}
            returnKeyType="search"
            onSubmitEditing={() => performSearch(query, 0, false)}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={19} color="#707078" />
            </TouchableOpacity>
          )}
        </View>

        {/* Chips de Categorias / Gêneros Rápidos */}
        <View style={styles.categoriesContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORIES}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.categoriesList}
            renderItem={({ item }) => {
              const selected = activeCategory === item.id;
              return (
                <TouchableOpacity
                  style={[styles.categoryChip, selected && styles.categoryChipActive]}
                  onPress={() => handleSelectCategory(item)}
                >
                  <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Conteúdo Principal */}
        {loading && results.length === 0 ? (
          // Skeleton Loading
          <View style={styles.skeletonContainer}>
            <SkeletonTrackRow />
            <SkeletonTrackRow />
            <SkeletonTrackRow />
            <SkeletonTrackRow />
            <SkeletonTrackRow />
            <SkeletonTrackRow />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderTrackItem}
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#00E5FF" />
                  <Text style={styles.footerText}>Buscando mais faixas no catálogo...</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              hasSearched ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={54} color="#303040" />
                  <Text style={styles.emptyTitle}>Nenhuma música encontrada</Text>
                  <Text style={styles.emptySubtitle}>
                    Não encontramos resultados para "{query}". Tente buscar apenas o nome do artista
                    ou da faixa.
                  </Text>
                </View>
              ) : (
                <View style={styles.idleContainer}>
                  <View style={styles.idleIconBox}>
                    <Ionicons name="globe-outline" size={42} color="#00E5FF" />
                  </View>
                  <Text style={styles.idleTitle}>Catálogo Global Conectado</Text>
                  <Text style={styles.idleSubtitle}>
                    Pesquise por milhões de músicas comerciais, bandas clássicas, pop mundial, rock,
                    MPB e sertanejo com streaming instantâneo.
                  </Text>
                </View>
              )
            }
          />
        )}

        {/* Modal de Adicionar a Playlist */}
        <AddToPlaylistModal
          visible={isPlaylistModalOpen}
          track={selectedTrackForPlaylist}
          onClose={() => {
            setIsPlaylistModalOpen(false);
            setSelectedTrackForPlaylist(null);
          }}
        />
      </View>
    </TKSTBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 52,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E98',
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161622',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#242436',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    marginLeft: 10,
  },
  categoriesContainer: {
    marginBottom: 10,
  },
  categoriesList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#161622',
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222232',
  },
  categoryChipActive: {
    backgroundColor: '#00E5FF20',
    borderColor: '#00E5FF',
  },
  categoryText: {
    color: '#8E8E98',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 200,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#12121A80',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1C1C2A',
  },
  trackRowActive: {
    backgroundColor: '#00E5FF12',
    borderColor: '#00E5FF50',
  },
  rowArtwork: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#1C1C28',
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowTitleActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  rowArtist: {
    color: '#8E8E98',
    fontSize: 13,
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  rowDuration: {
    color: '#606070',
    fontSize: 11,
  },
  providerBadge: {
    backgroundColor: '#202030',
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 6,
  },
  playBtn: {
    padding: 4,
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#14141E',
    borderRadius: 12,
    marginBottom: 8,
  },
  skeletonArtwork: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#282838',
  },
  skeletonInfo: {
    flex: 1,
    marginLeft: 12,
  },
  skeletonBar: {
    backgroundColor: '#282838',
    borderRadius: 4,
  },
  skeletonCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#282838',
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  footerText: {
    color: '#707078',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    color: '#707078',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  idleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 28,
  },
  idleIconBox: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#00E5FF15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00E5FF30',
  },
  idleTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  idleSubtitle: {
    color: '#8E8E98',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
