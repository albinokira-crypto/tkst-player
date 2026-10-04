import CryptoJS from 'crypto-js';
import { Track } from '../types';

const SAAVN_KEY = CryptoJS.enc.Utf8.parse('38346591');
const AUDIUS_APP_NAME = 'TKST_PLAYER_APP';
const AUDIUS_FALLBACK_HOST = 'https://audius-discovery-1.cultur3stake.com';

// Cache em memória para evitar requisições repetidas na mesma faixa
const resolvedStreamCache = new Map<string, { url: string; duration?: number; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutos

let cachedScClientId = 'dkevB9EsY4jIoSm8RfddPNUKyn6hurXF';
let scClientTimestamp = 0;

export class StreamResolver {
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
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
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
   * Decodifica a URL criptografada do JioSaavn via algoritmo DES-ECB
   */
  private static decryptSaavn(enc: string): string | null {
    try {
      const decrypted = CryptoJS.DES.decrypt(
        { ciphertext: CryptoJS.enc.Base64.parse(enc) },
        SAAVN_KEY,
        { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
      );
      const url = decrypted.toString(CryptoJS.enc.Utf8);
      if (!url) return null;
      // Retorna em alta qualidade 160kbps AAC (muito mais rápido e fluido no mobile)
      return url.replace('_96.mp4', '_160.mp4');
    } catch {
      return null;
    }
  }

  /**
   * Busca stream completo no JioSaavn (Acervo Global Comercial com músicas inteiras)
   */
  private static async resolveFromSaavn(artist: string, title: string): Promise<{ url: string; duration: number } | null> {
    try {
      // Remove termos extras de versão preview para encontrar a versão inteira
      const cleanTitle = title.replace(/\(preview\)/gi, '').replace(/\[preview\]/gi, '').trim();
      const q = `${artist} ${cleanTitle}`.trim();
      const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=5&p=1&q=${encodeURIComponent(q)}&_marker=0&ctx=web6dot0`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.results || !data.results.length) return null;

      for (const item of data.results) {
        const dur = parseInt(item.duration, 10);
        // Filtra músicas com duração completa (> 60 segundos)
        if (dur > 60 && item.encrypted_media_url) {
          const streamUrl = this.decryptSaavn(item.encrypted_media_url);
          if (streamUrl) {
            return { url: streamUrl, duration: dur };
          }
        }
      }
    } catch (e) {
      console.warn('Saavn resolve error:', e);
    }
    return null;
  }

  /**
   * Busca stream completo no SoundCloud (Progressive MP3 de alta fidelidade)
   */
  private static async resolveFromSoundCloud(artist: string, title: string): Promise<{ url: string; duration: number } | null> {
    try {
      const clientId = await this.getSoundCloudClientId();
      const cleanTitle = title.replace(/\(preview\)/gi, '').trim();
      const q = `${artist} ${cleanTitle}`.trim();
      const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=10`;

      const res = await fetch(searchUrl);
      if (!res.ok) return null;

      const data = await res.json();
      const fullTracks = (data.collection || []).filter((t: any) => t.duration > 75000); // Acima de 75 segundos = música completa

      for (const track of fullTracks) {
        const progressive = track.media?.transcodings?.find((tr: any) => tr.format?.protocol === 'progressive');
        if (progressive) {
          const sRes = await fetch(`${progressive.url}?client_id=${clientId}`);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.url) {
              return {
                url: sData.url,
                duration: Math.round(track.duration / 1000),
              };
            }
          }
        }
      }
    } catch (e) {
      console.warn('SoundCloud resolve error:', e);
    }
    return null;
  }

  /**
   * Busca stream completo na Audius API
   */
  private static async resolveFromAudius(artist: string, title: string): Promise<{ url: string; duration: number } | null> {
    try {
      const q = `${artist} ${title}`.trim();
      const hostRes = await fetch('https://api.audius.co');
      const hostJson = await hostRes.json();
      const host = hostJson.data?.[0] || AUDIUS_FALLBACK_HOST;

      const res = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${AUDIUS_APP_NAME}`);
      if (!res.ok) return null;

      const json = await res.json();
      if (json.data && json.data.length > 0) {
        const item = json.data[0];
        if (item.duration && item.duration > 60) {
          return {
            url: `${host}/v1/tracks/${item.id}/stream?app_name=${AUDIUS_APP_NAME}`,
            duration: item.duration,
          };
        }
      }
    } catch {}
    return null;
  }

  /**
   * Resolve e valida a URL direta de áudio COMPLETO para reprodução e download.
   * Substitui automaticamente prévias curtas (30s) por streams integrais de alta qualidade.
   */
  static async resolveAudioStream(track: Track): Promise<string> {
    // 1. Se a faixa já foi baixada no dispositivo, prioriza o arquivo local
    if (track.isDownloaded && track.localAudioUri) {
      return track.localAudioUri;
    }

    // 2. Verifica se já está no cache recente
    const cached = resolvedStreamCache.get(track.id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (cached.duration && (!track.durationSeconds || track.durationSeconds < 60)) {
        track.durationSeconds = cached.duration;
      }
      return cached.url;
    }

    // 3. Verifica se a URL atual já é uma música completa (não é prévia de 30s de Deezer/iTunes)
    const isShortPreview =
      !track.audioUrl ||
      track.audioUrl.includes('dzcdn.net') ||
      track.audioUrl.includes('audio-ssl.itunes.apple.com') ||
      track.audioUrl.includes('preview') ||
      (track.durationSeconds && track.durationSeconds <= 35);

    if (track.audioUrl && !isShortPreview && track.audioUrl.startsWith('http')) {
      return track.audioUrl;
    }

    console.log(`[StreamResolver] Resolvendo áudio completo para: "${track.artist} - ${track.title}"`);

    // 4. Prioridade 1: JioSaavn (Músicas originais comerciais de catálogo global, 160kbps AAC completo)
    const saavnRes = await this.resolveFromSaavn(track.artist, track.title);
    if (saavnRes) {
      track.durationSeconds = saavnRes.duration;
      track.audioUrl = saavnRes.url;
      resolvedStreamCache.set(track.id, { url: saavnRes.url, duration: saavnRes.duration, timestamp: Date.now() });
      return saavnRes.url;
    }

    // 5. Prioridade 2: SoundCloud (Versões completas, ao vivo, singles e lançamentos brasileiros/globais)
    const scRes = await this.resolveFromSoundCloud(track.artist, track.title);
    if (scRes) {
      track.durationSeconds = scRes.duration;
      track.audioUrl = scRes.url;
      resolvedStreamCache.set(track.id, { url: scRes.url, duration: scRes.duration, timestamp: Date.now() });
      return scRes.url;
    }

    // 6. Prioridade 3: Audius (Acervo indie/eletrônico completo)
    const audiusRes = await this.resolveFromAudius(track.artist, track.title);
    if (audiusRes) {
      track.durationSeconds = audiusRes.duration;
      track.audioUrl = audiusRes.url;
      resolvedStreamCache.set(track.id, { url: audiusRes.url, duration: audiusRes.duration, timestamp: Date.now() });
      return audiusRes.url;
    }

    // 7. Fallback: Se não encontrou áudio completo em nenhuma fonte, mantém o áudio original
    return track.audioUrl || '';
  }

  /**
   * Testa a disponibilidade do fluxo de áudio fazendo uma requisição rápida (HEAD).
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
