import { Track } from '../types';

export class StreamResolver {
  /**
   * Resolve e valida a URL direta de áudio para reprodução e download.
   * Suporta arquivos locais (.mp3 baixados), links do Deezer (.mp3),
   * iTunes (.m4a / aac) e Audius.
   */
  static async resolveAudioStream(track: Track): Promise<string> {
    // 1. Se a faixa já foi baixada no dispositivo, prioriza o arquivo local
    if (track.isDownloaded && track.localAudioUri) {
      return track.localAudioUri;
    }

    // 2. Se a faixa já possui uma URL válida e completa
    if (track.audioUrl && track.audioUrl.startsWith('http')) {
      return track.audioUrl;
    }

    // 3. Resolução dinâmica baseada no ID / Provedor
    try {
      if (track.id.startsWith('dz_')) {
        const rawId = track.id.replace('dz_', '');
        const res = await fetch(`https://api.deezer.com/track/${rawId}`);
        const data = await res.json();
        if (data.preview) {
          return data.preview;
        }
      }

      if (track.id.startsWith('it_')) {
        const rawId = track.id.replace('it_', '');
        const res = await fetch(`https://itunes.apple.com/lookup?id=${rawId}`);
        const data = await res.json();
        if (data.results?.[0]?.previewUrl) {
          return data.results[0].previewUrl;
        }
      }

      // 4. Fallback de busca cruzada por Artista + Título
      const fallbackQuery = `${track.artist} ${track.title}`;
      const searchRes = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(fallbackQuery)}&limit=1`
      );
      const searchData = await searchRes.json();
      if (searchData.data?.[0]?.preview) {
        return searchData.data[0].preview;
      }

      // Fallback secundário no iTunes
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(fallbackQuery)}&entity=song&limit=1`
      );
      const itunesData = await itunesRes.json();
      if (itunesData.results?.[0]?.previewUrl) {
        return itunesData.results[0].previewUrl;
      }
    } catch (error) {
      console.warn('Erro ao resolver stream de áudio:', error);
    }

    // Retorna a URL original como fallback
    return track.audioUrl || '';
  }

  /**
   * Testa a disponibilidade do fluxo de áudio fazendo uma requisição rápida (HEAD/Range).
   */
  static async testStreamPlayability(url: string, timeoutMs = 4000): Promise<boolean> {
    if (!url) return false;
    if (url.startsWith('file://')) return true;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timer);

      return res.ok || res.status === 206;
    } catch {
      return false;
    }
  }

  /**
   * Formata segundos em mm:ss
   */
  static formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0:00';
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}
