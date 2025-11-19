import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { FAB } from 'react-native-paper';
import OriginalTheme from '../screens/OriginalTheme';
import { runOnJS } from 'react-native-reanimated';
import { useFlowContext } from '../contexts/FlowContext';

const FloatingActionButtons = ({
  alignModeOpen,
  setAlignModeOpen,
  handleAlign,
  isSeeThrough,
  setIsSeeThrough,
  showAttachmentsOnCanvas,
  setShowAttachmentsOnCanvas,
  handlePressSectionUp,
  resetScale,
  moveToNearestCard,
  fabDisabled,
}) => {
  const { linkingState, setLinkingState, addNode } = useFlowContext();

  const toggleLinkingMode = useCallback(() => {
    setLinkingState({
      ...linkingState,
      active: !linkingState.active,
      startNode: null,
    });
  }, [linkingState, setLinkingState]);

  const clearNodeSelection = useCallback(() => {
    setLinkingState({ ...linkingState, selectedNodeIds: new Set() });
  }, [linkingState, setLinkingState]);

  return (
    <View
      pointerEvents="box-none"
      style={styles.fabRootContainer}
      zIndex={100}
    >
      {alignModeOpen ? (
        <View style={styles.alignToolsContainer}>
          <FAB
            icon="format-align-left"
            style={styles.alignToolButton}
            onPress={() => handleAlign('left')}
            small
          />
          <FAB
            icon="format-align-center"
            style={styles.alignToolButton}
            onPress={() => handleAlign('center-h')}
            small
          />
          <FAB
            icon="format-align-right"
            style={styles.alignToolButton}
            onPress={() => handleAlign('right')}
            small
          />
          <FAB
            icon="format-align-top"
            style={styles.alignToolButton}
            onPress={() => handleAlign('top')}
            small
          />
          <FAB
            icon="format-align-middle"
            style={styles.alignToolButton}
            onPress={() => handleAlign('center-v')}
            small
          />
          <FAB
            icon="format-align-bottom"
            style={styles.alignToolButton}
            onPress={() => handleAlign('bottom')}
            small
          />
          <FAB
            icon="arrow-expand-all"
            style={styles.alignToolButton}
            onPress={() => handleAlign('spread')}
            small
          />
          <FAB
            icon="selection-off"
            style={styles.alignToolButton}
            onPress={clearNodeSelection}
            small
          />
          <FAB
            icon="close"
            style={styles.alignToolButton}
            onPress={() => {
              setAlignModeOpen(false);
              clearNodeSelection();
            }}
            small
          />
        </View>
      ) : (
        <>
          {/* Global Group (Bottom Left) */}
          <View style={styles.fabGroup}>
            {/* 6: Reset Zoom */}
            <FAB
              icon="magnify"
              style={styles.fab}
              small
              onPress={() => runOnJS(resetScale)()}
            />
            {/* 7: Pan/Move mode */}
            <FAB
              icon="target"
              style={styles.fab}
              onPress={() => runOnJS(moveToNearestCard)()}
              small
              visible={true}
            />
          </View>

          {/* Right Groups */}
          <View style={styles.fabRightColumn}>
            {/* Reference Group (Top Right) */}
            <View style={[styles.fabGroup, { marginBottom: 8 }]}>
              <FAB
                icon="format-align-justify"
                style={styles.fab}
                onPress={() => setAlignModeOpen(true)}
                small
                visible={true}
              />
              {/* 4: Show Attachments */}
              <FAB
                icon="paperclip"
                style={styles.fab}
                onPress={() => setShowAttachmentsOnCanvas(s => !s)}
                color={showAttachmentsOnCanvas ? '#34C759' : undefined}
                small
                visible={true}
              />
              {/* 5: See-through Mode */}
              <FAB
                icon={isSeeThrough ? 'eye-off' : 'eye'}
                style={styles.fab}
                onPress={() => setIsSeeThrough(s => !s)}
                disabled={linkingState.active}
                small
                visible={true}
              />
            </View>

            {/* Edit Group (Bottom Right) */}
            <View style={styles.fabGroup}>
              {/* 3: Section Up */}
              <FAB
                icon="arrow-up-bold"
                style={styles.fab}
                onPress={handlePressSectionUp}
                disabled={fabDisabled}
                small
                visible={true}
              />
              {/* 2: Link Line Mode */}
              <FAB
                icon="link-variant"
                style={styles.fab}
                onPress={toggleLinkingMode}
                color={linkingState.active ? '#34C759' : undefined}
                disabled={isSeeThrough}
                small
                visible={true}
              />
              {/* 1: Add Card */}
              <FAB
                icon="plus"
                style={styles.fab}
                onPress={addNode}
                disabled={fabDisabled}
                small
                visible={true}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fabRootContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
  },
  fabRightColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  fabGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  fab: {
    marginHorizontal: 4,
    backgroundColor: OriginalTheme.colors.primary,
  },
  alignToolsContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    width: 220, // 4 FABs per row
    pointerEvents: 'box-none',
  },
  alignToolButton: {
    margin: 4,
    backgroundColor: OriginalTheme.colors.primary,
  },
});

export default FloatingActionButtons;

