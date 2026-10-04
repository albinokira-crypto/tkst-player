import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlaylistManager, Playlist } from '../services/playlistManager';
import { Track } from '../types';

interface AddToPlaylistModalProps {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  visible,
  track,
  onClose,
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadPlaylists = async () => {
    const list = await PlaylistManager.getPlaylists();
    setPlaylists(list);
  };

  useEffect(() => {
    if (visible) {
      loadPlaylists();
      setIsCreating(false);
      setNewPlaylistName('');
    }
  }, [visible]);

  if (!track) return null;

  const handleAddToPlaylist = async (playlist: Playlist) => {
    const added = await PlaylistManager.addTrackToPlaylist(playlist.id, track);
    if (added) {
      Alert.alert('Sucesso', `Música adicionada à playlist "${playlist.name}"!`);
      onClose();
    } else {
      Alert.alert('Aviso', 'Esta música já está presente nesta playlist.');
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Nome obrigatório', 'Digite um nome para a sua playlist.');
      return;
    }
    const created = await PlaylistManager.createPlaylist(newPlaylistName.trim());
    await PlaylistManager.addTrackToPlaylist(created.id, track);
    Alert.alert('Sucesso', `Playlist "${created.name}" criada e música adicionada!`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Adicionar à Playlist</Text>
              <Text style={styles.trackSubtitle} numberOfLines={1}>
                {track.title} • {track.artist}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#A0A0B0" />
            </TouchableOpacity>
          </View>

          {isCreating ? (
            <View style={styles.createBox}>
              <TextInput
                placeholder="Nome da nova playlist (ex: Treino TKST)"
                placeholderTextColor="#707078"
                style={styles.input}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsCreating(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleCreateAndAdd}
                >
                  <Text style={styles.confirmBtnText}>Criar e Salvar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.newPlaylistButton}
              onPress={() => setIsCreating(true)}
            >
              <Ionicons name="add-circle" size={22} color="#00E5FF" />
              <Text style={styles.newPlaylistText}>Criar Nova Playlist</Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ paddingVertical: 6 }}
            renderItem={({ item }) => {
              const alreadyIn = item.tracks.some((t) => t.id === track.id);
              return (
                <TouchableOpacity
                  style={styles.playlistRow}
                  onPress={() => handleAddToPlaylist(item)}
                >
                  <View style={styles.playlistIconBox}>
                    <Ionicons name="musical-notes" size={18} color="#00E5FF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.playlistName}>{item.name}</Text>
                    <Text style={styles.playlistMeta}>
                      {item.tracks.length} {item.tracks.length === 1 ? 'música' : 'músicas'}
                    </Text>
                  </View>
                  {alreadyIn ? (
                    <Ionicons name="checkmark-circle" size={22} color="#30D158" />
                  ) : (
                    <Ionicons name="add" size={22} color="#00E5FF" />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !isCreating ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Você ainda não tem playlists criadas.</Text>
                </View>
              ) : null
            }
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#161622',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262638',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  trackSubtitle: {
    color: '#00E5FF',
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  newPlaylistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202030',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 14,
    gap: 10,
  },
  newPlaylistText: {
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '700',
  },
  createBox: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#202030',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelBtnText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  confirmBtn: {
    backgroundColor: '#00E5FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  confirmBtnText: {
    color: '#08080A',
    fontWeight: '700',
    fontSize: 14,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#20202E',
  },
  playlistIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#202032',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  playlistMeta: {
    color: '#707078',
    fontSize: 12,
    marginTop: 2,
  },
  emptyBox: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyText: {
    color: '#707078',
    fontSize: 13,
  },
});
