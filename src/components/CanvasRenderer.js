import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Path, Group } from '@shopify/react-native-skia';
import { GestureDetector } from 'react-native-gesture-handler';
import SkiaCard from './Card';
import {
  CalcSkiaEdgeStroke,
  CalcSkiaInteractionEdgeStroke,
} from '../utils/flowUtils';
import { useFlowContext } from '../contexts/FlowContext';

const CanvasRenderer = ({
  composedGesture,
  skiaTransform,
  skiaOrigin,
  displayNodes,
  fontMgr,
  paperclipIconSvg,
  editingNode,
  showAttachmentsOnCanvas,
  pressState,
  resolveAttachmentPath,
}) => {
  const { edges, linkingState } = useFlowContext();

  const renderEdges = () => {
    const displayNodeIds = new Set(displayNodes.map(n => n.id));
    const relevantEdges = edges.filter(
      edge =>
        displayNodeIds.has(edge.source) && displayNodeIds.has(edge.target),
    );

    return relevantEdges.map(edge => {
      const sourceNode = displayNodes.find(n => n.id === edge.source);
      const targetNode = displayNodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      const interactionPath = CalcSkiaInteractionEdgeStroke({
        edge,
        sourceNode,
        targetNode,
      });
      const path = CalcSkiaEdgeStroke({ edge, sourceNode, targetNode });

      return (
        <Group key={edge.id + '_group'}>
          <Path
            path={interactionPath}
            style="stroke"
            strokeWidth={15}
            color="transparent"
          />
          <Path path={path} style="stroke" strokeWidth={2} color="black" />
        </Group>
      );
    });
  };
  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.flowArea}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={skiaTransform} origin={skiaOrigin}>
            {displayNodes.map(node => (
              <SkiaCard
                key={node.id}
                node={node}
                fontMgr={fontMgr}
                paperclipIconSvg={paperclipIconSvg}
                isSelected={linkingState.selectedNodeIds.has(node.id)}
                isLinkingMode={linkingState.active}
                isLinkSource={linkingState.sourceNodeId === node.id}
                isEditing={editingNode && editingNode.id === node.id}
                isSeeThroughParent={node.isSeeThroughParent}
                showAttachment={showAttachmentsOnCanvas}
                pressState={pressState}
                resolveAttachmentPath={resolveAttachmentPath}
              />
            ))}
            {renderEdges()}
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  flowArea: {
    flex: 1,
  },
});

export default CanvasRenderer;
