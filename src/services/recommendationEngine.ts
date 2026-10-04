import { Track } from '../types';
import { supabase } from './supabaseClient';
import { MusicApi } from './musicApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_HISTORY_KEY = '@tkst_recent_history_v1';

export class RecommendationEngine {
  static async recordPlay(track: Track): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_HISTORY_KEY);
      const history: Track[] = raw ? JSON.parse(raw) : [];
      const filtered = history.filter((t) => t.id !== track.id);
      const updated = [track, ...filtered].slice(0, 30);
      await AsyncStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(updated));

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from('user_play_history').insert({
          user_id: session.user.id,
          track_id: track.id,
          genre: track.genre || 'Desconhecido',
        });
      }
    } catch (e) {
      console.warn('Erro ao salvar histórico de reprodução:', e);
    }
  }

  static async getRecentlyPlayed(): Promise<Track[]> {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static async getPersonalizedRecommendations(): Promise<Track[]> {
    try {
      const history = await this.getRecentlyPlayed();
      if (history.length === 0) {
        return await MusicApi.getTrendingTracks();
      }

      const genreCounts: Record<string, number> = {};
      history.forEach((track) => {
        if (track.genre) {
          genreCounts[track.genre] = (genreCounts[track.genre] || 0) + 1;
        }
      });

      const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

      if (topGenre) {
        const genreTracks = await MusicApi.searchTracks(topGenre);
        if (genreTracks.length > 0) {
          const listenedIds = new Set(history.map((t) => t.id));
          const freshTracks = genreTracks.filter((t) => !listenedIds.has(t.id));
          return freshTracks.length > 5 ? freshTracks : genreTracks;
        }
      }

      return await MusicApi.getTrendingTracks();
    } catch {
      return await MusicApi.getTrendingTracks();
    }
  }
}
