import { Track } from '../types';

export interface SearchResult {
  tracks: Track[];
  hasMore: boolean;
  total?: number;
  provider: 'deezer' | 'itunes' | 'audius' | 'mixed';
}

const AUDIUS_APP_NAME = 'TKST_PLAYER_APP';
const AUDIUS_FALLBACK_HOST = 'https://audius-discovery-1.cultur3stake.com';

export class SearchService {
  private static cache = new Map<string, { result: SearchResult; timestamp: number }>();
  private static CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutos de cache em memória

  /**
   * Obtém host de descoberta para a API Audius (fallback)
   */
  private static async getAudiusHost(): Promise<string> {
    try {
      const res = await fetch('https://api.audius.co');
      const json = await res.json();
      return json.data[0] || AUDIUS_FALLBACK_HOST;
    } catch {
      return AUDIUS_FALLBACK_HOST;
    }
  }

  /**
   * Pesquisa Primária no Deezer API (Acervo Global Comercial)
   */
  private static async searchDeezer(query: string, page = 0, limit = 25): Promise<SearchResult | null> {
    try {
      const index = page * limit;
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&index=${index}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        return null;
      }

      const tracks: Track[] = data.data
        .filter((item: any) => item.preview && item.preview.length > 0)
        .map((item: any) => ({
          id: `dz_${item.id}`,
          title: item.title_short || item.title,
          artist: item.artist?.name || 'Artista Desconhecido',
          album: item.album?.title || 'Single',
          artworkUrl:
            item.album?.cover_big ||
            item.album?.cover_medium ||
            item.artist?.picture_big ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
          audioUrl: item.preview,
          durationSeconds: item.duration || 180,
          genre: item.genre_id ? String(item.genre_id) : undefined,
        }));

      const total = typeof data.total === 'number' ? data.total : tracks.length;
      const hasMore = (page + 1) * limit < total;

      return {
        tracks,
        hasMore,
        total,
        provider: 'deezer',
      };
    } catch (e) {
      console.warn('Deezer search error:', e);
      return null;
    }
  }

  /**
   * Pesquisa Secundária no Apple iTunes Search API (Acervo Mundial Resiliente)
   */
  private static async searchITunes(query: string, page = 0, limit = 25): Promise<SearchResult | null> {
    try {
      const offset = page * limit;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
        return null;
      }

      const tracks: Track[] = data.results
        .filter((item: any) => item.previewUrl && item.previewUrl.length > 0)
        .map((item: any) => ({
          id: `it_${item.trackId}`,
          title: item.trackName,
          artist: item.artistName || 'Artista Desconhecido',
          album: item.collectionName || 'Single',
          artworkUrl: item.artworkUrl100
            ? item.artworkUrl100.replace('100x100bb', '600x600bb')
            : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
          audioUrl: item.previewUrl,
          durationSeconds: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 180,
          genre: item.primaryGenreName,
        }));

      const hasMore = data.results.length === limit;

      return {
        tracks,
        hasMore,
        total: data.resultCount,
        provider: 'itunes',
      };
    } catch (e) {
      console.warn('iTunes search error:', e);
      return null;
    }
  }

  /**
   * Pesquisa Terciária na Audius API (Fallback para Indie / Remixes / Underground)
   */
  private static async searchAudius(query: string): Promise<SearchResult | null> {
    try {
      const host = await this.getAudiusHost();
      const url = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${AUDIUS_APP_NAME}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const json = await res.json();
      if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
        return null;
      }

      const tracks: Track[] = json.data.map((item: any) => ({
        id: `au_${item.id}`,
        title: item.title,
        artist: item.user?.name || 'Artista Desconhecido',
        album: item.genre || 'Single',
        artworkUrl:
          item.artwork?.['480x480'] ||
          item.artwork?.['150x150'] ||
          'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
        audioUrl: `${host}/v1/tracks/${item.id}/stream?app_name=${AUDIUS_APP_NAME}`,
        durationSeconds: item.duration || 180,
        genre: item.genre,
      }));

      return {
        tracks,
        hasMore: false,
        total: tracks.length,
        provider: 'audius',
      };
    } catch (e) {
      console.warn('Audius search error:', e);
      return null;
    }
  }

  /**
   * Busca Profunda Resiliente:
   * 1. Consulta Deezer (maior acervo mundial de artistas famosos).
   * 2. Se falhar ou retornar vazio, aciona o fallback do Apple iTunes automaticamente.
   * 3. Se ambos falharem, consulta o Audius.
   * 4. Garante paginação e scroll infinito em qualquer motor ativo.
   */
  static async searchTracks(query: string, page = 0, limit = 25): Promise<SearchResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { tracks: [], hasMore: false, provider: 'deezer' };
    }

    const cacheKey = `${cleanQuery.toLowerCase()}_p${page}_l${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.result;
    }

    // 1. Tenta Deezer (Principal)
    let result = await this.searchDeezer(cleanQuery, page, limit);

    // 2. Se não encontrar no Deezer, aciona o Fallback do iTunes
    if (!result || result.tracks.length === 0) {
      result = await this.searchITunes(cleanQuery, page, limit);
    }

    // 3. Se ainda assim não encontrar, aciona o Fallback do Audius (apenas na pág 0)
    if ((!result || result.tracks.length === 0) && page === 0) {
      result = await this.searchAudius(cleanQuery);
    }

    const finalResult: SearchResult = result || {
      tracks: [],
      hasMore: false,
      total: 0,
      provider: 'deezer',
    };

    this.cache.set(cacheKey, { result: finalResult, timestamp: Date.now() });
    return finalResult;
  }

  /**
   * Retorna os Top Hits Globais reais (Deezer Charts) com fallback para Audius
   */
  static async getTrendingTracks(limit = 25): Promise<Track[]> {
    try {
      const res = await fetch(`https://api.deezer.com/chart/0/tracks?limit=${limit}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          return json.data
            .filter((item: any) => item.preview)
            .map((item: any) => ({
              id: `dz_${item.id}`,
              title: item.title_short || item.title,
              artist: item.artist?.name || 'Artista Desconhecido',
              album: item.album?.title || 'Top Hit',
              artworkUrl:
                item.album?.cover_big ||
                item.album?.cover_medium ||
                'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500',
              audioUrl: item.preview,
              durationSeconds: item.duration || 180,
              genre: 'Top Global',
            }));
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar top charts Deezer:', e);
    }

    // Fallback para Audius Trending
    try {
      const host = await this.getAudiusHost();
      const res = await fetch(`${host}/v1/tracks/trending?app_name=${AUDIUS_APP_NAME}&limit=${limit}`);
      const json = await res.json();
      return (json.data || []).map((item: any) => ({
        id: `au_${item.id}`,
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

  /**
   * Busca músicas por gênero ou categoria
   */
  static async getTracksByGenre(genre: string, limit = 20): Promise<Track[]> {
    const res = await this.searchTracks(genre, 0, limit);
    return res.tracks;
  }
}
