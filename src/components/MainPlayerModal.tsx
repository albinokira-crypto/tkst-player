import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
  BackHandler,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { audioService } from '../services/audioService';
import { DownloadManager } from '../services/downloadManager';
import { AddToPlaylistModal } from './AddToPlaylistModal';
import { TKSTBackground } from './TKSTBackground';
import { PlaybackState } from '../types';

const { width, height } = Dimensions.get('window');
const ARTWORK_SIZE = Math.min(width - 56, height * 0.38, 330);

interface MainPlayerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MainPlayerModal: React.FC<MainPlayerModalProps> = ({ visible, onClose }) => {
  const [playback, setPlayback] = useState<PlaybackState>(audioService.getState());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 38) : 0,
    38
  );
  const bottomInset = Math.max(insets.bottom, 24);

  useEffect(() => {
    return audioService.subscribe((state) => {
      setPlayback(state);
      if (state.currentTrack) {
        DownloadManager.isTrackDownloaded(state.currentTrack.id).then(setDownloaded);
      }
    });
  }, []);

  // Intercepta botão voltar nativo para fechar o modal do player
  useEffect(() => {
    if (!visible) return;
    const handleBackPress = () => {
      if (isAddToPlaylistOpen) {
        setIsAddToPlaylistOpen(false);
        return true;
      }
      onClose();
      return true;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backSub.remove();
  }, [visible, isAddToPlaylistOpen, onClose]);

  if (!playback.currentTrack) return null;

  const formatTime = (millis: number) => {
    const totalSecs = Math.floor(millis / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleDownload = async () => {
    if (!playback.currentTrack || downloaded || isDownloading) return;
    setIsDownloading(true);
    try {
      await DownloadManager.downloadTrack(playback.currentTrack);
      setDownloaded(true);
      Alert.alert('Download Concluído', 'Música disponível offline no seu dispositivo!');
    } catch {
      Alert.alert('Erro', 'Não foi possível baixar esta música.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (isAddToPlaylistOpen) {
          setIsAddToPlaylistOpen(false);
        } else {
          onClose();
        }
      }}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <TKSTBackground variant="tiger" opacity={0.25}>
        <View style={[styles.container, { paddingTop: topInset + 16, paddingBottom: bottomInset }]}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-down" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerSubtitle}>TOCANDO AGORA</Text>
              <Text style={styles.headerTitle}>TKST PLAYER</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setIsAddToPlaylistOpen(true)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="bookmark-outline" size={24} color="#00E5FF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleDownload}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                {isDownloading ? (
                  <ActivityIndicator size="small" color="#00E5FF" />
                ) : (
                  <Ionicons
                    name={downloaded ? 'cloud-done' : 'cloud-download-outline'}
                    size={24}
                    color={downloaded ? '#00E5FF' : '#FFFFFF'}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.artworkContainer}>
            <Image
              source={{ uri: playback.currentTrack.artworkUrl }}
              style={styles.artwork}
            />
          </View>

          <View style={styles.trackDetails}>
            <View style={styles.titleWrapper}>
              <Text style={styles.title} numberOfLines={1}>
                {playback.currentTrack.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {playback.currentTrack.artist}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.favButton}
              onPress={() => setIsAddToPlaylistOpen(true)}
            >
              <Ionicons name="add-circle-outline" size={28} color="#00E5FF" />
            </TouchableOpacity>
          </View>

          <View style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={playback.durationMillis || 1}
              value={playback.positionMillis}
              minimumTrackTintColor="#00E5FF"
              maximumTrackTintColor="#262632"
              thumbTintColor="#00E5FF"
              onSlidingComplete={(val) => audioService.seekTo(val)}
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(playback.positionMillis)}</Text>
              <Text style={styles.timeText}>{formatTime(playback.durationMillis)}</Text>
            </View>
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => audioService.toggleShuffle()}
            >
              <Ionicons
                name="shuffle"
                size={22}
                color={playback.isShuffle ? '#00E5FF' : '#707078'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => audioService.previous()}
            >
              <Ionicons name="play-skip-back" size={32} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              onPress={() => audioService.togglePlayPause()}
            >
              {playback.isLoading ? (
                <ActivityIndicator size="small" color="#08080A" />
              ) : (
                <Ionicons
                  name={playback.isPlaying ? 'pause' : 'play'}
                  size={34}
                  color="#08080A"
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => audioService.next()}
            >
              <Ionicons name="play-skip-forward" size={32} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => audioService.toggleRepeat()}
            >
              <Ionicons
                name={playback.repeatMode === 'track' ? 'repeat' : 'repeat-outline'}
                size={22}
                color={playback.repeatMode !== 'off' ? '#00E5FF' : '#707078'}
              />
            </TouchableOpacity>
          </View>

          <AddToPlaylistModal
            visible={isAddToPlaylistOpen}
            track={playback.currentTrack}
            onClose={() => setIsAddToPlaylistOpen(false)}
          />
        </View>
      </TKSTBackground>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 4,
  },
  headerTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSubtitle: {
    color: '#00E5FF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  artworkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 20,
    backgroundColor: '#161620',
  },
  trackDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  titleWrapper: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  artist: {
    color: '#8E8E93',
    fontSize: 16,
    marginTop: 4,
  },
  favButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderContainer: {
    paddingHorizontal: 16,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginTop: -8,
  },
  timeText: {
    color: '#707078',
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 16,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
