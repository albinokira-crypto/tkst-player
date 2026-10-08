import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { audioService } from '../services/audioService';
import { TKSTBackground } from './TKSTBackground';
import { Track, PlaybackState } from '../types';

interface CurrentQueueModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CurrentQueueModal: React.FC<CurrentQueueModalProps> = ({ visible, onClose }) => {
  const [playback, setPlayback] = useState<PlaybackState>(audioService.getState());
  const insets = useSafeAreaInsets();
  const androidBar = StatusBar.currentHeight || 38;
  const topInset = Platform.OS === 'android'
    ? Math.max(insets.top, androidBar) + 16
    : Math.max(insets.top, 44);
  const bottomInset = Math.max(insets.bottom, 24);

  useEffect(() => {
    return audioService.subscribe((state) => {
      setPlayback(state);
    });
  }, []);

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      audioService.moveTrackInQueue(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < playback.queue.length - 1) {
      audioService.moveTrackInQueue(index, index + 1);
    }
  };

  const handleMoveToTop = (index: number) => {
    if (index > 0) {
      audioService.moveTrackInQueue(index, 0);
    }
  };

  const handleMoveToBottom = (index: number) => {
    if (index < playback.queue.length - 1) {
      audioService.moveTrackInQueue(index, playback.queue.length - 1);
    }
  };

  const handlePromptMove = (index: number, track: Track) => {
    Alert.alert(
      'Mover Música',
      `Onde deseja posicionar "${track.title}" na fila?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Tocar a Seguir (Topo)',
          onPress: () => {
            // Se já for a que está tocando, mantém
            if (index === playback.currentIndex) return;
            const target = playback.currentIndex >= 0 ? playback.currentIndex + 1 : 0;
            audioService.moveTrackInQueue(index, target);
          },
        },
        {
          text: 'Mover para o Início (#1)',
          onPress: () => handleMoveToTop(index),
        },
        {
          text: 'Mover para o Final',
          onPress: () => handleMoveToBottom(index),
        },
      ]
    );
  };

  const handleRemoveTrack = (index: number, track: Track) => {
    Alert.alert(
      'Remover da Fila',
      `Deseja remover "${track.title}" da fila de reprodução?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => audioService.removeTrackFromQueue(index),
        },
      ]
    );
  };

  const handleClearQueue = () => {
    Alert.alert(
      'Limpar Fila',
      'Deseja parar a reprodução e limpar todas as músicas da fila?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar Tudo',
          style: 'destructive',
          onPress: () => {
            audioService.stop();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <TKSTBackground variant="kanji" opacity={0.25}>
        <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-down" size={30} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerTitleBox}>
              <Text style={styles.headerSubtitle}>TOCANDO AGORA</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {playback.currentPlaylistName
                  ? playback.currentPlaylistName.toUpperCase()
                  : 'FILA DE REPRODUÇÃO'}
              </Text>
            </View>

            {playback.queue.length > 1 ? (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleClearQueue}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="trash-outline" size={22} color="#FF453A" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 44 }} />
            )}
          </View>

          {/* Subtítulo informativo */}
          <View style={styles.infoBanner}>
            <Ionicons name="swap-vertical" size={16} color="#00E5FF" />
            <Text style={styles.infoBannerText}>
              {playback.queue.length}{' '}
              {playback.queue.length === 1 ? 'música na playlist' : 'músicas na playlist'} • Use as setas para mover a ordem
            </Text>
          </View>

          {/* Lista de Músicas na Fila com controles de reordenação */}
          <FlatList
            data={playback.queue}
            keyExtractor={(item, index) => `${item.id}_${index}`}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => {
              const isCurrent = index === playback.currentIndex;
              const isFirst = index === 0;
              const isLast = index === playback.queue.length - 1;

              return (
                <View
                  style={[
                    styles.trackCard,
                    isCurrent && styles.trackCardCurrent,
                  ]}
                >
                  {/* Posição na Fila */}
                  <View style={styles.positionBox}>
                    <Text
                      style={[
                        styles.positionText,
                        isCurrent && { color: '#00E5FF', fontWeight: '800' },
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </View>

                  {/* Toque para tocar essa música */}
                  <TouchableOpacity
                    style={styles.trackInfo}
                    onPress={() => audioService.skipToIndex(index)}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: item.artworkUrl }}
                      style={styles.artwork}
                    />
                    <View style={styles.textContainer}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text
                          style={[
                            styles.trackTitle,
                            isCurrent && styles.trackTitleCurrent,
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        {isCurrent && (
                          <View style={styles.badgeNowPlaying}>
                            <Ionicons name="volume-high" size={11} color="#08080A" />
                          </View>
                        )}
                      </View>
                      <Text style={styles.trackArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Botões de Mover e Reordenar */}
                  <View style={styles.orderActions}>
                    <TouchableOpacity
                      style={[styles.arrowButton, isFirst && styles.arrowButtonDisabled]}
                      onPress={() => handleMoveUp(index)}
                      disabled={isFirst}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={20}
                        color={isFirst ? '#3A3A46' : '#00E5FF'}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.arrowButton, isLast && styles.arrowButtonDisabled]}
                      onPress={() => handleMoveDown(index)}
                      disabled={isLast}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={20}
                        color={isLast ? '#3A3A46' : '#00E5FF'}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={() => handlePromptMove(index, item)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Ionicons name="reorder-two-outline" size={22} color="#A0A0B0" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleRemoveTrack(index, item)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Ionicons name="close" size={18} color="#FF453A" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={54} color="#3A3A46" />
                <Text style={styles.emptyTitle}>Fila Vazia</Text>
                <Text style={styles.emptySubtitle}>
                  Nenhuma música na fila de reprodução no momento.
                </Text>
              </View>
            }
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
  },
  headerTitleBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  headerSubtitle: {
    color: '#00E5FF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 2,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    gap: 8,
  },
  infoBannerText: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161622',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#242436',
  },
  trackCardCurrent: {
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderColor: '#00E5FF',
  },
  positionBox: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    color: '#707078',
    fontSize: 13,
    fontWeight: '700',
  },
  trackInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#202030',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  trackTitleCurrent: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  badgeNowPlaying: {
    backgroundColor: '#00E5FF',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackArtist: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arrowButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#202032',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: {
    opacity: 0.35,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#202032',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#707078',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 30,
  },
});
