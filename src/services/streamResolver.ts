import CryptoJS from 'crypto-js';
import { Track } from '../types';

const SAAVN_KEY = CryptoJS.enc.Utf8.parse('38346591');
const AUDIUS_APP_NAME = 'TKST_PLAYER_APP';
const AUDIUS_FALLBACK_HOST = 'https://audius-discovery-1.cultur3stake.com';

// Cache em memória para evitar requisições repetidas na mesma faixa
const resolvedStreamCache = new Map<string, { url: string; duration?: number; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutos (evita assinaturas expiradas do CloudFront)

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
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(enc),
      });
      const decrypted = CryptoJS.DES.decrypt(
        cipherParams,
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
   * Expressão regular rigorosa para barrar faixas instrumentais, karaokê ou tributos
   */
  private static readonly BLACKLIST_REGEX =
    /(karaoke|instrumental|tribute|originally performed|backing track|karaokê|ringtone|toque de celular|sem voz|minus one|play along|playback|versão instrumental|zzang)/i;

  /**
   * Limpa e gera variantes de termos de busca inteligentes para máxima precisão
   */
  public static cleanQueries(artist: string, title: string): string[] {
    const isBogusArtist =
      !artist ||
      artist === 'Artista' ||
      /^\d+:\d{2}(:\d{2})?$/.test(artist.trim()) ||
      artist.length > 50;

    let cleanT = title
      .replace(/[\(\[](ao vivo|clipe oficial|official.*|audio oficial|video oficial|áudio oficial|vídeo oficial|lyric video|acústico|remastered|remasterizada|versão.*|dvd.*|hd|4k|preview)[\)\]]/gi, '')
      .replace(/#\w+/g, '')
      .trim();

    const queries: string[] = [];

    // Se o título já tiver o formato "Artista - Música"
    if (cleanT.includes(' - ')) {
      queries.push(cleanT.replace(/\s+/g, ' ').trim());
    }

    if (!isBogusArtist) {
      if (!cleanT.toLowerCase().includes(artist.toLowerCase())) {
        queries.push(`${artist} ${cleanT}`.replace(/\s+/g, ' ').trim());
      } else {
        queries.push(cleanT.replace(/\s+/g, ' ').trim());
      }
    } else {
      queries.push(cleanT.replace(/\s+/g, ' ').trim());
    }

    // Tenta também removendo participações especiais (feat. / part.)
    const noFeat = cleanT
      .replace(/[\(\[](part\.|feat\.|ft\.)[^\)\]]+[\)\]]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (noFeat !== cleanT && noFeat.length > 2) {
      if (!isBogusArtist && !noFeat.toLowerCase().includes(artist.toLowerCase())) {
        queries.push(`${artist} ${noFeat}`.trim());
      } else {
        queries.push(noFeat);
      }
    }

    return [...new Set(queries.filter((q) => q.length > 1))];
  }

  /**
   * Busca stream completo no SoundCloud (Progressive MP3 de alta fidelidade e com vocais reais)
   */
  private static async resolveFromSoundCloud(artist: string, title: string): Promise<{ url: string; duration: number } | null> {
    try {
      const clientId = await this.getSoundCloudClientId();
      const queries = this.cleanQueries(artist, title);

      for (const q of queries) {
        const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=10`;

        const res = await fetch(searchUrl);
        if (!res.ok) continue;

        const data = await res.json();
        const candidates = (data.collection || []).filter((t: any) => {
          if (!t.duration || t.duration < 60000) return false;
          // Rejeita estritamente se for instrumental ou karaokê
          if (this.BLACKLIST_REGEX.test(t.title || '') || this.BLACKLIST_REGEX.test(t.user?.username || '')) {
            return false;
          }
          return true;
        });

        for (const track of candidates) {
          // 1. Tenta progressive MP3 direto
          const progressive = track.media?.transcodings?.find((tr: any) => tr.format?.protocol === 'progressive');
          if (progressive) {
            try {
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
            } catch {}
          }

          // 2. Tenta HLS stream (.m3u8) nativo para expo-audio
          const hls = track.media?.transcodings?.find((tr: any) => tr.format?.protocol === 'hls');
          if (hls) {
            try {
              const hRes = await fetch(`${hls.url}?client_id=${clientId}`);
              if (hRes.ok) {
                const hData = await hRes.json();
                if (hData.url) {
                  return {
                    url: hData.url,
                    duration: Math.round(track.duration / 1000),
                  };
                }
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('SoundCloud resolve error:', e);
    }
    return null;
  }

  /**
   * Busca stream completo no JioSaavn (Apenas músicas reais com vocal comprovado, sem karaokê)
   */
  private static async resolveFromSaavn(artist: string, title: string): Promise<{ url: string; duration: number } | null> {
    try {
      const queries = this.cleanQueries(artist, title);
      for (const q of queries) {
        const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=6&p=1&q=${encodeURIComponent(q)}&_marker=0&ctx=web6dot0`;

        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) continue;

        const data = await res.json();
        if (!data.results || !data.results.length) continue;

        for (const item of data.results) {
          const dur = parseInt(item.duration, 10);
          const songTitle = item.song || item.title || '';
          const singers = item.singers || item.primary_artists || '';

          if (this.BLACKLIST_REGEX.test(songTitle) || this.BLACKLIST_REGEX.test(singers)) {
            continue;
          }

          if (dur > 60 && item.encrypted_media_url) {
            const streamUrl = this.decryptSaavn(item.encrypted_media_url);
            if (streamUrl) {
              return { url: streamUrl, duration: dur };
            }
          }
        }
      }
    } catch (e) {
      console.warn('Saavn resolve error:', e);
    }
    return null;
  }

  /**
   * Busca stream completo na Audius API
   */
  private static async resolveFromAudius(artist: string, title: string): Promise<{ url: string; duration: number } | null> {
    try {
      const queries = this.cleanQueries(artist, title);
      const hostRes = await fetch('https://api.audius.co');
      const hostJson = await hostRes.json();
      const host = hostJson.data?.[0] || AUDIUS_FALLBACK_HOST;

      for (const q of queries) {
        const res = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${AUDIUS_APP_NAME}`);
        if (!res.ok) continue;

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
      }
    } catch {}
    return null;
  }

  /**
   * Resolve e valida a URL direta de áudio COMPLETO para reprodução e download.
   * Substitui automaticamente prévias curtas (30s) por streams integrais de alta qualidade.
   * Revalida links expirados salvos em playlists para garantir reprodução imediata.
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

    // 3. Se a faixa possui uma URL de transcodificação do SoundCloud (api-v2.soundcloud.com/media)
    if (track.audioUrl && track.audioUrl.includes('api-v2.soundcloud.com/media')) {
      try {
        const clientId = await this.getSoundCloudClientId();
        const cleanBase = track.audioUrl.split('?')[0];
        const scUrlWithClient = `${cleanBase}?client_id=${clientId}`;
        const sRes = await fetch(scUrlWithClient);
        if (sRes.ok) {
          const sJson = await sRes.json();
          if (sJson.url) {
            resolvedStreamCache.set(track.id, { url: sJson.url, duration: track.durationSeconds, timestamp: Date.now() });
            track.audioUrl = sJson.url;
            return sJson.url;
          }
        }
      } catch (e) {
        console.warn('Erro ao resolver transcodificação SoundCloud:', e);
      }
      // Se a URL de transcodificação expirou, limpa para resolver fresh
      track.audioUrl = '';
    }

    // 4. Se a URL salva é uma URL assinada temporária (ex: CloudFront do SoundCloud com expiração)
    // Links salvos no banco local de playlists podem ter expirado
    if (track.audioUrl && (track.audioUrl.includes('sndcdn.com') || track.audioUrl.includes('Signature='))) {
      const isPlayable = await this.testStreamPlayability(track.audioUrl, 2000);
      if (!isPlayable) {
        console.log(`[StreamResolver] URL assinada expirada para "${track.title}". Re-resolvendo fresh...`);
        track.audioUrl = '';
      }
    }

    // 5. Se a URL atual já é uma música completa verificada e válida
    const isShortPreview =
      !track.audioUrl ||
      track.audioUrl.includes('dzcdn.net') ||
      track.audioUrl.includes('audio-ssl.itunes.apple.com') ||
      track.audioUrl.includes('preview') ||
      (track.durationSeconds && track.durationSeconds <= 35);

    if (track.audioUrl && !isShortPreview && track.audioUrl.startsWith('http') && !track.audioUrl.includes('api-v2.soundcloud.com')) {
      return track.audioUrl;
    }

    console.log(`[StreamResolver] Resolvendo áudio completo vocal para: "${track.artist} - ${track.title}"`);

    // 6. Prioridade 1: SoundCloud (Músicas completas com vocais originais)
    const scRes = await this.resolveFromSoundCloud(track.artist, track.title);
    if (scRes) {
      track.durationSeconds = scRes.duration;
      track.audioUrl = scRes.url;
      resolvedStreamCache.set(track.id, { url: scRes.url, duration: scRes.duration, timestamp: Date.now() });
      return scRes.url;
    }

    // 7. Prioridade 2: JioSaavn (Apenas músicas reais verificadas, sem karaokê)
    const saavnRes = await this.resolveFromSaavn(track.artist, track.title);
    if (saavnRes) {
      track.durationSeconds = saavnRes.duration;
      track.audioUrl = saavnRes.url;
      resolvedStreamCache.set(track.id, { url: saavnRes.url, duration: saavnRes.duration, timestamp: Date.now() });
      return saavnRes.url;
    }

    // 8. Prioridade 3: Audius (Acervo alternativo completo)
    const audiusRes = await this.resolveFromAudius(track.artist, track.title);
    if (audiusRes) {
      track.durationSeconds = audiusRes.duration;
      track.audioUrl = audiusRes.url;
      resolvedStreamCache.set(track.id, { url: audiusRes.url, duration: audiusRes.duration, timestamp: Date.now() });
      return audiusRes.url;
    }

    // 9. Fallback final
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
