import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DownloadManager } from '../services/downloadManager';
import { PlaylistManager, Playlist } from '../services/playlistManager';
import { audioService } from '../services/audioService';
import { TKSTBackground } from '../components/TKSTBackground';
import { Track } from '../types';

export const PlaylistsScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 36) : 0,
    36
  );
  const [activeTab, setActiveTab] = useState<'playlists' | 'downloads'>('playlists');
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  // Modal para criar nova playlist
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playback, setPlayback] = useState(audioService.getState());

  useEffect(() => {
    return audioService.subscribe((state) => {
      setPlayback(state);
    });
  }, []);

  const loadData = async () => {
    const offlineList = await DownloadManager.getDownloadedTracks();
    setOfflineTracks(offlineList);

    const playlistList = await PlaylistManager.getPlaylists();
    setPlaylists(playlistList);

    // Atualiza playlist selecionada se estiver aberta
    if (selectedPlaylist) {
      const updated = playlistList.find((p) => p.id === selectedPlaylist.id);
      setSelectedPlaylist(updated || null);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handlePlayDownloaded = (track: Track, index: number) => {
    audioService.setQueue(offlineTracks, index);
  };

  const handleRemoveOffline = async (trackId: string) => {
    await DownloadManager.removeDownloadedTrack(trackId);
    loadData();
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Aviso', 'Digite um nome para a sua playlist.');
      return;
    }
    const created = await PlaylistManager.createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setIsCreateModalOpen(false);
    await loadData();
    setSelectedPlaylist(created);
  };

  const handleDeletePlaylist = (playlist: Playlist) => {
    Alert.alert(
      'Excluir Playlist',
      `Tem certeza que deseja excluir a playlist "${playlist.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await PlaylistManager.deletePlaylist(playlist.id);
            setSelectedPlaylist(null);
            loadData();
          },
        },
      ]
    );
  };

  const handleRemoveTrackFromPlaylist = async (trackId: string) => {
    if (!selectedPlaylist) return;
    await PlaylistManager.removeTrackFromPlaylist(selectedPlaylist.id, trackId);
    loadData();
  };

  const handlePlayPlaylistAll = (startIndex = 0) => {
    if (!selectedPlaylist || selectedPlaylist.tracks.length === 0) return;
    audioService.setQueue(selectedPlaylist.tracks, startIndex);
  };

  return (
    <TKSTBackground variant="emblem" opacity={0.24}>
      <View style={[styles.container, { paddingTop: topInset + 14 }]}>
        <View style={styles.tabHeader}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'playlists' && styles.tabActive]}
            onPress={() => {
              setSelectedPlaylist(null);
              setActiveTab('playlists');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'playlists' && styles.tabTextActive]}>
              Minhas Playlists ({playlists.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'downloads' && styles.tabActive]}
            onPress={() => {
              setSelectedPlaylist(null);
              setActiveTab('downloads');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'downloads' && styles.tabTextActive]}>
              Baixadas ({offlineTracks.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'downloads' ? (
          <FlatList
            data={offlineTracks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 180 }}
            renderItem={({ item, index }) => (
              <View style={styles.trackRow}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => handlePlayDownloaded(item, index)}
                >
                  <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleRemoveOffline(item.id)}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF453A" />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="cloud-offline-outline" size={54} color="#3A3A46" />
                <Text style={styles.emptyTitle}>Sem músicas offline</Text>
                <Text style={styles.emptySubtitle}>
                  Abra qualquer música no Player e toque no ícone de download para ouvir sem internet.
                </Text>
              </View>
            }
          />
        ) : selectedPlaylist ? (
          /* Visualização da Playlist Selecionada */
          <View style={{ flex: 1 }}>
            <View style={styles.playlistDetailHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setSelectedPlaylist(null)}
              >
                <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.playlistDetailTitle} numberOfLines={1}>
                  {selectedPlaylist.name}
                </Text>
                <Text style={styles.playlistDetailSubtitle}>
                  {selectedPlaylist.tracks.length} {selectedPlaylist.tracks.length === 1 ? 'música' : 'músicas'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePlaylist(selectedPlaylist)}
              >
                <Ionicons name="trash-outline" size={20} color="#FF453A" />
              </TouchableOpacity>
            </View>

            {selectedPlaylist.tracks.length > 0 && (
              <TouchableOpacity
                style={styles.playAllButton}
                onPress={() => handlePlayPlaylistAll(0)}
              >
                <Ionicons name="play" size={20} color="#08080A" />
                <Text style={styles.playAllButtonText}>Tocar Playlist Completa</Text>
              </TouchableOpacity>
            )}

            <FlatList
              data={selectedPlaylist.tracks}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 180, paddingTop: 10 }}
              renderItem={({ item, index }) => {
                const isCurrent = playback.currentTrack?.id === item.id;
                const isPlaying = isCurrent && playback.isPlaying;
                const isLoading = isCurrent && playback.isLoading;

                return (
                  <View style={[styles.trackRow, isCurrent && { backgroundColor: 'rgba(0, 229, 255, 0.08)', borderColor: 'rgba(0, 229, 255, 0.25)', borderWidth: 1 }]}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                      onPress={() => {
                        if (isCurrent) {
                          audioService.togglePlayPause();
                        } else {
                          handlePlayPlaylistAll(index);
                        }
                      }}
                    >
                      <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.title, isCurrent && { color: '#00E5FF' }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.artist} numberOfLines={1}>
                          {item.artist}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {isLoading ? (
                      <View style={{ paddingHorizontal: 12 }}>
                        <ActivityIndicator size="small" color="#00E5FF" />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{ paddingHorizontal: 8 }}
                        onPress={() => {
                          if (isCurrent) {
                            audioService.togglePlayPause();
                          } else {
                            handlePlayPlaylistAll(index);
                          }
                        }}
                      >
                        <Ionicons
                          name={isPlaying ? 'pause-circle' : isCurrent ? 'play-circle' : 'play-outline'}
                          size={28}
                          color={isCurrent ? '#00E5FF' : '#707078'}
                        />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleRemoveTrackFromPlaylist(item.id)}
                    >
                      <Ionicons name="close-circle-outline" size={20} color="#8E8E93" />
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="musical-note-outline" size={48} color="#3A3A46" />
                  <Text style={styles.emptyTitle}>Playlist vazia</Text>
                  <Text style={styles.emptySubtitle}>
                    Toque no ícone de marcador (+) no player da música para adicioná-la aqui.
                  </Text>
                </View>
              }
            />
          </View>
        ) : (
          /* Lista de Playlists */
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              style={styles.createButtonHeader}
              onPress={() => setIsCreateModalOpen(true)}
            >
              <Ionicons name="add" size={22} color="#08080A" />
              <Text style={styles.createButtonHeaderText}>Criar Nova Playlist</Text>
            </TouchableOpacity>

            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 180, paddingTop: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.playlistCard}
                  onPress={() => setSelectedPlaylist(item)}
                >
                  <View style={styles.playlistCoverBox}>
                    {item.tracks[0]?.artworkUrl ? (
                      <Image
                        source={{ uri: item.tracks[0].artworkUrl }}
                        style={styles.playlistCoverImg}
                      />
                    ) : (
                      <Ionicons name="musical-notes" size={24} color="#00E5FF" />
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.playlistCardTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.playlistCardCount}>
                      {item.tracks.length} {item.tracks.length === 1 ? 'música' : 'músicas'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#606070" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="albums-outline" size={54} color="#3A3A46" />
                  <Text style={styles.emptyTitle}>Nenhuma playlist criada</Text>
                  <Text style={styles.emptySubtitle}>
                    Organize suas músicas favoritas por treino, foco ou estilo.
                  </Text>
                  <TouchableOpacity
                    style={styles.createButton}
                    onPress={() => setIsCreateModalOpen(true)}
                  >
                    <Text style={styles.createButtonText}>+ Criar Primeira Playlist</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        )}

        {/* Modal de Criação de Playlist */}
        <Modal visible={isCreateModalOpen} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Nova Playlist</Text>
              <TextInput
                placeholder="Nome da playlist (ex: Kata Avançado)"
                placeholderTextColor="#707078"
                style={styles.modalInput}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setIsCreateModalOpen(false);
                    setNewPlaylistName('');
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={handleCreatePlaylist}
                >
                  <Text style={styles.modalConfirmText}>Criar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </TKSTBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: '#161622',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#242432',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#262638',
  },
  tabText: {
    color: '#8E8E93',
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  createButtonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
  },
  createButtonHeaderText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 14,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161622',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#242434',
  },
  playlistCoverBox: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#202030',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playlistCoverImg: {
    width: '100%',
    height: '100%',
  },
  playlistCardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  playlistCardCount: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 3,
  },
  playlistDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: '#161622',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242434',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#242434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistDetailTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  playlistDetailSubtitle: {
    color: '#00E5FF',
    fontSize: 13,
    marginTop: 2,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 8,
  },
  playAllButtonText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 14,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#181824',
  },
  artwork: {
    width: 46,
    height: 46,
    borderRadius: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  artist: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
  deleteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#707078',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  createButton: {
    marginTop: 20,
    backgroundColor: '#00E5FF',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createButtonText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#161622',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262638',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#202030',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modalCancelText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  modalConfirmBtn: {
    backgroundColor: '#00E5FF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalConfirmText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 14,
  },
});
