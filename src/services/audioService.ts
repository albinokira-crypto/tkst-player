import { Platform, Alert, AppState } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  AudioPlayer,
  AudioStatus,
} from 'expo-audio';
import { Track, PlaybackState } from '../types';
import { StreamResolver } from './streamResolver';
import { PlaylistManager } from './playlistManager';

type Listener = (state: PlaybackState) => void;

class AudioService {
  private player: AudioPlayer | null = null;
  private activePlayers: Set<AudioPlayer> = new Set();
  private currentPlayRequestId = 0;
  private statusSubscription: { remove: () => void } | null = null;
  private listeners: Set<Listener> = new Set();
  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastLockScreenActionTime = 0;
  private state: PlaybackState = {
    currentTrack: null,
    isPlaying: false,
    positionMillis: 0,
    durationMillis: 1,
    isLoading: false,
    isBuffering: false,
    isShuffle: false,
    repeatMode: 'off',
    queue: [],
    currentIndex: -1,
    currentPlaylistId: null,
    currentPlaylistName: null,
  };

  constructor() {
    this.initAudioMode();
  }

  private async initAudioMode() {
    try {
      if (Platform.OS === 'android') {
        await requestNotificationPermissionsAsync().catch(() => {});
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
    } catch (e) {
      console.warn('Erro ao configurar modo de áudio:', e);
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn({ ...this.state }));
  }

  /**
   * Silencia e encerra um player nativo imediatamente para liberar buffers e foco de áudio
   */
  private silenceAndRemovePlayer(p: AudioPlayer) {
    try {
      p.muted = true;
      p.volume = 0;
    } catch {}
    try {
      p.setActiveForLockScreen(false);
    } catch {}
    try {
      p.clearLockScreenControls();
    } catch {}
    try {
      p.pause();
    } catch {}
    try {
      p.remove();
    } catch {}
  }

  /**
   * Destrói todos os players ativos e orfãos, garantindo que nenhum áudio continue em segundo plano
   */
  private destroyAllPlayers() {
    if (this.statusSubscription) {
      try {
        this.statusSubscription.remove();
      } catch {}
      this.statusSubscription = null;
    }

    if (this.player) {
      this.activePlayers.add(this.player);
      this.player = null;
    }

    for (const p of this.activePlayers) {
      this.silenceAndRemovePlayer(p);
    }
    this.activePlayers.clear();
  }

  /**
   * Encerra a reprodução por completo, remove a notificação do Android e reseta o estado
   */
  public async stop() {
    this.currentPlayRequestId++;
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    this.destroyAllPlayers();
    this.state.isPlaying = false;
    this.state.isLoading = false;
    this.state.isBuffering = false;
    this.state.positionMillis = 0;
    this.state.durationMillis = 1;
    this.state.currentTrack = null;
    this.state.queue = [];
    this.state.currentIndex = -1;
    this.state.currentPlaylistId = null;
    this.state.currentPlaylistName = null;
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      } catch {}
    }
    this.notify();
  }

  public async setQueue(
    tracks: Track[],
    startIndex = 0,
    playlistInfo?: { id?: string; name?: string }
  ) {
    this.currentPlayRequestId++;
    this.destroyAllPlayers();
    this.state.queue = [...tracks];
    this.state.currentIndex = startIndex;
    this.state.currentPlaylistId = playlistInfo?.id || null;
    this.state.currentPlaylistName = playlistInfo?.name || null;
    if (tracks[startIndex]) {
      await this.loadAndPlay(tracks[startIndex]);
    } else {
      this.notify();
    }
  }

  /**
   * Adiciona uma música à fila / playlist que estiver tocando
   */
  public async addTrackToQueue(track: Track, playNext = false): Promise<void> {
    if (this.state.queue.length === 0) {
      await this.setQueue([track], 0);
      return;
    }

    const updatedQueue = [...this.state.queue];
    if (playNext && this.state.currentIndex >= 0) {
      updatedQueue.splice(this.state.currentIndex + 1, 0, track);
    } else {
      updatedQueue.push(track);
    }
    this.state.queue = updatedQueue;

    // Se estiver tocando uma playlist salva, sincroniza com o PlaylistManager
    if (this.state.currentPlaylistId) {
      PlaylistManager.addTrackToPlaylist(this.state.currentPlaylistId, track).catch(() => {});
    }

    this.notify();
  }

  /**
   * Adiciona múltiplas faixas (ex: álbum) à fila / playlist que estiver tocando
   */
  public async addTracksToQueue(tracks: Track[]): Promise<void> {
    if (!tracks || tracks.length === 0) return;
    if (this.state.queue.length === 0) {
      await this.setQueue(tracks, 0);
      return;
    }

    this.state.queue = [...this.state.queue, ...tracks];

    if (this.state.currentPlaylistId) {
      PlaylistManager.addTracksToPlaylist(this.state.currentPlaylistId, tracks).catch(() => {});
    }

    this.notify();
  }

  /**
   * Move uma música para qualquer posição na fila / playlist tocando agora
   */
  public moveTrackInQueue(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.state.queue.length) return;
    if (toIndex < 0 || toIndex >= this.state.queue.length) return;
    if (fromIndex === toIndex) return;

    const updatedQueue = [...this.state.queue];
    const [moved] = updatedQueue.splice(fromIndex, 1);
    updatedQueue.splice(toIndex, 0, moved);
    this.state.queue = updatedQueue;

    // Ajusta o currentIndex para continuar apontando para a música certa
    if (this.state.currentIndex === fromIndex) {
      this.state.currentIndex = toIndex;
    } else if (fromIndex < this.state.currentIndex && toIndex >= this.state.currentIndex) {
      this.state.currentIndex -= 1;
    } else if (fromIndex > this.state.currentIndex && toIndex <= this.state.currentIndex) {
      this.state.currentIndex += 1;
    }

    // Se pertence a uma playlist salva, sincroniza a ordem persistente
    if (this.state.currentPlaylistId) {
      PlaylistManager.updatePlaylistTracks(this.state.currentPlaylistId, updatedQueue).catch(() => {});
    }

    this.notify();
  }

  /**
   * Remove uma faixa da fila pelo índice
   */
  public async removeTrackFromQueue(index: number): Promise<void> {
    if (index < 0 || index >= this.state.queue.length) return;

    const removedTrack = this.state.queue[index];
    const isRemovingCurrent = index === this.state.currentIndex;

    const updatedQueue = [...this.state.queue];
    updatedQueue.splice(index, 1);
    this.state.queue = updatedQueue;

    if (this.state.currentPlaylistId && removedTrack) {
      PlaylistManager.removeTrackFromPlaylist(this.state.currentPlaylistId, removedTrack.id).catch(() => {});
    }

    if (updatedQueue.length === 0) {
      await this.stop();
      return;
    }

    if (isRemovingCurrent) {
      const nextIndex = Math.min(index, updatedQueue.length - 1);
      this.state.currentIndex = nextIndex;
      await this.loadAndPlay(updatedQueue[nextIndex]);
    } else {
      if (index < this.state.currentIndex) {
        this.state.currentIndex -= 1;
      }
      this.notify();
    }
  }

  /**
   * Pula diretamente para uma faixa da fila pelo índice
   */
  public async skipToIndex(index: number): Promise<void> {
    if (index < 0 || index >= this.state.queue.length) return;
    this.state.currentIndex = index;
    await this.loadAndPlay(this.state.queue[index]);
  }

  public async loadAndPlay(track: Track) {
    const requestId = ++this.currentPlayRequestId;

    // 1. Corta qualquer áudio em reprodução de imediato
    this.destroyAllPlayers();

    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }

    this.state.isLoading = true;
    this.state.isBuffering = false;
    this.state.currentTrack = track;
    this.state.positionMillis = 0;
    this.notify();

    try {
      // 2. Resolução do stream de áudio (assíncrona)
      const sourceUri = await StreamResolver.resolveAudioStream(track);

      // 3. Se uma nova requisição foi feita enquanto esperava a rede, aborta esta
      if (this.currentPlayRequestId !== requestId) {
        return;
      }

      if (!sourceUri || typeof sourceUri !== 'string' || sourceUri.trim().length === 0) {
        throw new Error('Não foi possível obter o link de reprodução para esta faixa.');
      }

      // 4. Garante novamente que nenhum player anterior ficou vivo
      this.destroyAllPlayers();

      if (this.currentPlayRequestId !== requestId) {
        return;
      }

      const player = createAudioPlayer(sourceUri, {
        updateInterval: 350,
      });

      this.activePlayers.add(player);

      if (this.currentPlayRequestId !== requestId) {
        this.silenceAndRemovePlayer(player);
        this.activePlayers.delete(player);
        return;
      }

      this.player = player;

      // Timeout de segurança de 12 segundos para evitar spinner infinito
      this.loadingTimeout = setTimeout(() => {
        if (
          this.currentPlayRequestId === requestId &&
          this.state.isLoading &&
          (!this.state.isPlaying || this.state.positionMillis === 0)
        ) {
          console.warn('[AudioService] Timeout ao carregar faixa:', track.title);
          this.state.isLoading = false;
          this.state.isBuffering = false;
          this.notify();
          Alert.alert(
            'Falha no carregamento',
            'O servidor de áudio demorou muito para responder. Tente tocar novamente.'
          );
        }
      }, 12000);

      try {
        player.setActiveForLockScreen(
          true,
          {
            title: track.title,
            artist: track.artist,
            albumTitle: this.state.currentPlaylistName || 'TKST Player',
            artworkUrl: track.artworkUrl,
          },
          {
            showSeekForward: true,
            showSeekBackward: true,
          }
        );
      } catch (lockErr) {
        console.warn('Aviso lockscreen player:', lockErr);
      }

      this.updateWebMediaSession(track);

      this.statusSubscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (this.currentPlayRequestId === requestId && this.player === player) {
          this.onPlaybackStatusUpdate(status);
        }
      });

      player.play();
    } catch (error: any) {
      if (this.currentPlayRequestId !== requestId) {
        return; // Requisição descartada
      }
      console.error('Falha ao carregar áudio:', error);
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      this.state.isLoading = false;
      this.state.isPlaying = false;
      this.notify();
      Alert.alert(
        'Erro na Reprodução',
        'Não foi possível reproduzir esta faixa no momento. Tente novamente ou escolha outra música.'
      );
    }
  }

  private updateWebMediaSession(track: Track) {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: this.state.currentPlaylistName || 'TKST Player',
          artwork: track.artworkUrl
            ? [
                { src: track.artworkUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: track.artworkUrl, sizes: '256x256', type: 'image/jpeg' },
                { src: track.artworkUrl, sizes: '512x512', type: 'image/jpeg' },
              ]
            : [],
        });
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
        navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime != null) this.seekTo(details.seekTime * 1000);
        });
      } catch (e) {
        console.warn('Aviso mediaSession web:', e);
      }
    }
  }

  private onPlaybackStatusUpdate = (status: AudioStatus) => {
    if (!status.isLoaded) {
      if ((status as any).error) {
        console.warn('[AudioService] Erro no player:', (status as any).error);
        if (this.loadingTimeout) {
          clearTimeout(this.loadingTimeout);
          this.loadingTimeout = null;
        }
        this.state.isLoading = false;
        this.state.isPlaying = false;
        this.notify();
        return;
      }
      this.state.isLoading = true;
      this.notify();
      return;
    }

    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }

    const newPositionMillis = Math.round(status.currentTime * 1000);
    const prevPositionMillis = this.state.positionMillis;

    // Detecção inteligente de comandos na tela de bloqueio do Android:
    // Quando o app está em background ou com a tela bloqueada (AppState !== 'active')
    // e o usuário toca no botão de avançar da notificação/lockscreen, o expo-audio dispara seek de ~10s.
    // Interpretamos esse salto na tela bloqueada como o comando do usuário para passar a música!
    if (
      AppState.currentState !== 'active' &&
      this.state.isPlaying &&
      prevPositionMillis > 500 &&
      newPositionMillis - prevPositionMillis >= 7500 &&
      newPositionMillis - prevPositionMillis <= 13000
    ) {
      const now = Date.now();
      if (now - this.lastLockScreenActionTime > 1500) {
        this.lastLockScreenActionTime = now;
        console.log('[AudioService] Botão avançar acionado na tela bloqueada -> Pular música');
        this.next();
        return;
      }
    } else if (
      AppState.currentState !== 'active' &&
      this.state.isPlaying &&
      prevPositionMillis >= 7500 &&
      prevPositionMillis - newPositionMillis >= 7500 &&
      prevPositionMillis - newPositionMillis <= 13000
    ) {
      const now = Date.now();
      if (now - this.lastLockScreenActionTime > 1500) {
        this.lastLockScreenActionTime = now;
        console.log('[AudioService] Botão retroceder acionado na tela bloqueada -> Voltar música');
        this.previous();
        return;
      }
    }

    // Suporte caso o módulo nativo envie evento de ação explícito
    if ((status as any)?.lockScreenAction === 'next') {
      const now = Date.now();
      if (now - this.lastLockScreenActionTime > 1500) {
        this.lastLockScreenActionTime = now;
        this.next();
        return;
      }
    } else if ((status as any)?.lockScreenAction === 'previous') {
      const now = Date.now();
      if (now - this.lastLockScreenActionTime > 1500) {
        this.lastLockScreenActionTime = now;
        this.previous();
        return;
      }
    }

    this.state.isPlaying = status.playing;
    this.state.positionMillis = newPositionMillis;
    this.state.durationMillis = Math.max(1, Math.round(status.duration * 1000));
    this.state.isBuffering = status.isBuffering;
    this.state.isLoading = false;

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = status.playing ? 'playing' : 'paused';
      } catch {}
    }

    if (status.didJustFinish) {
      this.handleTrackFinished();
    } else {
      this.notify();
    }
  };

  private async handleTrackFinished() {
    if (this.state.repeatMode === 'track' && this.player) {
      await this.player.seekTo(0);
      this.player.play();
      return;
    }

    if (this.canGoNext()) {
      await this.next();
    } else if (this.state.repeatMode === 'queue' && this.state.queue.length > 0) {
      this.state.currentIndex = 0;
      await this.loadAndPlay(this.state.queue[0]);
    } else {
      this.state.isPlaying = false;
      this.notify();
    }
  }

  public async togglePlayPause() {
    if (!this.player) {
      if (this.state.currentTrack) {
        await this.loadAndPlay(this.state.currentTrack);
      }
      return;
    }
    if (this.state.isPlaying) {
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      this.state.isLoading = false;
      this.state.isPlaying = false;
      this.player.pause();
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'paused';
        } catch {}
      }
      this.notify();
    } else {
      this.player.play();
      this.state.isPlaying = true;
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'playing';
        } catch {}
      }
      this.notify();
    }
  }

  public async seekTo(millis: number) {
    if (this.player) {
      await this.player.seekTo(millis / 1000);
    }
  }

  public async next() {
    if (this.state.queue.length === 0) return;
    let nextIndex = this.state.currentIndex + 1;

    if (this.state.isShuffle) {
      nextIndex = Math.floor(Math.random() * this.state.queue.length);
    }

    if (nextIndex < this.state.queue.length) {
      this.state.currentIndex = nextIndex;
      await this.loadAndPlay(this.state.queue[nextIndex]);
    }
  }

  public async previous() {
    if (this.state.queue.length === 0) return;
    if (this.state.positionMillis > 3000 && this.player) {
      await this.player.seekTo(0);
      return;
    }
    const prevIndex = Math.max(0, this.state.currentIndex - 1);
    this.state.currentIndex = prevIndex;
    await this.loadAndPlay(this.state.queue[prevIndex]);
  }

  public toggleShuffle() {
    this.state.isShuffle = !this.state.isShuffle;
    this.notify();
  }

  public toggleRepeat() {
    const modes: Array<'off' | 'track' | 'queue'> = ['off', 'queue', 'track'];
    const curr = modes.indexOf(this.state.repeatMode);
    this.state.repeatMode = modes[(curr + 1) % modes.length];
    this.notify();
  }

  public canGoNext(): boolean {
    return this.state.currentIndex < this.state.queue.length - 1;
  }

  public getState(): PlaybackState {
    return this.state;
  }
}

export const audioService = new AudioService();
