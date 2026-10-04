import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../types';
import { StreamResolver } from './streamResolver';

const DOWNLOAD_DIR = `${FileSystem.documentDirectory}tracks/`;
const OFFLINE_INDEX_KEY = '@tkst_offline_tracks_v1';

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
}
