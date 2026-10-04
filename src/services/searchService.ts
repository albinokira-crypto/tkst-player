import { Track } from '../types';

export interface SearchResult {
  tracks: Track[];
  hasMore: boolean;
  total?: number;
  provider: 'youtube' | 'soundcloud' | 'itunes' | 'mixed';
}

// Expressão regular rigorosa para rejeitar faixas instrumentais, karaokê ou sem voz
const BLACKLIST_REGEX =
  /(karaoke|instrumental|tribute|originally performed|backing track|karaokê|ringtone|toque de celular|sem voz|minus one|play along|playback|versão instrumental|zzang)/i;

// Expressão regular rigorosa para bloquear versões ao vivo, shows, acústicos e DVDs
const STRICT_LIVE_OR_ACOUSTIC_REGEX =
  /([\(\[]\s*(ao vivo|live|ac[uú]stic[oa]|show|shows|dvd|unplugged|show ao vivo|em show|ao vivo no [^)\\]]+|ao vivo em [^)\\]]+|gravado ao vivo|show completo|dvd completo|concert)\s*[\)\]]|\b(ao vivo|live show|ac[uú]stic[oa]|unplugged|show completo|dvd completo|ao vivo em|ao vivo no|dvd|concert|show|shows)\b)/i;

export const isLiveOrAcoustic = (text: string): boolean => {
  return STRICT_LIVE_OR_ACOUSTIC_REGEX.test(text || '');
};

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
   * Motor Primário 1: YouTube Music (Innertube WEB_REMIX)
   * Catálogo oficial de músicas, álbuns e lançamentos de estúdio
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

          let artist = '';
          let durationSec = 180;

          // 1. Procura runs que sejam explicitamente categorizados como Artista
          for (const col of flexCols) {
            const runs = col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
            for (const run of runs) {
              const pageType =
                run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
                  ?.browseEndpointContextMusicConfig?.pageType;
              if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
                if (!artist) {
                  artist = run.text?.trim() || '';
                }
              }
              const t = run.text?.trim() || '';
              if (/^\d+:\d{2}(:\d{2})?$/.test(t)) {
                const parts = t.split(':').map(Number);
                if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
                if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
            }
          }

          // 2. Fallback: analisa colunas secundárias ignorando badges e tempos
          if (!artist) {
            const subtitleRuns = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
            for (const run of subtitleRuns) {
              const t = run.text?.trim() || '';
              if (
                t &&
                t !== '•' &&
                t !== ',' &&
                t !== 'e' &&
                !/^\d+:\d{2}(:\d{2})?$/.test(t) &&
                !t.includes('visualizações') &&
                !t.includes('ouvintes') &&
                !['Música', 'Vídeo', 'Álbum', 'Single', 'Playlist', 'Episódio'].includes(t) &&
                !/^\d{4}$/.test(t)
              ) {
                artist = t;
                break;
              }
            }
          }

          // 3. Fallback: se o título já contém "Artista - Título"
          if (!artist && title.includes(' - ')) {
            const parts = title.split(' - ');
            if (parts[0] && parts[0].trim().length > 1) {
              artist = parts[0].trim();
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

          // Filtra faixas com vocais reais e bloqueia karaokê, instrumental, ao vivo e acústico
          if (
            title &&
            videoId &&
            !BLACKLIST_REGEX.test(title) &&
            !BLACKLIST_REGEX.test(artist) &&
            !isLiveOrAcoustic(title) &&
            !isLiveOrAcoustic(artist)
          ) {
            if (!tracks.some((t) => t.id === `ytm_${videoId}` || t.id === `yt_${videoId}`)) {
              tracks.push({
                id: `ytm_${videoId}`,
                title,
                artist: artist || 'Artista',
                album: 'YouTube Music',
                artworkUrl: thumb,
                audioUrl: '', // Resolvido dinamicamente pelo StreamResolver
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
   * Motor Primário 2: YouTube Global (Innertube WEB)
   * Encontra clipes oficiais, músicas gravadas, acústicos e áudios originais
   */
  private static async searchYouTube(query: string, limit = 18): Promise<Track[]> {
    try {
      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/search?alt=json&key=AIzaSyAO_FJ2SlqsmMV4Bg8TScxbUX9svqfWU',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20231214.00.00',
                hl: 'pt',
                gl: 'BR',
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
        if (obj.videoRenderer) {
          const v = obj.videoRenderer;
          const title = v.title?.runs?.[0]?.text;
          const videoId = v.videoId;
          let owner = v.ownerText?.runs?.[0]?.text || 'Artista';
          if (owner.endsWith(' - Topic') || owner.endsWith(' - Tema')) {
            owner = owner.replace(/ - (Topic|Tema)$/, '').trim();
          }
          if ((!owner || owner === 'Artista') && title && title.includes(' - ')) {
            const parts = title.split(' - ');
            if (parts[0] && parts[0].trim().length > 1) {
              owner = parts[0].trim();
            }
          }

          const lengthText = v.lengthText?.simpleText || '3:30';
          const thumb =
            v.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';

          let durationSec = 210;
          if (/^\d+:\d{2}$/.test(lengthText)) {
            const [m, s] = lengthText.split(':').map(Number);
            durationSec = m * 60 + s;
          } else if (/^\d+:\d{2}:\d{2}$/.test(lengthText)) {
            const [h, m, s] = lengthText.split(':').map(Number);
            durationSec = h * 3600 + m * 60 + s;
          }

          if (
            title &&
            videoId &&
            !BLACKLIST_REGEX.test(title) &&
            !BLACKLIST_REGEX.test(owner) &&
            !isLiveOrAcoustic(title) &&
            !isLiveOrAcoustic(owner) &&
            durationSec <= 720
          ) {
            if (!tracks.some((t) => t.id === `yt_${videoId}` || t.id === `ytm_${videoId}`)) {
              tracks.push({
                id: `yt_${videoId}`,
                title,
                artist: owner,
                album: 'YouTube',
                artworkUrl: thumb,
                audioUrl: '', // Resolvido dinamicamente pelo StreamResolver
                durationSeconds: durationSec,
                genre: 'YouTube',
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
      console.warn('YouTube search error:', e);
      return [];
    }
  }

  /**
   * Motor Complementar: SoundCloud (Áudios completos com vocais e MP3 progressivo)
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
        if (
          BLACKLIST_REGEX.test(item.title || '') ||
          BLACKLIST_REGEX.test(item.user?.username || '') ||
          isLiveOrAcoustic(item.title || '')
        ) {
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
   * Motor de Busca Exclusivo: YouTube Music + YouTube
   * 1. Consulta em paralelo YouTube Music (álbuns e lançamentos oficiais) e YouTube Global (clipes e áudios).
   * 2. Inclui SoundCloud para vocais alternativos de estúdio.
   * 3. Deezer foi 100% eliminado.
   * 4. Bloqueia estritamente faixas instrumentais e karaokê.
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

    // Consulta simultânea com foco em Músicas de Estúdio e Vídeo Clipes Oficiais
    const [ytmResult, ytClipsResult, ytStudioResult, scResult] = await Promise.allSettled([
      this.searchYouTubeMusic(cleanQuery, 16),
      this.searchYouTube(`${cleanQuery} clipe oficial`, 12),
      this.searchYouTube(`${cleanQuery} audio oficial`, 12),
      this.searchSoundCloud(cleanQuery, 8),
    ]);

    const ytmTracks = ytmResult.status === 'fulfilled' ? ytmResult.value : [];
    const ytClips = ytClipsResult.status === 'fulfilled' ? ytClipsResult.value : [];
    const ytStudio = ytStudioResult.status === 'fulfilled' ? ytStudioResult.value : [];
    const scTracks = scResult.status === 'fulfilled' ? scResult.value : [];

    const trackMap = new Map<string, Track>();

    const addStudioTrack = (t: Track) => {
      // Bloqueio rigoroso de versões ao vivo, shows, acústicos e DVDs
      if (isLiveOrAcoustic(t.title) || isLiveOrAcoustic(t.album || '')) {
        return;
      }

      // Normaliza título e artista para evitar músicas duplicadas entre os motores
      const cleanT = t.title.toLowerCase().replace(/official|video|clipe|audio|remastered|lyric|\(.*\)|\[.*\]/g, '').trim();
      const cleanA = t.artist.toLowerCase().trim();
      const sig = `${cleanA} - ${cleanT}`.replace(/[^a-z0-9]/g, '');

      if (!trackMap.has(sig)) {
        trackMap.set(sig, t);
      }
    };

    // 1. YouTube Music (Versões oficiais de álbum de estúdio)
    ytmTracks.forEach(addStudioTrack);

    // 2. YouTube Global: Vídeo Clipes Oficiais (áudios originais de clipe)
    ytClips.forEach(addStudioTrack);

    // 3. YouTube Global: Áudios Oficiais de Estúdio
    ytStudio.forEach(addStudioTrack);

    // 4. SoundCloud (áudios de estúdio)
    scTracks.forEach(addStudioTrack);

    let combinedTracks = Array.from(trackMap.values());

    // Se nenhum resultado de estúdio estrito foi retornado (ex: artista que só gravou DVD de show),
    // inclui resultados de fallback para evitar tela em branco
    if (combinedTracks.length === 0) {
      const fallbackYt = await this.searchYouTube(cleanQuery, 15);
      combinedTracks = fallbackYt;
    }

    const finalResult: SearchResult = {
      tracks: combinedTracks.slice(0, limit),
      hasMore: combinedTracks.length >= limit,
      total: combinedTracks.length,
      provider: 'youtube',
    };

    this.cache.set(cacheKey, { result: finalResult, timestamp: Date.now() });
    return finalResult;
  }

  /**
   * Retorna os Top Hits Globais reais no YouTube Music e YouTube
   */
  static async getTrendingTracks(limit = 25): Promise<Track[]> {
    try {
      const [ytmHits, ytHits] = await Promise.allSettled([
        this.searchYouTubeMusic('Top Hits Brasil 2026', 15),
        this.searchYouTube('Top Musicas Mais Tocadas 2026', 15),
      ]);

      const t1 = ytmHits.status === 'fulfilled' ? ytmHits.value : [];
      const t2 = ytHits.status === 'fulfilled' ? ytHits.value : [];

      const LIVE_REGEX = /[\(\[](ao vivo|live|show|dvd|em show)[\)\]]|ao vivo|ao-vivo/i;
      const isLive = (t: string) => LIVE_REGEX.test(t);

      const trackMap = new Map<string, Track>();
      for (const t of [...t1, ...t2]) {
        const key = `${t.artist.toLowerCase()} - ${t.title.toLowerCase()}`.replace(/official|video|clipe|audio|remastered|lyric|\(.*\)|\[.*\]/g, '').replace(/[^a-z0-9]/g, '');
        if (!trackMap.has(key)) {
          trackMap.set(key, t);
        } else {
          const existing = trackMap.get(key)!;
          if (isLive(existing.title) && !isLive(t.title)) {
            trackMap.set(key, t);
          }
        }
      }

      const combined = Array.from(trackMap.values());
      combined.sort((a, b) => {
        const aLive = isLive(a.title) ? 1 : 0;
        const bLive = isLive(b.title) ? 1 : 0;
        return aLive - bLive;
      });

      if (combined.length > 0) {
        return combined.slice(0, limit);
      }
    } catch (e) {
      console.warn('Erro ao carregar top hits do YouTube:', e);
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
