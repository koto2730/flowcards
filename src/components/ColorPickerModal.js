import React from 'react';
import { StyleSheet } from 'react-native';
import { Modal, Portal, Text } from 'react-native-paper';
import ColorPalette from 'react-native-color-palette';
import { useTranslation } from 'react-i18next';

const ColorPickerModal = ({ visible, onClose, node, onColorChange }) => {
  const { t } = useTranslation();

  if (!node) {
    return null;
  }

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.colorPickerContainer}
      >
        <ColorPalette
          onChange={onColorChange}
          value={node.color}
          colors={[
            '#FCA5A5',
            '#F87171',
            '#FDBA74',
            '#FB923C',
            '#FDE047',
            '#FACC15',
            '#86EFAC',
            '#4ADE80',
            '#5EEAD4',
            '#2DD4BF',
            '#93C5FD',
            '#60A5FA',
            '#A5B4FC',
            '#818CF8',
            '#C4B5FD',
            '#A78BFA',
            '#D1D5DB',
            '#9CA3AF',
            '#6B7280',
            '#FFFFFF',
          ]}
          title={t('selectCardColor')}
          icon={<Text>✔</Text>}
        />
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  colorPickerContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignSelf: 'center',
  },
});

export default ColorPickerModal;