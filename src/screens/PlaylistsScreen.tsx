import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DownloadManager } from '../services/downloadManager';
import { audioService } from '../services/audioService';
import { Track } from '../types';

export const PlaylistsScreen = () => {
  const [activeTab, setActiveTab] = useState<'playlists' | 'downloads'>('downloads');
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);

  const loadOfflineTracks = async () => {
    const list = await DownloadManager.getDownloadedTracks();
    setOfflineTracks(list);
  };

  useEffect(() => {
    loadOfflineTracks();
  }, [activeTab]);

  const handlePlayDownloaded = (track: Track, index: number) => {
    audioService.setQueue(offlineTracks, index);
  };

  const handleRemove = async (trackId: string) => {
    await DownloadManager.removeDownloadedTrack(trackId);
    loadOfflineTracks();
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'playlists' && styles.tabActive]}
          onPress={() => setActiveTab('playlists')}
        >
          <Text style={[styles.tabText, activeTab === 'playlists' && styles.tabTextActive]}>
            Minhas Playlists
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'downloads' && styles.tabActive]}
          onPress={() => setActiveTab('downloads')}
        >
          <Text style={[styles.tabText, activeTab === 'downloads' && styles.tabTextActive]}>
            Músicas Baixadas ({offlineTracks.length})
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
                onPress={() => handleRemove(item.id)}
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
                Baixe faixas na tela do Player para escutar sem internet.
              </Text>
            </View>
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="musical-notes-outline" size={54} color="#3A3A46" />
          <Text style={styles.emptyTitle}>Nenhuma playlist criada</Text>
          <TouchableOpacity style={styles.createButton}>
            <Text style={styles.createButtonText}>+ Criar Nova Playlist</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0E',
    paddingTop: 54,
    paddingHorizontal: 16,
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: '#161620',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#22222E',
  },
  tabText: {
    color: '#8E8E93',
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#161620',
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
  },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
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
    paddingHorizontal: 32,
  },
  createButton: {
    marginTop: 20,
    backgroundColor: '#00E5FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createButtonText: {
    color: '#08080A',
    fontWeight: '700',
  },
});
