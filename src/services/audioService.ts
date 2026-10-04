import { Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  AudioPlayer,
  AudioStatus,
} from 'expo-audio';
import { Track, PlaybackState } from '../types';

type Listener = (state: PlaybackState) => void;

class AudioService {
  private player: AudioPlayer | null = null;
  private statusSubscription: { remove: () => void } | null = null;
  private listeners: Set<Listener> = new Set();
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

      const sourceUri = (track.isDownloaded && track.localAudioUri)
        ? track.localAudioUri
        : track.audioUrl;

      const player = createAudioPlayer(sourceUri, {
        updateInterval: 350,
      });

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
    } catch (error) {
      console.error('Falha ao carregar áudio:', error);
      this.state.isLoading = false;
      this.state.isPlaying = false;
      this.notify();
    }
  }

  private onPlaybackStatusUpdate = (status: AudioStatus) => {
    if (!status.isLoaded) {
      this.state.isLoading = true;
      this.notify();
      return;
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
