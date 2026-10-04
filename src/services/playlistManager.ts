import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../types';

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  tracks: Track[];
}

const STORAGE_KEY = '@tkst_user_playlists';

export class PlaylistManager {
  public static async getPlaylists(): Promise<Playlist[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.error('Erro ao carregar playlists:', e);
      return [];
    }
  }

  public static async createPlaylist(name: string): Promise<Playlist> {
    const playlists = await this.getPlaylists();
    const newPlaylist: Playlist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      tracks: [],
    };
    playlists.push(newPlaylist);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    return newPlaylist;
  }

  public static async addTrackToPlaylist(playlistId: string, track: Track): Promise<boolean> {
    const playlists = await this.getPlaylists();
    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) return false;

    // Evita duplicatas
    const alreadyExists = playlist.tracks.some((t) => t.id === track.id);
    if (alreadyExists) return false;

    playlist.tracks.push(track);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    return true;
  }

  public static async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlists = await this.getPlaylists();
    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) return;

    playlist.tracks = playlist.tracks.filter((t) => t.id !== trackId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  }

  public static async deletePlaylist(playlistId: string): Promise<void> {
    const playlists = await this.getPlaylists();
    const filtered = playlists.filter((p) => p.id !== playlistId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
}
