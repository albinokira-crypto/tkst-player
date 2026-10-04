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

  public async setQueue(tracks: Track[], startIndex = 0) {
    this.state.queue = [...tracks];
    this.state.currentIndex = startIndex;
    if (tracks[startIndex]) {
      await this.loadAndPlay(tracks[startIndex]);
    }
  }

  public async loadAndPlay(track: Track) {
    this.state.isLoading = true;
    this.state.currentTrack = track;
    this.notify();

    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }

    try {
      if (this.statusSubscription) {
        this.statusSubscription.remove();
        this.statusSubscription = null;
      }
      if (this.player) {
        try {
          this.player.clearLockScreenControls();
        } catch {}
        this.player.pause();
        this.player.remove();
        this.player = null;
      }

      const sourceUri = await StreamResolver.resolveAudioStream(track);

      if (!sourceUri || typeof sourceUri !== 'string' || sourceUri.trim().length === 0) {
        throw new Error('Não foi possível obter o link de reprodução para esta faixa.');
      }

      const player = createAudioPlayer(sourceUri, {
        updateInterval: 350,
      });

      // Timeout de segurança de 12 segundos para evitar spinner infinito
      this.loadingTimeout = setTimeout(() => {
        if (this.state.isLoading && (!this.state.isPlaying || this.state.positionMillis === 0)) {
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
        this.onPlaybackStatusUpdate(status);
      });

      this.player = player;
      player.play();
    } catch (error: any) {
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
      this.player.pause();
    } else {
      this.player.play();
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
