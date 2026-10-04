export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl: string;
  audioUrl: string;
  durationSeconds: number;
  isDownloaded?: boolean;
  localAudioUri?: string;
  genre?: string;
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: string;
  tracksCount?: number;
}

export interface PlaybackState {
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isLoading: boolean;
  isBuffering: boolean;
  isShuffle: boolean;
  repeatMode: 'off' | 'track' | 'queue';
  queue: Track[];
  currentIndex: number;
}
