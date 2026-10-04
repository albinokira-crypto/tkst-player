import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

interface TKSTBackgroundProps {
  children: React.ReactNode;
  variant?: 'tiger' | 'emblem' | 'clean' | 'kanji';
  opacity?: number;
}

export const TKSTBackground: React.FC<TKSTBackgroundProps> = ({
  children,
  variant = 'tiger',
  opacity = 0.08,
}) => {
  let source = require('../../assets/tkst/tkst-tiger.png');
  if (variant === 'emblem') {
    source = require('../../assets/tkst/tkst-emblem.png');
  } else if (variant === 'clean') {
    source = require('../../assets/tkst/tkst-clean.png');
  } else if (variant === 'kanji') {
    source = require('../../assets/tkst/tkst-kanji.jpg');
  }

  return (
    <View style={styles.container}>
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
    backgroundColor: '#0A0A0E',
  },
  backgroundWrapper: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundImage: {
    width: width * 0.95,
    height: height * 0.65,
  },
});
