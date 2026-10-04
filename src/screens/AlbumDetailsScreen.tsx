import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
  Animated,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Album, Track, PlaybackState } from '../types';
import { AlbumService } from '../services/albumService';
import { audioService } from '../services/audioService';
import { DownloadManager } from '../services/downloadManager';
import { StreamResolver } from '../services/streamResolver';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { TKSTBackground } from '../components/TKSTBackground';

export interface AlbumDetailsScreenProps {
  album?: Album;
  albumId?: string;
  source?: 'deezer' | 'itunes';
  onBack: () => void;
  onArtistPress?: (artistName: string, artistId?: string) => void;
  navigation?: any;
  route?: any;
}

export const AlbumDetailsScreen: React.FC<AlbumDetailsScreenProps> = ({
  album: initialAlbum,
  albumId: propAlbumId,
  source: propSource,
  onBack,
  onArtistPress,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 36) : 0,
    36
  );

  // Extrai parâmetros caso venha por React Navigation Route
  const routeParams = route?.params || {};
  const currentAlbumInit: Album | undefined = initialAlbum || routeParams.album;
  const currentAlbumId: string =
    propAlbumId || currentAlbumInit?.id || routeParams.albumId || '';
  const currentSource: 'deezer' | 'itunes' | undefined =
    propSource || currentAlbumInit?.source || routeParams.source;

  const [album, setAlbum] = useState<Album | null>(currentAlbumInit || null);
  const [tracks, setTracks] = useState<Track[]>(currentAlbumInit?.tracks || []);
  const [loading, setLoading] = useState<boolean>(!currentAlbumInit?.tracks?.length);
  const [error, setError] = useState<string | null>(null);

  // Estados de download do álbum
  const [isDownloaded, setIsDownloaded] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStepText, setDownloadStepText] = useState<string>('');

  // Modal para playlist
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState<Track | null>(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState<boolean>(false);

  // Monitora reprodução global em tempo real
  const [playback, setPlayback] = useState<PlaybackState>(audioService.getState());

  useEffect(() => {
    return audioService.subscribe((state) => {
      setPlayback(state);
    });
  }, []);

  // Animação de rotação para download ou carregamento
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isDownloading) {
      const loop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [isDownloading, spinAnim]);

  // Intercepta o botão voltar nativo do Android para retornar à lista/tela anterior
  useEffect(() => {
    const handleBackPress = () => {
      onBack();
      return true;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backSub.remove();
  }, [onBack]);

  // Carrega informações e faixas do álbum
  const loadAlbumData = useCallback(async () => {
    if (!currentAlbumId) {
      setError('ID do álbum não informado.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Verifica se já está baixado no storage offline
      const isOffline = await DownloadManager.isAlbumDownloaded(currentAlbumId);
      setIsDownloaded(isOffline);

      // 2. Busca dados completos e tracklist oficial
      const res = await AlbumService.getAlbumDetails(currentAlbumId, currentSource);
      setAlbum(res.album);
      setTracks(res.tracks);

      // 3. Atualiza estado offline individual por faixa
      const offlineTracks = await DownloadManager.getDownloadedTracks();
      const offlineIdSet = new Set(offlineTracks.map((t) => t.id));
      setTracks((prev) =>
        prev.map((t) => ({
          ...t,
          isDownloaded: offlineIdSet.has(t.id),
        }))
      );
    } catch (err: any) {
      console.warn('Erro ao carregar detalhes do álbum:', err);
      setError(err?.message || 'Falha ao carregar as faixas do álbum.');
    } finally {
      setLoading(false);
    }
  }, [currentAlbumId, currentSource]);

  useEffect(() => {
    loadAlbumData();
  }, [loadAlbumData]);

  // Tocar álbum completo desde a faixa 1
  const handlePlayFullAlbum = () => {
    if (!tracks || tracks.length === 0) {
      Alert.alert('Álbum Vazio', 'Nenhuma faixa encontrada neste álbum.');
      return;
    }

    // Se o player já está tocando a primeira música deste disco, alterna play/pause
    const firstTrack = tracks[0];
    const isPlayingFirst =
      playback.currentTrack?.id === firstTrack.id && playback.isPlaying;

    if (isPlayingFirst) {
      audioService.togglePlayPause();
    } else {
      audioService.setQueue(tracks, 0);
    }
  };

  // Tocar faixa individual da lista
  const handlePlayTrack = (track: Track, index: number) => {
    if (playback.currentTrack?.id === track.id) {
      audioService.togglePlayPause();
    } else {
      audioService.setQueue(tracks, index);
    }
  };

  // Baixar álbum completo em lote para modo offline
  const handleDownloadAlbum = async () => {
    if (!album || tracks.length === 0) return;

    if (isDownloaded) {
      Alert.alert(
        'Álbum Offline',
        'Este álbum já está salvo na memória do seu dispositivo.',
        [
          { text: 'OK' },
          {
            text: 'Remover Download',
            style: 'destructive',
            onPress: async () => {
              try {
                await DownloadManager.removeDownloadedAlbum(album.id);
                setIsDownloaded(false);
                loadAlbumData();
              } catch (e) {
                console.warn('Erro ao remover download:', e);
              }
            },
          },
        ]
      );
      return;
    }

    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStepText(`Iniciando download de ${tracks.length} faixas...`);

    try {
      const result = await DownloadManager.downloadAlbum(
        album,
        tracks,
        (completed, total, currentTrack, trackProgress) => {
          const totalProgress = (completed + trackProgress) / total;
          setDownloadProgress(Math.min(1, Math.max(0, totalProgress)));
          setDownloadStepText(
            `Baixando ${completed + 1}/${total}: ${currentTrack.title}`
          );
        }
      );

      if (result.success) {
        setIsDownloaded(true);
        Alert.alert(
          'Download Concluído!',
          `O álbum "${album.title}" foi salvo para reprodução offline sem internet.`
        );
        loadAlbumData();
      } else {
        Alert.alert(
          'Download Parcial',
          'Algumas faixas não puderam ser baixadas. Verifique sua conexão e tente novamente.'
        );
      }
    } catch (e: any) {
      console.warn('Erro no download do álbum:', e);
      Alert.alert('Erro ao Baixar', 'Ocorreu uma falha durante o download do álbum.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStepText('');
    }
  };

  // Tempo total calculado do disco em minutos
  const totalDurationMinutes = Math.round(
    tracks.reduce((acc, t) => acc + (t.durationSeconds || 0), 0) / 60
  );

  const isCurrentAlbumPlaying =
    Boolean(playback.currentTrack) &&
    tracks.some((t) => t.id === playback.currentTrack?.id) &&
    playback.isPlaying;

  // Renderização de cada faixa numerada
  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const isThisTrackPlaying =
      playback.currentTrack?.id === item.id && playback.isPlaying;
    const isThisTrackActive = playback.currentTrack?.id === item.id;
    const formattedTrackNum = (item.trackNumber || index + 1)
      .toString()
      .padStart(2, '0');

    return (
      <TouchableOpacity
        style={[
          styles.trackRow,
          isThisTrackActive && styles.trackRowActive,
        ]}
        onPress={() => handlePlayTrack(item, index)}
        activeOpacity={0.7}
      >
        {/* Número da faixa ou indicador de play */}
        <View style={styles.trackNumberBox}>
          {isThisTrackPlaying ? (
            <Ionicons name="volume-high" size={18} color="#00E5FF" />
          ) : (
            <Text
              style={[
                styles.trackNumberText,
                isThisTrackActive && styles.trackNumberActive,
              ]}
            >
              {formattedTrackNum}
            </Text>
          )}
        </View>

        {/* Informações da faixa */}
        <View style={styles.trackInfo}>
          <Text
            style={[styles.trackTitle, isThisTrackActive && styles.trackTitleActive]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>

        {/* Duração & Ações */}
        <View style={styles.trackRight}>
          {item.isDownloaded && (
            <Ionicons
              name="checkmark-circle"
              size={15}
              color="#00E5FF"
              style={{ marginRight: 6 }}
            />
          )}

          <Text style={styles.trackDuration}>
            {StreamResolver.formatDuration(item.durationSeconds)}
          </Text>

          <TouchableOpacity
            style={styles.trackActionBtn}
            onPress={() => {
              setSelectedTrackForPlaylist(item);
              setIsPlaylistModalOpen(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Ionicons name="bookmark-outline" size={18} color="#707078" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.trackActionBtn}
            onPress={() => handlePlayTrack(item, index)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Ionicons
              name={isThisTrackPlaying ? 'pause-circle' : 'play-circle'}
              size={24}
              color={isThisTrackActive ? '#00E5FF' : '#A0A0B0'}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <TKSTBackground variant="clean" opacity={0.3}>
      <View style={[styles.container, { paddingTop: topInset + 6 }]}>
        {/* Barra superior de navegação */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.topBarTitle} numberOfLines={1}>
            {album?.title || 'Detalhes do Álbum'}
          </Text>

          <View style={{ width: 40 }} />
        </View>

        {loading && !album ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00E5FF" />
            <Text style={styles.loadingText}>Carregando discografia oficial...</Text>
          </View>
        ) : error && !album ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={56} color="#FF3B30" />
            <Text style={styles.errorTitle}>Não foi possível carregar</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadAlbumData}>
              <Text style={styles.retryButtonText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item, index) => item.id || `track_${index}`}
            renderItem={renderTrackItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              album ? (
                <View style={styles.headerContainer}>
                  {/* Capa de Alta Resolução do Álbum */}
                  <View style={styles.coverWrapper}>
                    <Image
                      source={{
                        uri:
                          album.artworkUrl ||
                          'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
                      }}
                      style={styles.albumCover}
                      resizeMode="cover"
                    />
                    <View style={styles.badgeContainer}>
                      <Text style={styles.badgeText}>DISCOGRAFIA OFICIAL</Text>
                    </View>
                  </View>

                  {/* Informações Textuais */}
                  <Text style={styles.albumTitle} numberOfLines={2}>
                    {album.title}
                  </Text>

                  <TouchableOpacity
                    onPress={() => onArtistPress && onArtistPress(album.artist, album.artistId)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.albumArtist}>{album.artist}</Text>
                  </TouchableOpacity>

                  {/* Metadados: Ano, Faixas, Duração */}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      {album.releaseYear || 'Álbum'}
                    </Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>
                      {album.totalTracks || tracks.length} faixas
                    </Text>
                    {totalDurationMinutes > 0 && (
                      <>
                        <Text style={styles.metaDot}>•</Text>
                        <Text style={styles.metaText}>{totalDurationMinutes} min</Text>
                      </>
                    )}
                    {album.genre ? (
                      <>
                        <Text style={styles.metaDot}>•</Text>
                        <Text style={styles.metaGenre}>{album.genre}</Text>
                      </>
                    ) : null}
                  </View>

                  {/* Barra de Progresso do Download do Álbum */}
                  {isDownloading && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressHeader}>
                        <Text style={styles.progressStepText} numberOfLines={1}>
                          {downloadStepText}
                        </Text>
                        <Text style={styles.progressPercentText}>
                          {Math.round(downloadProgress * 100)}%
                        </Text>
                      </View>
                      <View style={styles.progressBarBackground}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${Math.round(downloadProgress * 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  )}

                  {/* Botões de Destaque: Tocar Álbum e Baixar Álbum */}
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      style={[styles.primaryButton, isCurrentAlbumPlaying && styles.primaryButtonActive]}
                      onPress={handlePlayFullAlbum}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isCurrentAlbumPlaying ? 'pause' : 'play'}
                        size={20}
                        color="#0A0A0E"
                      />
                      <Text style={styles.primaryButtonText}>
                        {isCurrentAlbumPlaying ? 'Pausar Álbum' : 'Tocar Álbum Completo'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.secondaryButton,
                        isDownloaded && styles.secondaryButtonDownloaded,
                        isDownloading && styles.secondaryButtonDisabled,
                      ]}
                      onPress={handleDownloadAlbum}
                      disabled={isDownloading}
                      activeOpacity={0.8}
                    >
                      {isDownloading ? (
                        <ActivityIndicator size="small" color="#00E5FF" />
                      ) : (
                        <Ionicons
                          name={isDownloaded ? 'checkmark-circle' : 'download-outline'}
                          size={20}
                          color={isDownloaded ? '#00E5FF' : '#FFFFFF'}
                        />
                      )}
                      <Text
                        style={[
                          styles.secondaryButtonText,
                          isDownloaded && styles.secondaryButtonTextDownloaded,
                        ]}
                      >
                        {isDownloading
                          ? 'Baixando...'
                          : isDownloaded
                          ? 'Baixado'
                          : 'Baixar Álbum'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Faixas do Disco</Text>
                    <Text style={styles.sectionSubtitle}>
                      {tracks.length} músicas comerciais
                    </Text>
                  </View>
                </View>
              ) : null
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
    backgroundColor: '#0A0A0E',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#161622CC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#242436',
  },
  topBarTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#8E8E98',
    fontSize: 14,
    marginTop: 14,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
  },
  errorMessage: {
    color: '#8E8E98',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#00E5FF',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#0A0A0E',
    fontWeight: '700',
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 220,
  },
  headerContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  coverWrapper: {
    width: 220,
    height: 220,
    borderRadius: 18,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
    marginBottom: 18,
    position: 'relative',
    backgroundColor: '#161622',
  },
  albumCover: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  badgeContainer: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    backgroundColor: '#00E5FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  badgeText: {
    color: '#0A0A0E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  albumTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
  },
  albumArtist: {
    color: '#00E5FF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  metaText: {
    color: '#8E8E98',
    fontSize: 12,
    fontWeight: '500',
  },
  metaDot: {
    color: '#505060',
    fontSize: 12,
  },
  metaGenre: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    width: '100%',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressStepText: {
    color: '#8E8E98',
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  progressPercentText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarBackground: {
    width: '100%',
    height: 6,
    backgroundColor: '#1C1C2A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 3,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 20,
    gap: 12,
  },
  primaryButton: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    height: 48,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonActive: {
    backgroundColor: '#33EFFF',
  },
  primaryButtonText: {
    color: '#0A0A0E',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161622',
    height: 48,
    borderRadius: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: '#242436',
  },
  secondaryButtonDownloaded: {
    borderColor: '#00E5FF40',
    backgroundColor: '#00E5FF10',
  },
  secondaryButtonDisabled: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButtonTextDownloaded: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  sectionHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#707078',
    fontSize: 12,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#16162280',
  },
  trackRowActive: {
    backgroundColor: '#00E5FF10',
  },
  trackNumberBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  trackNumberText: {
    color: '#707078',
    fontSize: 13,
    fontWeight: '600',
  },
  trackNumberActive: {
    color: '#00E5FF',
    fontWeight: '800',
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  trackTitleActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  trackArtist: {
    color: '#8E8E98',
    fontSize: 12,
    marginTop: 2,
  },
  trackRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackDuration: {
    color: '#606070',
    fontSize: 11,
    marginRight: 4,
  },
  trackActionBtn: {
    padding: 4,
  },
});
