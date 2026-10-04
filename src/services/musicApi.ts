import { Track } from '../types';

const AUDIUS_APP_NAME = 'TKST_PLAYER_APP';
const FALLBACK_HOST = 'https://audius-discovery-1.cultur3stake.com';

export class MusicApi {
  private static async getDiscoveryHost(): Promise<string> {
    try {
      const res = await fetch('https://api.audius.co');
      const json = await res.json();
      return json.data[0] || FALLBACK_HOST;
    } catch {
      return FALLBACK_HOST;
    }
  }

  static async searchTracks(query: string): Promise<Track[]> {
    if (!query.trim()) return [];
    try {
      const host = await this.getDiscoveryHost();
      const url = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${AUDIUS_APP_NAME}`;
      const res = await fetch(url);
      const json = await res.json();

      return (json.data || []).map((item: any) => ({
        id: String(item.id),
        title: item.title,
        artist: item.user?.name || 'Artista Desconhecido',
        album: item.genre || 'Single',
        artworkUrl: item.artwork?.['480x480'] || item.artwork?.['150x150'] || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
        audioUrl: `${host}/v1/tracks/${item.id}/stream?app_name=${AUDIUS_APP_NAME}`,
        durationSeconds: item.duration || 180,
        genre: item.genre,
      }));
    } catch (e) {
      console.warn('Erro ao pesquisar músicas:', e);
      return [];
    }
  }

  static async getTrendingTracks(): Promise<Track[]> {
    try {
      const host = await this.getDiscoveryHost();
      const res = await fetch(`${host}/v1/tracks/trending?app_name=${AUDIUS_APP_NAME}&limit=25`);
      const json = await res.json();

      return (json.data || []).map((item: any) => ({
        id: String(item.id),
        title: item.title,
        artist: item.user?.name || 'Artista Desconhecido',
        album: item.genre || 'Top Hit',
        artworkUrl: item.artwork?.['480x480'] || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500',
        audioUrl: `${host}/v1/tracks/${item.id}/stream?app_name=${AUDIUS_APP_NAME}`,
        durationSeconds: item.duration || 200,
        genre: item.genre,
      }));
    } catch {
      return [];
    }
  }
}
