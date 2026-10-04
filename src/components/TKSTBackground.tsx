import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export type TKSTVariant = 'tiger' | 'emblem' | 'clean' | 'header' | 'lutadores' | 'kanji';

interface TKSTBackgroundProps {
  children: React.ReactNode;
  variant?: TKSTVariant;
  opacity?: number;
}

export const TKSTBackground: React.FC<TKSTBackgroundProps> = ({
  children,
  variant = 'tiger',
  opacity = 0.22, // 22% de opacidade garante que as artes fiquem perfeitamente visíveis
}) => {
  let source = require('../../assets/tkst/tkst-tigre-lettering.png');

  if (variant === 'emblem') {
    source = require('../../assets/tkst/logo-tkst-emblem-transp.png');
  } else if (variant === 'clean') {
    source = require('../../assets/tkst/logo-tkst-clean.png');
  } else if (variant === 'header') {
    source = require('../../assets/tkst/logo-header-tkst.png');
  } else if (variant === 'lutadores') {
    source = require('../../assets/tkst/tkst-emblema-lutadores.png');
  } else if (variant === 'kanji') {
    source = require('../../assets/tkst/logo-tkst-kanji-vertical.png');
  }

  return (
    <View style={styles.container}>
      {/* Imagem de fundo da TKST com opacidade marcante e elegante */}
      <View style={[styles.backgroundWrapper, { opacity }]} pointerEvents="none">
        <Image
          source={source}
          style={styles.backgroundImage}
          resizeMode="contain"
        />
      </View>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07070A',
  },
  backgroundWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundImage: {
    width: width * 0.92,
    height: height * 0.72,
  },
});
