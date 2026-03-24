import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { Camera } from 'react-native-camera-kit';
import { PermissionsAndroid } from 'react-native';
import { useTranslation } from 'react-i18next';

const QRScannerModal = ({ visible, onScan, onClose }) => {
  const { t } = useTranslation();
  const [scanned, setScanned] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (!visible) {
      setScanned(false);
      return;
    }
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).then(
        result => setHasPermission(result === PermissionsAndroid.RESULTS.GRANTED),
      );
    } else {
      setHasPermission(true);
    }
  }, [visible]);

  const handleQRRead = event => {
    if (scanned) return;
    const value = event.nativeEvent?.codeStringValue;
    if (!value) return;
    setScanned(true);
    onScan(value);
  };

  const handleClose = () => {
    setScanned(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {hasPermission && (
          <Camera
            style={styles.camera}
            scanBarcode
            onReadCode={handleQRRead}
            showFrame
            laserColor="red"
            frameColor="#FFFFFF"
            barcodeFrameSize={{ width: 260, height: 260 }}
          />
        )}
        <View style={styles.overlay}>
          <Text style={styles.hint}>{t('qrScanHint')}</Text>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  hint: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 24,
  },
  closeText: {
    color: '#FFF',
    fontSize: 16,
  },
});

export default QRScannerModal;
