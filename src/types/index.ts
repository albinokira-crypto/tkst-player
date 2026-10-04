export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  artworkUrl: string;
  audioUrl: string;
  durationSeconds: number;
  isDownloaded?: boolean;
  localAudioUri?: string;
  genre?: string;
  trackNumber?: number;
  releaseDate?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  artworkUrl: string;
  releaseYear: string;
  releaseDate?: string;
  totalTracks: number;
  genre?: string;
  recordLabel?: string;
  source: 'deezer' | 'itunes' | 'ytm';
  tracks?: Track[];
}

export interface Artist {
  id: string;
  name: string;
  pictureUrl: string;
  albumsCount?: number;
  genre?: string;
  source: 'deezer' | 'itunes' | 'ytm';
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

