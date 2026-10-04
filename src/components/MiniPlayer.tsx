import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { audioService } from '../services/audioService';
import { PlaybackState } from '../types';

interface MiniPlayerProps {
  onPress: () => void;
  bottomOffset?: number;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onPress, bottomOffset }) => {
  const [playback, setPlayback] = useState<PlaybackState>(audioService.getState());

  useEffect(() => {
    return audioService.subscribe(setPlayback);
  }, []);

  if (!playback.currentTrack) return null;

  const progress = playback.durationMillis > 0
    ? Math.min(1, playback.positionMillis / playback.durationMillis)
    : 0;

  return (
    <View style={[styles.outerContainer, { bottom: bottomOffset ?? 76 }]}>
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>

      <TouchableOpacity activeOpacity={0.9} style={styles.container} onPress={onPress}>
        <Image
          source={{ uri: playback.currentTrack.artworkUrl }}
          style={styles.artwork}
        />
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {playback.currentTrack.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {playback.currentTrack.artist}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.touchControl}
          onPress={() => audioService.previous()}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <Ionicons name="play-skip-back" size={20} color="#A0A0A8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.touchControl}
          onPress={() => audioService.togglePlayPause()}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Ionicons
            name={playback.isPlaying ? 'pause' : 'play'}
            size={26}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.touchControl}
          onPress={() => audioService.next()}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <Ionicons name="play-skip-forward" size={20} color="#A0A0A8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.touchControl}
          onPress={() => audioService.stop()}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 8 }}
        >
          <Ionicons name="close" size={22} color="#707078" />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 66,
    left: 12,
    right: 12,
    backgroundColor: '#16161C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262630',
    overflow: 'hidden',
    elevation: 8,
  },
  progressBarBackground: {
    height: 2,
    backgroundColor: '#262630',
    width: '100%',
  },
  progressBarFill: {
    height: 2,
    backgroundColor: '#00E5FF',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#262630',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  artist: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  touchControl: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
