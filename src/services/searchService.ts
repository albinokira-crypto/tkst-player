import { Track } from '../types';

export interface SearchResult {
  tracks: Track[];
  hasMore: boolean;
  total?: number;
  provider: 'youtube' | 'soundcloud' | 'deezer' | 'itunes' | 'audius' | 'mixed';
}

const AUDIUS_APP_NAME = 'TKST_PLAYER_APP';
const AUDIUS_FALLBACK_HOST = 'https://audius-discovery-1.cultur3stake.com';

// Expressão regular rigorosa para rejeitar faixas instrumentais, karaokê ou sem voz
const BLACKLIST_REGEX =
  /(karaoke|instrumental|tribute|originally performed|backing track|karaokê|ringtone|toque de celular|sem voz|minus one|play along|playback|versão instrumental|zzang)/i;

let cachedScClientId = 'dkevB9EsY4jIoSm8RfddPNUKyn6hurXF';
let scClientTimestamp = 0;

export class SearchService {
  private static cache = new Map<string, { result: SearchResult; timestamp: number }>();
  private static CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutos de cache em memória

  /**
   * Obtém dinamicamente o client_id ativo do SoundCloud
   */
  private static async getSoundCloudClientId(): Promise<string> {
    const now = Date.now();
    if (cachedScClientId && now - scClientTimestamp < 1000 * 60 * 60 * 6) {
      return cachedScClientId;
    }

    try {
      const homeRes = await fetch('https://soundcloud.com', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      const html = await homeRes.text();
      const scriptUrls = [...html.matchAll(/<script[^>]+src="(https:\/\/[^"]+\.js)"/g)].map((m) => m[1]);
      for (const sUrl of scriptUrls.slice(-6)) {
        const sRes = await fetch(sUrl);
        const sText = await sRes.text();
        const match = sText.match(/client_id[:=]"([a-zA-Z0-9]{32})"/);
        if (match) {
          cachedScClientId = match[1];
          scClientTimestamp = now;
          return cachedScClientId;
        }
      }
    } catch (e) {
      console.warn('Erro ao obter SoundCloud client_id:', e);
    }
    return cachedScClientId || 'dkevB9EsY4jIoSm8RfddPNUKyn6hurXF';
  }

  /**
   * Motor Primário: YouTube Music (Innertube WEB_REMIX)
   * Encontra qualquer artista, banda ou música oficial do planeta com metadados reais
   */
  private static async searchYouTubeMusic(query: string, limit = 18): Promise<Track[]> {
    try {
      const res = await fetch(
        'https://music.youtube.com/youtubei/v1/search?alt=json&key=AIzaSyAO_FJ2SlqsmMV4Bg8TScxbUX9svqfWU',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-YouTube-Client-Name': '67',
            'X-YouTube-Client-Version': '1.20231214.01.00',
            Origin: 'https://music.youtube.com',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB_REMIX',
                clientVersion: '1.20231214.01.00',
                gl: 'BR',
                hl: 'pt',
              },
            },
            query,
          }),
        }
      );

      if (!res.ok) return [];
      const data = await res.json();
      const tracks: Track[] = [];

      const walk = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.musicResponsiveListItemRenderer) {
          const item = obj.musicResponsiveListItemRenderer;
          const flexCols = item.flexColumns || [];
          const titleRuns = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
          const title = titleRuns?.map((r: any) => r.text).join('') || '';

          const subtitleRuns = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          let durationSec = 180;
          let artist = '';
          for (const run of subtitleRuns) {
            const t = run.text?.trim();
            if (/^\d+:\d{2}$/.test(t)) {
              const [m, s] = t.split(':').map(Number);
              durationSec = m * 60 + s;
            } else if (
              t &&
              t !== '•' &&
              !t.includes('visualizações') &&
              !t.includes('ouvintes') &&
              !['Música', 'Vídeo', 'Álbum', 'Single'].includes(t)
            ) {
              if (!artist) artist = t;
            }
          }

          const videoId =
            item.playlistItemData?.videoId ||
            item.navigationEndpoint?.watchEndpoint?.videoId ||
            item.doubleTapCommand?.watchEndpoint?.videoId ||
            item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
              ?.playNavigationEndpoint?.watchEndpoint?.videoId;

          const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const thumb =
            thumbs.slice(-1)[0]?.url ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';

          // Filtra faixas com vocais reais e bloqueia karaokê/instrumental
          if (title && videoId && !BLACKLIST_REGEX.test(title) && !BLACKLIST_REGEX.test(artist)) {
            if (!tracks.some((t) => t.id === `yt_${videoId}`)) {
              tracks.push({
                id: `yt_${videoId}`,
                title,
                artist: artist || 'Artista',
                album: 'YouTube Music',
                artworkUrl: thumb,
                audioUrl: '', // Resolvido dinamicamente pelo StreamResolver para stream completo sem preview
                durationSeconds: durationSec,
                genre: 'YouTube Music',
              });
            }
          }
        }

        for (const k of Object.keys(obj)) {
          walk(obj[k]);
        }
      };

      walk(data);
      return tracks.slice(0, limit);
    } catch (e) {
      console.warn('YouTube Music search error:', e);
      return [];
    }
  }

  /**
   * Motor Primário Complementar: SoundCloud (Áudios completos com vocais e MP3 progressivo)
   */
  private static async searchSoundCloud(query: string, limit = 18): Promise<Track[]> {
    try {
      const clientId = await this.getSoundCloudClientId();
      const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit * 2}`;
      const res = await fetch(url);
      if (!res.ok) return [];

      const data = await res.json();
      const tracks: Track[] = [];

      for (const item of data.collection || []) {
        if (!item.duration || item.duration < 60000) continue;
        if (BLACKLIST_REGEX.test(item.title || '') || BLACKLIST_REGEX.test(item.user?.username || '')) {
          continue;
        }

        const progressive = item.media?.transcodings?.find((tr: any) => tr.format?.protocol === 'progressive');
        if (!progressive) continue;

        const thumb = item.artwork_url
          ? item.artwork_url.replace('-large', '-t500x500')
          : item.user?.avatar_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';

        tracks.push({
          id: `sc_${item.id}`,
          title: item.title,
          artist: item.user?.username || 'Artista SoundCloud',
          album: item.genre || 'Single',
          artworkUrl: thumb,
          audioUrl: `${progressive.url}?client_id=${clientId}`,
          durationSeconds: Math.round(item.duration / 1000),
          genre: item.genre || 'SoundCloud',
        });

        if (tracks.length >= limit) break;
      }

      return tracks;
    } catch (e) {
      console.warn('SoundCloud search error:', e);
      return [];
    }
  }

  /**
   * Pesquisa no Deezer API (com filtro anti-karaokê e anti-instrumental)
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
        .filter((item: any) => {
          if (!item.preview || item.preview.length === 0) return false;
          if (BLACKLIST_REGEX.test(item.title || '') || BLACKLIST_REGEX.test(item.artist?.name || '')) {
            return false;
          }
          return true;
        })
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
   * Pesquisa Secundária no Apple iTunes Search API
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
        .filter((item: any) => {
          if (!item.previewUrl || item.previewUrl.length === 0) return false;
          if (BLACKLIST_REGEX.test(item.trackName || '') || BLACKLIST_REGEX.test(item.artistName || '')) {
            return false;
          }
          return true;
        })
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
   * Busca Profunda Prioritária no YouTube Music & SoundCloud com fallback automático:
   * 1. Consulta em paralelo YouTube Music (Innertube) e SoundCloud.
   * 2. Intercala as melhores faixas com vocais reais e capas originais.
   * 3. Filtra estritamente versões instrumentais, karaokê e toques de celular.
   * 4. Se falhar ou não encontrar resultados, aciona o Deezer e iTunes.
   */
  static async searchTracks(query: string, page = 0, limit = 25): Promise<SearchResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { tracks: [], hasMore: false, provider: 'youtube' };
    }

    const cacheKey = `${cleanQuery.toLowerCase()}_p${page}_l${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.result;
    }

    // Na página inicial (0), busca simultânea no YouTube Music e SoundCloud
    if (page === 0) {
      const [ytResult, scResult] = await Promise.allSettled([
        this.searchYouTubeMusic(cleanQuery, 16),
        this.searchSoundCloud(cleanQuery, 16),
      ]);

      const ytTracks = ytResult.status === 'fulfilled' ? ytResult.value : [];
      const scTracks = scResult.status === 'fulfilled' ? scResult.value : [];

      if (ytTracks.length > 0 || scTracks.length > 0) {
        // Intercala faixas do YouTube Music e SoundCloud para máxima riqueza musical
        const combinedTracks: Track[] = [];
        const maxLen = Math.max(ytTracks.length, scTracks.length);

        for (let i = 0; i < maxLen; i++) {
          if (i < ytTracks.length) combinedTracks.push(ytTracks[i]);
          if (i < scTracks.length) combinedTracks.push(scTracks[i]);
        }

        const finalResult: SearchResult = {
          tracks: combinedTracks.slice(0, limit),
          hasMore: combinedTracks.length >= limit,
          total: combinedTracks.length,
          provider: 'mixed',
        };

        this.cache.set(cacheKey, { result: finalResult, timestamp: Date.now() });
        return finalResult;
      }
    }

    // Fallback: Tenta Deezer (filtrado sem karaokê)
    let result = await this.searchDeezer(cleanQuery, page, limit);

    // Fallback secundário: Apple iTunes
    if (!result || result.tracks.length === 0) {
      result = await this.searchITunes(cleanQuery, page, limit);
    }

    const finalResult: SearchResult = result || {
      tracks: [],
      hasMore: false,
      total: 0,
      provider: 'youtube',
    };

    this.cache.set(cacheKey, { result: finalResult, timestamp: Date.now() });
    return finalResult;
  }

  /**
   * Retorna os Top Hits Globais reais (Deezer Charts filtrado contra karaokê/instrumental)
   */
  static async getTrendingTracks(limit = 25): Promise<Track[]> {
    try {
      const res = await fetch(`https://api.deezer.com/chart/0/tracks?limit=${limit * 2}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          const tracks = json.data
            .filter((item: any) => {
              if (!item.preview) return false;
              if (BLACKLIST_REGEX.test(item.title || '') || BLACKLIST_REGEX.test(item.artist?.name || '')) {
                return false;
              }
              return true;
            })
            .slice(0, limit)
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

          if (tracks.length > 0) {
            return tracks;
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar top charts Deezer:', e);
    }

    return [];
  }

  /**
   * Busca músicas por gênero ou categoria
   */
  static async getTracksByGenre(genre: string, limit = 20): Promise<Track[]> {
    const res = await this.searchTracks(genre, 0, limit);
    return res.tracks;
  }
}
