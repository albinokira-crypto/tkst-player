import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, Album } from '../types';
import { StreamResolver } from './streamResolver';

const DOWNLOAD_DIR = `${FileSystem.documentDirectory}tracks/`;
const OFFLINE_INDEX_KEY = '@tkst_offline_tracks_v1';
const OFFLINE_ALBUMS_KEY = '@tkst_offline_albums_v1';

export class DownloadManager {
  private static async ensureDirectoryExists(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
    }
  }

  static async getDownloadedTracks(): Promise<Track[]> {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static async isTrackDownloaded(trackId: string): Promise<boolean> {
    const tracks = await this.getDownloadedTracks();
    return tracks.some((t) => t.id === trackId);
  }

  static async downloadTrack(
    track: Track,
    onProgress?: (progress: number) => void
  ): Promise<Track> {
    await this.ensureDirectoryExists();
    const cleanId = track.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const localUri = `${DOWNLOAD_DIR}${cleanId}.mp3`;

    // Garante que o download baixa a música inteira e não apenas a prévia de 30s
    const fullAudioUrl = await StreamResolver.resolveAudioStream(track);

    const downloadResumable = FileSystem.createDownloadResumable(
      fullAudioUrl,
      localUri,
      {},
      (downloadProgress) => {
        const total = downloadProgress.totalBytesExpectedToWrite || 1;
        const progress = downloadProgress.totalBytesWritten / total;
        if (onProgress) onProgress(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      throw new Error('Falha ao descarregar áudio.');
    }

    const downloadedTrack: Track = {
      ...track,
      audioUrl: fullAudioUrl,
      isDownloaded: true,
      localAudioUri: result.uri,
    };

    const currentList = await this.getDownloadedTracks();
    const updatedList = [
      ...currentList.filter((t) => t.id !== track.id),
      downloadedTrack,
    ];
    await AsyncStorage.setItem(OFFLINE_INDEX_KEY, JSON.stringify(updatedList));

    return downloadedTrack;
  }

  static async removeDownloadedTrack(trackId: string): Promise<void> {
    const tracks = await this.getDownloadedTracks();
    const target = tracks.find((t) => t.id === trackId);
    if (target && target.localAudioUri) {
      const fileInfo = await FileSystem.getInfoAsync(target.localAudioUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(target.localAudioUri, { idempotent: true });
      }
    }
    const updated = tracks.filter((t) => t.id !== trackId);
    await AsyncStorage.setItem(OFFLINE_INDEX_KEY, JSON.stringify(updated));
  }

  /**
   * Baixa um álbum completo em lote (faixa a faixa), atualizando o progresso
   */
  static async downloadAlbum(
    album: Album,
    tracks: Track[],
    onProgress?: (
      completedCount: number,
      totalCount: number,
      currentTrack: Track,
      trackProgress: number
    ) => void
  ): Promise<{ success: boolean; downloadedTracks: Track[] }> {
    await this.ensureDirectoryExists();
    const downloadedTracks: Track[] = [];

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      try {
        if (onProgress) {
          onProgress(i, tracks.length, track, 0);
        }

        const downloaded = await this.downloadTrack(track, (trackProgress) => {
          if (onProgress) {
            onProgress(i, tracks.length, track, trackProgress);
          }
        });

        downloadedTracks.push(downloaded);
      } catch (err) {
        console.warn(`[DownloadManager] Falha ao baixar faixa ${track.title} do álbum ${album.title}:`, err);
      }
    }

    // Registra o álbum como salvo offline
    try {
      const existingAlbums = await this.getDownloadedAlbums();
      const updatedAlbum: Album = {
        ...album,
        tracks: downloadedTracks,
      };
      const filtered = existingAlbums.filter((a) => a.id !== album.id);
      await AsyncStorage.setItem(OFFLINE_ALBUMS_KEY, JSON.stringify([...filtered, updatedAlbum]));
    } catch (saveErr) {
      console.warn('[DownloadManager] Erro ao salvar índice de álbum offline:', saveErr);
    }

    if (onProgress && tracks.length > 0) {
      onProgress(tracks.length, tracks.length, tracks[tracks.length - 1], 1);
    }

    return {
      success: downloadedTracks.length > 0,
      downloadedTracks,
    };
  }

  /**
   * Retorna todos os álbuns disponíveis para reprodução offline
   */
  static async getDownloadedAlbums(): Promise<Album[]> {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_ALBUMS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Verifica se o álbum especificado já está salvo offline
   */
  static async isAlbumDownloaded(albumId: string): Promise<boolean> {
    const albums = await this.getDownloadedAlbums();
    return albums.some((a) => a.id === albumId);
  }

  /**
   * Remove todas as faixas e metadados de um álbum baixado
   */
  static async removeDownloadedAlbum(albumId: string): Promise<void> {
    const albums = await this.getDownloadedAlbums();
    const target = albums.find((a) => a.id === albumId);
    if (target && target.tracks) {
      for (const t of target.tracks) {
        await this.removeDownloadedTrack(t.id).catch(() => {});
      }
    }
    const updated = albums.filter((a) => a.id !== albumId);
    await AsyncStorage.setItem(OFFLINE_ALBUMS_KEY, JSON.stringify(updated));
  }
}

