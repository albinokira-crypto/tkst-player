import { Platform, Alert } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  AudioPlayer,
  AudioStatus,
} from 'expo-audio';
import { Track, PlaybackState } from '../types';
import { StreamResolver } from './streamResolver';

type Listener = (state: PlaybackState) => void;

class AudioService {
  private player: AudioPlayer | null = null;
  private activePlayers: Set<AudioPlayer> = new Set();
  private currentPlayRequestId = 0;
  private statusSubscription: { remove: () => void } | null = null;
  private listeners: Set<Listener> = new Set();
  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;
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
    this.notify();
  }

  public async setQueue(tracks: Track[], startIndex = 0) {
    this.currentPlayRequestId++;
    this.destroyAllPlayers();
    this.state.queue = [...tracks];
    this.state.currentIndex = startIndex;
    if (tracks[startIndex]) {
      await this.loadAndPlay(tracks[startIndex]);
    }
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
            albumTitle: 'TKST Player',
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

    this.state.isPlaying = status.playing;
    this.state.positionMillis = Math.round(status.currentTime * 1000);
    this.state.durationMillis = Math.max(1, Math.round(status.duration * 1000));
    this.state.isBuffering = status.isBuffering;
    this.state.isLoading = false;

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
      this.notify();
    } else {
      this.player.play();
      this.state.isPlaying = true;
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
