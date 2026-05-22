import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSoundWithStates } from 'react-native-nitro-sound';

const AudioAttachmentPlayer = ({ uri }) => {
  const {
    startPlayer,
    pausePlayer,
    resumePlayer,
    stopPlayer,
    state,
    mmss,
    dispose,
  } = useSoundWithStates({
    subscriptionDuration: 0.2,
    autoDispose: true,
  });

  useEffect(() => {
    return () => {
      try { stopPlayer(); } catch (_) {}
      try { dispose(); } catch (_) {}
    };
  }, []);

  const handlePress = async () => {
    try {
      if (!state.isPlaying && state.playback.position === 0) {
        await startPlayer(uri);
      } else if (state.isPlaying) {
        await pausePlayer();
      } else {
        await resumePlayer();
      }
    } catch (_) {}
  };

  const positionSecs = Math.floor(state.playback.position / 1000);
  const durationSecs = Math.floor(state.playback.duration / 1000);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playButton} onPress={handlePress}>
        <Icon
          name={state.isPlaying ? 'pause-circle' : 'play-circle'}
          size={64}
          color="#E53935"
        />
      </TouchableOpacity>
      <Text style={styles.time}>
        {mmss(positionSecs)} / {mmss(durationSecs)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  playButton: {
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: '#666',
    fontVariant: ['tabular-nums'],
  },
});

export default AudioAttachmentPlayer;
