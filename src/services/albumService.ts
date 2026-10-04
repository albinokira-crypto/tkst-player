import { Album, Track } from '../types';
import { StreamResolver } from './streamResolver';
import { DownloadManager } from './downloadManager';

export interface AlbumDetailsResult {
  album: Album;
  tracks: Track[];
}

export class AlbumService {
  private static albumCache = new Map<string, { data: AlbumDetailsResult; timestamp: number }>();
  private static discographyCache = new Map<string, { albums: Album[]; timestamp: number }>();
  private static CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutos de cache

  /**
   * Obtém detalhes e lista completa de faixas de um álbum comercial
   */
  static async getAlbumDetails(albumId: string, sourceHint?: 'deezer' | 'itunes'): Promise<AlbumDetailsResult> {
    const cleanId = albumId.replace(/^(deezer_|itunes_)/, '');
    const isDeezer = sourceHint === 'deezer' || albumId.startsWith('deezer_');
    const isItunes = sourceHint === 'itunes' || albumId.startsWith('itunes_');

    const cacheKey = `${isDeezer ? 'dz' : isItunes ? 'it' : 'auto'}_${cleanId}`;
    const cached = this.albumCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // 1. Verifica se já está salvo no armazenamento offline do usuário
    try {
      const offlineAlbums = await DownloadManager.getDownloadedAlbums();
      const offlineMatch = offlineAlbums.find((a) => a.id === albumId || a.id.endsWith(cleanId));
      if (offlineMatch && offlineMatch.tracks && offlineMatch.tracks.length > 0) {
        return {
          album: offlineMatch,
          tracks: offlineMatch.tracks,
        };
      }
    } catch (e) {
      console.warn('Erro ao verificar álbum offline:', e);
    }

    // 2. Se for indicado como Deezer ou não especificado, tenta Deezer primeiro
    if (isDeezer || !isItunes) {
      try {
        const res = await fetch(`https://api.deezer.com/album/${cleanId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && !data.error && data.title) {
            const result = this.parseDeezerAlbumDetails(data);
            this.albumCache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
          }
        }
      } catch (err) {
        console.warn('Deezer album lookup failed, trying iTunes fallback:', err);
      }
    }

    // 3. Consulta via iTunes Search API (catálogo oficial mundial da Apple)
    try {
      const itunesUrl = `https://itunes.apple.com/lookup?id=${cleanId}&entity=song`;
      const res = await fetch(itunesUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const result = this.parseItunesAlbumDetails(data.results);
          this.albumCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      }
    } catch (err) {
      console.warn('iTunes album lookup error:', err);
    }

    throw new Error('Não foi possível carregar as faixas deste álbum no momento.');
  }

  /**
   * Converte o payload de álbum oficial da Deezer API
   */
  private static parseDeezerAlbumDetails(data: any): AlbumDetailsResult {
    const artworkUrl =
      data.cover_xl ||
      data.cover_big ||
      data.cover_medium ||
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800';

    const releaseYear = data.release_date ? data.release_date.split('-')[0] : '2024';

    const album: Album = {
      id: `deezer_${data.id}`,
      title: data.title,
      artist: data.artist?.name || 'Artista',
      artistId: data.artist?.id ? `deezer_${data.artist.id}` : undefined,
      artworkUrl,
      releaseYear,
      releaseDate: data.release_date,
      totalTracks: data.nb_tracks || data.tracks?.data?.length || 0,
      genre: data.genres?.data?.[0]?.name,
      recordLabel: data.label,
      source: 'deezer',
    };

    const tracksData = data.tracks?.data || [];
    const tracks: Track[] = tracksData.map((item: any, index: number) => {
      return {
        id: `dz_track_${item.id}`,
        title: item.title_short || item.title,
        artist: item.artist?.name || album.artist,
        album: album.title,
        albumId: album.id,
        artworkUrl,
        audioUrl: item.preview || '', // Marcado para resolução de áudio completo em tempo real
        durationSeconds: item.duration || 180,
        trackNumber: item.track_position || index + 1,
        genre: album.genre,
        releaseDate: data.release_date,
      };
    });

    album.tracks = tracks;
    return { album, tracks };
  }

  /**
   * Converte o payload de coleção oficial da iTunes API
   */
  private static parseItunesAlbumDetails(results: any[]): AlbumDetailsResult {
    const collection = results.find((r) => r.wrapperType === 'collection') || results[0];
    const rawArtwork = collection.artworkUrl100 || '';
    const artworkUrl = rawArtwork
      ? rawArtwork.replace('100x100bb.jpg', '1000x1000bb.jpg')
      : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800';

    const releaseDate = collection.releaseDate || '';
    const releaseYear = releaseDate ? releaseDate.split('-')[0] : '2024';

    const album: Album = {
      id: `itunes_${collection.collectionId}`,
      title: collection.collectionName || collection.collectionCensoredName,
      artist: collection.artistName,
      artistId: collection.artistId ? `itunes_${collection.artistId}` : undefined,
      artworkUrl,
      releaseYear,
      releaseDate,
      totalTracks: collection.trackCount || 0,
      genre: collection.primaryGenreName,
      recordLabel: collection.copyright,
      source: 'itunes',
    };

    const trackResults = results.filter((r) => r.wrapperType === 'track');
    const tracks: Track[] = trackResults.map((item: any, index: number) => {
      const trackArt = item.artworkUrl100
        ? item.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg')
        : artworkUrl;

      return {
        id: `it_track_${item.trackId}`,
        title: item.trackName || item.trackCensoredName,
        artist: item.artistName || album.artist,
        album: album.title,
        albumId: album.id,
        artworkUrl: trackArt,
        audioUrl: item.previewUrl || '', // Marcado para resolução de áudio completo em tempo real
        durationSeconds: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 180,
        trackNumber: item.trackNumber || index + 1,
        genre: item.primaryGenreName || album.genre,
        releaseDate: item.releaseDate,
      };
    });

    // Ordena as faixas numericamente pela posição original no disco
    tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));

    album.tracks = tracks;
    return { album, tracks };
  }

  /**
   * Obtém a discografia completa de álbuns, EPs e lançamentos oficiais de um artista
   */
  static async getArtistDiscography(
    artistId: string,
    artistName?: string,
    sourceHint?: 'deezer' | 'itunes'
  ): Promise<Album[]> {
    const cleanId = artistId.replace(/^(deezer_|itunes_)/, '');
    const isDeezer = sourceHint === 'deezer' || artistId.startsWith('deezer_');
    const isItunes = sourceHint === 'itunes' || artistId.startsWith('itunes_');

    const cacheKey = `${artistId}_${artistName || ''}`;
    const cached = this.discographyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.albums;
    }

    const albums: Album[] = [];

    // 1. Tenta carregar discografia na Deezer API
    if (isDeezer || !isItunes) {
      try {
        const res = await fetch(`https://api.deezer.com/artist/${cleanId}/albums?limit=50`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            for (const item of json.data) {
              const cover =
                item.cover_xl ||
                item.cover_big ||
                item.cover_medium ||
                'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';
              const year = item.release_date ? item.release_date.split('-')[0] : '';

              albums.push({
                id: `deezer_${item.id}`,
                title: item.title,
                artist: artistName || 'Artista',
                artistId: `deezer_${cleanId}`,
                artworkUrl: cover,
                releaseYear: year,
                releaseDate: item.release_date,
                totalTracks: item.nb_tracks || 0,
                genre: item.record_type ? item.record_type.toUpperCase() : 'Álbum',
                source: 'deezer',
              });
            }
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar discografia Deezer:', e);
      }
    }

    // 2. Se vazio ou se iTunes foi especificado, consulta iTunes API
    if (albums.length === 0 && (isItunes || !isDeezer)) {
      try {
        const itunesUrl = `https://itunes.apple.com/lookup?id=${cleanId}&entity=album&limit=50`;
        const res = await fetch(itunesUrl);
        if (res.ok) {
          const json = await res.json();
          const items = (json.results || []).filter((r: any) => r.wrapperType === 'collection');
          for (const col of items) {
            const rawCover = col.artworkUrl100 || '';
            const cover = rawCover
              ? rawCover.replace('100x100bb.jpg', '600x600bb.jpg')
              : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500';
            const year = col.releaseDate ? col.releaseDate.split('-')[0] : '';

            albums.push({
              id: `itunes_${col.collectionId}`,
              title: col.collectionName,
              artist: col.artistName || artistName || 'Artista',
              artistId: `itunes_${cleanId}`,
              artworkUrl: cover,
              releaseYear: year,
              releaseDate: col.releaseDate,
              totalTracks: col.trackCount || 0,
              genre: col.primaryGenreName || 'Álbum',
              recordLabel: col.copyright,
              source: 'itunes',
            });
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar discografia iTunes:', e);
      }
    }

    // 3. Fallback: Se o ID não retornou álbuns mas temos o nome do artista, busca por termo de busca
    if (albums.length === 0 && artistName) {
      try {
        const searchAlbums = await this.searchAlbumsByArtist(artistName);
        albums.push(...searchAlbums);
      } catch {}
    }

    // Deduplica títulos de discos e ordena cronologicamente dos mais recentes aos mais antigos
    const uniqueMap = new Map<string, Album>();
    for (const alb of albums) {
      const norm = alb.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!uniqueMap.has(norm)) {
        uniqueMap.set(norm, alb);
      }
    }

    const uniqueAlbums = Array.from(uniqueMap.values()).sort((a, b) => {
      const yearA = parseInt(a.releaseYear, 10) || 0;
      const yearB = parseInt(b.releaseYear, 10) || 0;
      return yearB - yearA;
    });

    this.discographyCache.set(cacheKey, { albums: uniqueAlbums, timestamp: Date.now() });
    return uniqueAlbums;
  }

  /**
   * Busca álbuns pelo nome exato do artista (útil como fallback dinâmico)
   */
  private static async searchAlbumsByArtist(artistName: string): Promise<Album[]> {
    try {
      const res = await fetch(`https://api.deezer.com/search/album?q=${encodeURIComponent(artistName)}&limit=30`);
      if (!res.ok) return [];
      const json = await res.json();
      if (!json.data || !Array.isArray(json.data)) return [];

      return json.data.map((item: any) => ({
        id: `deezer_${item.id}`,
        title: item.title,
        artist: item.artist?.name || artistName,
        artistId: item.artist?.id ? `deezer_${item.artist.id}` : undefined,
        artworkUrl: item.cover_xl || item.cover_big || item.cover_medium,
        releaseYear: item.release_date ? item.release_date.split('-')[0] : '',
        totalTracks: item.nb_tracks || 0,
        source: 'deezer',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Pré-carrega o áudio completo de uma faixa do álbum usando StreamResolver
   */
  static async resolveTrackAudioStream(track: Track): Promise<string> {
    return await StreamResolver.resolveAudioStream(track);
  }
}
