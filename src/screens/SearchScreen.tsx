import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MusicApi } from '../services/musicApi';
import { audioService } from '../services/audioService';
import { TKSTBackground } from '../components/TKSTBackground';
import { Track } from '../types';

const TrackItem = React.memo(({ track, onPress }: { track: Track; onPress: () => void }) => (
  <TouchableOpacity style={styles.trackRow} onPress={onPress} activeOpacity={0.7}>
    <Image source={{ uri: track.artworkUrl }} style={styles.rowArtwork} />
    <View style={styles.rowInfo}>
      <Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text>
      <Text style={styles.rowArtist} numberOfLines={1}>{track.artist}</Text>
    </View>
    <Ionicons name="play-circle-outline" size={28} color="#00E5FF" />
  </TouchableOpacity>
));

export const SearchScreen = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 2) return;
    setLoading(true);
    const data = await MusicApi.searchTracks(text);
    setResults(data);
    setLoading(false);
  };

  const handlePlayTrack = useCallback((track: Track, index: number) => {
    audioService.setQueue(results, index);
  }, [results]);

  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <TrackItem track={item} onPress={() => handlePlayTrack(item, index)} />
    ),
    [handlePlayTrack]
  );

  return (
    <TKSTBackground variant="kanji" opacity={0.08}>
      <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#707078" />
        <TextInput
          placeholder="Artistas, faixas ou gêneros..."
          placeholderTextColor="#707078"
          style={styles.input}
          value={query}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={18} color="#707078" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#00E5FF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 180 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {query.length > 1 ? 'Nenhuma faixa encontrada' : 'Busque milhões de músicas online'}
            </Text>
          }
        />
      )}
      </View>
    </TKSTBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 54,
    paddingHorizontal: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161E',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    marginLeft: 8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#16161E',
  },
  rowArtwork: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#20202A',
  },
  rowInfo: {
    flex: 1,
    marginLeft: 14,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowArtist: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 3,
  },
  emptyText: {
    color: '#555560',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 14,
  },
});
