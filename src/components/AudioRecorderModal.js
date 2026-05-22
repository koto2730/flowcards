import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSoundRecorderWithStates } from 'react-native-nitro-sound';
import { useTranslation } from 'react-i18next';

const AudioRecorderModal = ({ visible, onSave, onClose }) => {
  const { t } = useTranslation();
  const [hasPermission, setHasPermission] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const recordedUriRef = useRef(null);

  const { startRecorder, stopRecorder, mmss, state } = useSoundRecorderWithStates({
    subscriptionDuration: 0.1,
    autoDispose: true,
  });

  useEffect(() => {
    if (!visible) {
      setErrorMsg(null);
      recordedUriRef.current = null;
      return;
    }
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).then(
        result => {
          const granted = result === PermissionsAndroid.RESULTS.GRANTED;
          setHasPermission(granted);
          if (!granted) {
            setErrorMsg(t('microphonePermissionDenied'));
          }
        },
      );
    } else {
      setHasPermission(true);
    }
  }, [visible]);

  const handleStart = async () => {
    if (!hasPermission) {
      setErrorMsg(t('microphonePermissionDenied'));
      return;
    }
    setErrorMsg(null);
    try {
      // Pass explicit audioSets to work around a nitro-sound iOS bridge issue
      // where undefined audioSets triggers a C++ optional access error.
      const uri = await startRecorder(undefined, { AudioQuality: 'high' }, false);
      recordedUriRef.current = uri;
    } catch (e) {
      const detail = e?.message || e?.toString?.() || String(e);
      setErrorMsg(`${t('recordingFailed')}: ${detail}`);
    }
  };

  const handleStopAndSave = async () => {
    try {
      const uri = await stopRecorder();
      onSave(uri || recordedUriRef.current);
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    }
  };

  const handleClose = async () => {
    if (state.isRecording) {
      try { await stopRecorder(); } catch (_) {}
    }
    onClose();
  };

  const duration = state.isRecording ? mmss(Math.floor(state.currentPosition / 1000)) : '00:00';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      transparent
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>{t('recordAudio')}</Text>
          <Text style={styles.timer}>{duration}</Text>

          {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

          <View style={styles.controls}>
            {!state.isRecording ? (
              <TouchableOpacity
                style={[styles.recordButton, styles.startButton]}
                onPress={handleStart}
              >
                <Icon name="microphone" size={36} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.recordButton, styles.stopButton]}
                onPress={handleStopAndSave}
              >
                <Icon name="stop" size={36} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  timer: {
    fontSize: 36,
    fontVariant: ['tabular-nums'],
    marginBottom: 24,
    color: '#333',
  },
  controls: {
    marginBottom: 16,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#E53935',
  },
  stopButton: {
    backgroundColor: '#424242',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#666',
    fontSize: 16,
  },
  error: {
    color: '#C62828',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
});

export default AudioRecorderModal;
