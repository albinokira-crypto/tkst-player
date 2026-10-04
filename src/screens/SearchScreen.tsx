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
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchService } from '../services/searchService';
import { audioService } from '../services/audioService';
import { StreamResolver } from '../services/streamResolver';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { TKSTBackground } from '../components/TKSTBackground';
import { Track, Album, Artist, PlaybackState } from '../types';
import { AlbumDetailsScreen } from './AlbumDetailsScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ALBUM_CARD_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2;

type SearchTab = 'tracks' | 'albums' | 'artists';

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
 * Skeleton para Linha de Faixas
 */
const SkeletonTrackRow = () => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 650, useNativeDriver: true }),
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

/**
 * Skeleton para Cards de Álbuns
 */
const SkeletonAlbumGrid = () => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 650, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.albumGridContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.albumCard, { width: ALBUM_CARD_WIDTH }]}>
          <Animated.View style={[styles.skeletonAlbumCover, { opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonBar, { width: '85%', height: 14, marginTop: 10, opacity: pulseAnim }]} />
          <Animated.View style={[styles.skeletonBar, { width: '55%', height: 11, marginTop: 6, opacity: pulseAnim }]} />
        </View>
      ))}
    </View>
  );
};

/**
 * Item individual de Faixa
 */
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
            {track.id.startsWith('dz_') && (
              <Text style={[styles.providerBadge, { color: '#00E5FF', borderColor: '#00E5FF' }]}>Deezer Oficial</Text>
            )}
            {track.id.startsWith('it_') && (
              <Text style={[styles.providerBadge, { color: '#FA2D48', borderColor: '#FA2D48' }]}>iTunes Oficial</Text>
            )}
            {track.id.startsWith('ytm_') && (
              <Text style={[styles.providerBadge, { color: '#FF2A2A', borderColor: '#FF2A2A' }]}>YouTube Music</Text>
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
              color="#00E5FF"
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }
);

/**
 * Card de Álbum Oficial
 */
interface AlbumCardItemProps {
  album: Album;
  onPress: () => void;
}

const AlbumCardItem: React.FC<AlbumCardItemProps> = React.memo(({ album, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.albumCard, { width: ALBUM_CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.albumCoverContainer}>
        <Image
          source={{
            uri:
              album.artworkUrl ||
              'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
          }}
          style={styles.albumCoverImage}
          resizeMode="cover"
        />
        <View style={styles.albumBadge}>
          <Text style={styles.albumBadgeText}>OFICIAL</Text>
        </View>
      </View>
      <Text style={styles.albumCardTitle} numberOfLines={1}>
        {album.title}
      </Text>
      <Text style={styles.albumCardArtist} numberOfLines={1}>
        {album.artist}
      </Text>
      <View style={styles.albumCardMeta}>
        <Text style={styles.albumCardYear}>{album.releaseYear || 'Álbum'}</Text>
        {album.totalTracks > 0 && (
          <Text style={styles.albumCardTracks}>• {album.totalTracks} faixas</Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

/**
 * Linha de Artista Oficial
 */
interface ArtistRowProps {
  artist: Artist;
  onPress: () => void;
}

const ArtistRowItem: React.FC<ArtistRowProps> = React.memo(({ artist, onPress }) => {
  return (
    <TouchableOpacity style={styles.artistRow} onPress={onPress} activeOpacity={0.75}>
      <Image
        source={{
          uri:
            artist.pictureUrl ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
        }}
        style={styles.artistAvatar}
      />
      <View style={styles.artistInfo}>
        <Text style={styles.artistName} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text style={styles.artistMeta} numberOfLines={1}>
          Discografia Oficial {artist.albumsCount ? `• ${artist.albumsCount} Álbuns` : ''}
        </Text>
      </View>
      <View style={styles.artistArrow}>
        <Text style={styles.artistActionLabel}>Ver Álbuns</Text>
        <Ionicons name="chevron-forward" size={18} color="#00E5FF" />
      </View>
    </TouchableOpacity>
  );
});

export const SearchScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 36) : 0,
    36
  );

  // Estados principais de busca
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('tracks');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Resultados por categoria
  const [trackResults, setTrackResults] = useState<Track[]>([]);
  const [albumResults, setAlbumResults] = useState<Album[]>([]);
  const [artistResults, setArtistResults] = useState<Artist[]>([]);

  // Estados de carregamento
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Discografia filtrada por artista selecionado
  const [artistFilterName, setArtistFilterName] = useState<string | null>(null);

  // Álbum selecionado para visualização em tela cheia
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

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

  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Executa busca nas fontes oficiais de acordo com a aba ativa e termo
  const executeSearch = async (searchTerm: string, targetTab: SearchTab, pageNum = 0, isPagination = false) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setTrackResults([]);
      setAlbumResults([]);
      setArtistResults([]);
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
      if (targetTab === 'tracks') {
        const res = await SearchService.searchTracks(trimmed, pageNum, 25);
        if (isPagination) {
          setTrackResults((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            const newUnique = res.tracks.filter((t) => !existingIds.has(t.id));
            return [...prev, ...newUnique];
          });
        } else {
          setTrackResults(res.tracks);
        }
        setHasMore(res.hasMore);
        setPage(pageNum);
      } else if (targetTab === 'albums') {
        const albums = await SearchService.searchAlbums(trimmed, 30);
        setAlbumResults(albums);
        setHasMore(false);
      } else if (targetTab === 'artists') {
        const artists = await SearchService.searchArtists(trimmed, 25);
        setArtistResults(artists);
        setHasMore(false);
      }
    } catch (err) {
      console.warn('Erro ao executar busca na aba', targetTab, err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleTextChange = (text: string) => {
    setQuery(text);
    setActiveCategory(null);
    setArtistFilterName(null);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (text.trim().length === 0) {
      setTrackResults([]);
      setAlbumResults([]);
      setArtistResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    if (text.trim().length >= 2) {
      setLoading(true);
      debounceTimeout.current = setTimeout(() => {
        executeSearch(text, activeTab, 0, false);
      }, 350);
    }
  };

  const handleTabChange = (newTab: SearchTab) => {
    if (activeTab === newTab) return;
    setActiveTab(newTab);

    // Se já há uma pesquisa digitada, carrega a busca para a nova aba selecionada
    if (query.trim().length >= 2) {
      if (newTab === 'tracks' && trackResults.length === 0) {
        executeSearch(query, 'tracks', 0, false);
      } else if (newTab === 'albums' && albumResults.length === 0) {
        executeSearch(query, 'albums', 0, false);
      } else if (newTab === 'artists' && artistResults.length === 0) {
        executeSearch(query, 'artists', 0, false);
      }
    }
  };

  const handleSelectCategory = (cat: { id: string; label: string; query: string }) => {
    Keyboard.dismiss();
    setActiveCategory(cat.id);
    setQuery(cat.query);
    setArtistFilterName(null);
    executeSearch(cat.query, activeTab, 0, false);
  };

  const handleClear = () => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    setQuery('');
    setTrackResults([]);
    setAlbumResults([]);
    setArtistResults([]);
    setHasSearched(false);
    setActiveCategory(null);
    setArtistFilterName(null);
    setLoading(false);
  };

  // Ao clicar em um artista, carrega sua discografia oficial e muda para a aba de Álbuns
  const handleSelectArtist = async (artist: Artist) => {
    setLoading(true);
    setActiveTab('albums');
    setArtistFilterName(artist.name);

    try {
      const discography = await SearchService.getArtistAlbums(
        artist.id,
        artist.name,
        artist.source === 'deezer' || artist.source === 'itunes' ? artist.source : undefined
      );
      setAlbumResults(discography);
      setHasSearched(true);
    } catch (e) {
      console.warn('Erro ao carregar discografia do artista:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = useCallback(
    (track: Track, index: number) => {
      if (playback.currentTrack?.id === track.id) {
        audioService.togglePlayPause();
      } else {
        audioService.setQueue(trackResults, index);
      }
    },
    [trackResults, playback.currentTrack]
  );

  const openPlaylistModal = useCallback((track: Track) => {
    setSelectedTrackForPlaylist(track);
    setIsPlaylistModalOpen(true);
  }, []);

  // Se um álbum estiver selecionado, exibe a tela de detalhes do álbum
  if (selectedAlbum) {
    return (
      <AlbumDetailsScreen
        album={selectedAlbum}
        onBack={() => setSelectedAlbum(null)}
        onArtistPress={(artistName, artistId) => {
          setSelectedAlbum(null);
          if (artistId) {
            handleSelectArtist({
              id: artistId,
              name: artistName,
              pictureUrl: '',
              source: artistId.startsWith('deezer') ? 'deezer' : 'itunes',
            });
          } else {
            setQuery(artistName);
            setActiveTab('albums');
            executeSearch(artistName, 'albums', 0, false);
          }
        }}
      />
    );
  }

  return (
    <TKSTBackground variant="kanji" opacity={0.25}>
      <View style={[styles.container, { paddingTop: topInset + 14 }]}>
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.title}>Catálogo Oficial TKST</Text>
          <Text style={styles.subtitle}>Músicas • Álbuns Comerciais • Artistas & Bandas</Text>
        </View>

        {/* Barra de Pesquisa */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#00E5FF" />
          <TextInput
            placeholder="Buscar música, álbum completo ou artista..."
            placeholderTextColor="#707078"
            style={styles.input}
            value={query}
            onChangeText={handleTextChange}
            returnKeyType="search"
            onSubmitEditing={() => executeSearch(query, activeTab, 0, false)}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={19} color="#707078" />
            </TouchableOpacity>
          )}
        </View>

        {/* 3 Abas Principais: Músicas, Álbuns e Artistas */}
        <View style={styles.tabsWrapper}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'tracks' && styles.tabButtonActive]}
            onPress={() => handleTabChange('tracks')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="musical-notes"
              size={15}
              color={activeTab === 'tracks' ? '#00E5FF' : '#707078'}
            />
            <Text style={[styles.tabText, activeTab === 'tracks' && styles.tabTextActive]}>
              Músicas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'albums' && styles.tabButtonActive]}
            onPress={() => handleTabChange('albums')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="disc"
              size={15}
              color={activeTab === 'albums' ? '#00E5FF' : '#707078'}
            />
            <Text style={[styles.tabText, activeTab === 'albums' && styles.tabTextActive]}>
              Álbuns
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'artists' && styles.tabButtonActive]}
            onPress={() => handleTabChange('artists')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people"
              size={15}
              color={activeTab === 'artists' ? '#00E5FF' : '#707078'}
            />
            <Text style={[styles.tabText, activeTab === 'artists' && styles.tabTextActive]}>
              Artistas
            </Text>
          </TouchableOpacity>
        </View>

        {/* Banner de filtro por artista (quando veio de clique em artista) */}
        {artistFilterName && activeTab === 'albums' && (
          <View style={styles.artistFilterBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="disc-outline" size={16} color="#00E5FF" />
              <Text style={styles.artistFilterText} numberOfLines={1}>
                Discografia de: <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{artistFilterName}</Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setArtistFilterName(null);
                executeSearch(query, 'albums', 0, false);
              }}
              style={styles.artistFilterClear}
            >
              <Text style={styles.artistFilterClearText}>Limpar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Chips de Categorias Rápidas */}
        {!artistFilterName && (
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
        )}

        {/* Conteúdo Principal com base na Aba Ativa */}
        {loading && (activeTab === 'tracks' ? trackResults.length === 0 : activeTab === 'albums' ? albumResults.length === 0 : artistResults.length === 0) ? (
          activeTab === 'albums' ? (
            <SkeletonAlbumGrid />
          ) : (
            <View style={styles.skeletonContainer}>
              <SkeletonTrackRow />
              <SkeletonTrackRow />
              <SkeletonTrackRow />
              <SkeletonTrackRow />
              <SkeletonTrackRow />
            </View>
          )
        ) : activeTab === 'tracks' ? (
          /* ABA 1: MÚSICAS */
          <FlatList
            data={trackResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <TrackRowItem
                track={item}
                isPlaying={playback.currentTrack?.id === item.id && playback.isPlaying}
                onPlay={() => handlePlayTrack(item, index)}
                onAddToPlaylist={() => openPlaylistModal(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            onEndReached={() => {
              if (!loadingMore && !loading && hasMore && query.trim().length >= 2) {
                executeSearch(query, 'tracks', page + 1, true);
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#00E5FF" />
                  <Text style={styles.footerText}>Carregando mais faixas oficiais...</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              hasSearched ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-notes-outline" size={54} color="#303040" />
                  <Text style={styles.emptyTitle}>Nenhuma música encontrada</Text>
                  <Text style={styles.emptySubtitle}>
                    Não encontramos resultados para "{query}". Tente buscar por álbum ou artista.
                  </Text>
                </View>
              ) : (
                <View style={styles.idleContainer}>
                  <View style={styles.idleIconBox}>
                    <Ionicons name="musical-notes-outline" size={40} color="#00E5FF" />
                  </View>
                  <Text style={styles.idleTitle}>Músicas Comerciais & Singles</Text>
                  <Text style={styles.idleSubtitle}>
                    Pesquise por milhões de músicas oficiais de estúdio com streaming de alta qualidade.
                  </Text>
                </View>
              )
            }
          />
        ) : activeTab === 'albums' ? (
          /* ABA 2: ÁLBUNS OFICIAIS */
          <FlatList
            data={albumResults}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.albumColumnWrapper}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <AlbumCardItem album={item} onPress={() => setSelectedAlbum(item)} />
            )}
            ListEmptyComponent={
              hasSearched ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="disc-outline" size={54} color="#303040" />
                  <Text style={styles.emptyTitle}>Nenhum álbum encontrado</Text>
                  <Text style={styles.emptySubtitle}>
                    Não encontramos discos para "{query}". Verifique o nome do artista ou disco.
                  </Text>
                </View>
              ) : (
                <View style={styles.idleContainer}>
                  <View style={styles.idleIconBox}>
                    <Ionicons name="disc-outline" size={40} color="#00E5FF" />
                  </View>
                  <Text style={styles.idleTitle}>Discografias e Álbuns Oficiais</Text>
                  <Text style={styles.idleSubtitle}>
                    Encontre álbuns completos, EPs e lançamentos comerciais com capa em alta resolução e ordem de faixas original.
                  </Text>
                </View>
              )
            }
          />
        ) : (
          /* ABA 3: ARTISTAS E BANDAS */
          <FlatList
            data={artistResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <ArtistRowItem artist={item} onPress={() => handleSelectArtist(item)} />
            )}
            ListEmptyComponent={
              hasSearched ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={54} color="#303040" />
                  <Text style={styles.emptyTitle}>Nenhum artista encontrado</Text>
                  <Text style={styles.emptySubtitle}>
                    Não encontramos perfis de artistas para "{query}".
                  </Text>
                </View>
              ) : (
                <View style={styles.idleContainer}>
                  <View style={styles.idleIconBox}>
                    <Ionicons name="people-outline" size={40} color="#00E5FF" />
                  </View>
                  <Text style={styles.idleTitle}>Artistas e Bandas Famosas</Text>
                  <Text style={styles.idleSubtitle}>
                    Descubra a discografia completa de qualquer cantor ou banda com todos os seus lançamentos.
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
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#8E8E98',
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161622',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#242436',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 10,
  },
  tabsWrapper: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#12121A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E1E2C',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#00E5FF18',
    borderWidth: 1,
    borderColor: '#00E5FF50',
  },
  tabText: {
    color: '#707078',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  artistFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161622',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#00E5FF30',
  },
  artistFilterText: {
    color: '#8E8E98',
    fontSize: 12,
  },
  artistFilterClear: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: '#00E5FF20',
    borderRadius: 6,
  },
  artistFilterClearText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '700',
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
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
    paddingBottom: 220,
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
    width: 50,
    height: 50,
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
    fontSize: 14,
    fontWeight: '600',
  },
  rowTitleActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  rowArtist: {
    color: '#8E8E98',
    fontSize: 12,
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
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
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
  /* Álbuns Grid */
  albumColumnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  albumCard: {
    backgroundColor: '#14141E80',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1E1E2C',
  },
  albumCoverContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1C1C28',
  },
  albumCoverImage: {
    width: '100%',
    height: '100%',
  },
  albumBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#00E5FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  albumBadgeText: {
    color: '#0A0A0E',
    fontSize: 8,
    fontWeight: '800',
  },
  albumCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  albumCardArtist: {
    color: '#8E8E98',
    fontSize: 12,
    marginTop: 2,
  },
  albumCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  albumCardYear: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '600',
  },
  albumCardTracks: {
    color: '#606070',
    fontSize: 11,
  },
  /* Artistas List */
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#12121A80',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1C1C2A',
  },
  artistAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1C1C28',
    borderWidth: 1,
    borderColor: '#00E5FF30',
  },
  artistInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  artistName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  artistMeta: {
    color: '#8E8E98',
    fontSize: 12,
    marginTop: 2,
  },
  artistArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  artistActionLabel: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },
  /* Skeletons */
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
  albumGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonAlbumCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
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
    fontSize: 16,
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
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#00E5FF15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#00E5FF30',
  },
  idleTitle: {
    color: '#FFFFFF',
    fontSize: 17,
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
