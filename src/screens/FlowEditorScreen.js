import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TextInput,
  PermissionsAndroid,
  Alert,
  KeyboardAvoidingView,
  TouchableOpacity,
  Image,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Canvas,
  Path,
  Group,
  useFonts,
  useFont,
  useSVG,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  useDerivedValue,
  withTiming,
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';
import {
  updateFlow,
  getFlows,
  getAttachmentByNodeId,
  insertAttachment,
  deleteAttachment,
} from '../db';
import RNFS from 'react-native-fs';
import { Provider as PaperProvider } from 'react-native-paper';
import OriginalTheme from './OriginalTheme';
import SkiaCard from '../components/Card';
import FloatingActionButtons from '../components/FloatingActionButtons';
import EditorModal from '../components/EditorModal';
import ColorPickerModal from '../components/ColorPickerModal';
import UrlInputModal from '../components/UrlInputModal';
import CanvasRenderer from '../components/CanvasRenderer';
import {
  getCenter,
  getHandlePosition,
  CalcSkiaEdgeStroke,
  CalcSkiaInteractionEdgeStroke,
  isPointInCard,
  isPointInDeleteButton,
} from '../utils/flowUtils';
import { useFlowData } from '../hooks/useFlowData';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { useAttachmentManager } from '../hooks/useAttachmentManager';
import { useTranslation } from 'react-i18next';
import { useGestures } from '../hooks/useGestures';
import { getTextColorForBackground } from '../utils/colorUtils';
import { ATTACHMENT_DIR } from '../constants/fileSystem';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

const { width, height } = Dimensions.get('window');

const FlowEditorScreen = ({ route, navigation }) => {
  const { flowId, flowName } = route.params;
  const { t } = useTranslation();
  const [isSeeThrough, setIsSeeThrough] = useState(false);
  const [alignModeOpen, setAlignModeOpen] = useState(false);
  const {
    allNodes,
    setAllNodes,
    edges,
    displayNodes,
    handleUpdateNodeData,
    handleUpdateNodePosition,
    addNode,
    handleDeleteNode,
    handleDoubleClick,
    handleSectionUp,
    linkingState,
    setLinkingState,
    toggleLinkingMode,
    handleCardTap,
    handleDeleteEdge,
    clearNodeSelection,
  } = useFlowData(flowId, isSeeThrough, alignModeOpen, t);

  const {
    translateX,
    translateY,
    scale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    context,
    origin_x,
    origin_y,
    skiaTransform,
    skiaOrigin,
    resetScale,
    moveToNearestCard,
  } = useCanvasTransform(displayNodes);

  const [editingNode, setEditingNode] = useState(null);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [showAttachmentsOnCanvas, setShowAttachmentsOnCanvas] = useState(false);

  const {
    urlInputVisible,
    setUrlInputVisible,
    attachmentUrl,
    setAttachmentUrl,
    handleAttachFile,
    handleAttachImageFromLibrary,
    handleUrlInputChange,
    handleSaveUrlAttachment,
    handleOpenAttachment,
    handleRemoveAttachment,
    resolveAttachmentPath,
  } = useAttachmentManager();

  const fontMgr = useFonts({
    NotoSansJP: [
      require('../../assets/fonts/Noto_Sans_JP/static/NotoSansJP-Regular.ttf'),
      require('../../assets/fonts/Noto_Sans_JP/static/NotoSansJP-Bold.ttf'),
    ],
    NotoSansSC: [
      require('../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Regular.ttf'),
      require('../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Bold.ttf'),
    ],
  });

  const paperclipIconSvg = useSVG(require('../../assets/icons/paperclip.svg'));

  useEffect(() => {
    const ensureDirExists = async () => {
      await RNFS.mkdir(ATTACHMENT_DIR);
    };
    ensureDirExists();
  }, []);

  useEffect(() => {
    const loadPosition = async () => {
      try {
        const flows = await getFlows();
        const currentFlow = flows.find(f => f.id === flowId);
        if (currentFlow && currentFlow.lastPosition) {
          const position = JSON.parse(currentFlow.lastPosition);
          translateX.value = position.x;
          translateY.value = position.y;
          savedTranslateX.value = position.x;
          savedTranslateY.value = position.y;
        }
      } catch (error) {
        console.error('Failed to load last position:', error);
      }
    };
    loadPosition();
  }, [flowId, translateX, translateY, savedTranslateX, savedTranslateY]);

  useEffect(() => {
    return () => {
      const savePosition = async () => {
        try {
          const position = {
            x: translateX.value,
            y: translateY.value,
          };
          await updateFlow(flowId, { lastPosition: JSON.stringify(position) });
        } catch (error) {
          console.error('Failed to save last position:', error);
        }
      };
      savePosition();
    };
  }, [flowId, translateX, translateY]);

  useEffect(() => {
    navigation.setOptions({
      title: flowName || 'Flow',
      headerStyle: { backgroundColor: OriginalTheme.colors.primary },
      headerTintColor: '#fff',
    });
  }, [navigation, flowName]);

  const [pendingEvent, setPendingEvent] = useState(null);

  useEffect(() => {
    if (!pendingEvent) return;

    const { type, nodeId, extra } = pendingEvent;

    const run = async () => {
      if (type === 'tap') {
        await handleCardTap(nodeId);
      } else if (type === 'doubleTap') {
        handleDoubleClick(nodeId);
      } else if (type === 'dragEnd') {
        await handleUpdateNodePosition(nodeId, extra?.newPosition);
      } else if (type === 'delete') {
        await handleDeleteNode(nodeId);
      } else if (type === 'edgeTap') {
        await handleDeleteEdge(nodeId);
      }
    };

    run();
    setPendingEvent(null);
  }, [
    pendingEvent,
    handleCardTap,
    handleDoubleClick,
    handleUpdateNodePosition,
    handleDeleteNode,
    handleDeleteEdge,
  ]);

  const handleNodeLongPress = async hitNode => {
    try {
      const attachment = await getAttachmentByNodeId(flowId, hitNode.id);
      setEditingNode({
        id: hitNode.id,
        title: hitNode.data.label,
        description: hitNode.data.description,
        size: hitNode.data.size || 'medium',
        color: hitNode.data.color || '#FFFFFF',
        attachment: attachment,
      });
    } catch (e) {
      console.error('Failed to fetch attachment', e);
      // Even if fetching attachment fails, open the editor without it
      setEditingNode({
        id: hitNode.id,
        title: hitNode.data.label,
        description: hitNode.data.description,
        size: hitNode.data.size || 'medium',
        color: hitNode.data.color || '#FFFFFF',
        attachment: null,
      });
    }
  };

  const { composedGesture, pressState } = useGestures({
    translateX,
    translateY,
    scale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    context,
    origin_x,
    origin_y,
    displayNodes,
    allNodes,
    setAllNodes,
    edges,
    linkingState,
    isSeeThrough,
    setPendingEvent,
    handleNodeLongPress,
  });

  const handleAddNode = () => {
    const position = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    addNode(position);
  };

  const handlePressSectionUp = () => {
    const screenCenter = {
      x: (width / 2 - translateX.value) / scale.value,
      y: (height / 2 - translateY.value) / scale.value,
    };
    handleSectionUp(screenCenter);
  };

  const handleAlign = async alignment => {
    const selectedIds = Array.from(linkingState.selectedNodeIds);
    if (selectedIds.length === 0) return;
    if (alignment !== 'spread' && selectedIds.length < 2) return;

    const selectedNodes = allNodes.filter(node =>
      selectedIds.includes(node.id),
    );

    const originalNodesMap = new Map(
      allNodes.map(n => [n.id, JSON.stringify(n.position)]),
    );
    let newNodes = [...allNodes];

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...selectedNodes.map(n => n.position.x));
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? { ...node, position: { ...node.position, x: minX } }
            : node,
        );
        break;
      }
      case 'center-h': {
        const minX = Math.min(...selectedNodes.map(n => n.position.x));
        const maxX = Math.max(
          ...selectedNodes.map(n => n.position.x + n.size.width),
        );
        const center = (minX + maxX) / 2;
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: {
                  ...node.position,
                  x: center - node.size.width / 2,
                },
              }
            : node,
        );
        break;
      }
      case 'right': {
        const maxX = Math.max(
          ...selectedNodes.map(n => n.position.x + n.size.width),
        );
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: { ...node.position, x: maxX - node.size.width },
              }
            : node,
        );
        break;
      }
      case 'top': {
        const minY = Math.min(...selectedNodes.map(n => n.position.y));
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? { ...node, position: { ...node.position, y: minY } }
            : node,
        );
        break;
      }
      case 'center-v': {
        const minY = Math.min(...selectedNodes.map(n => n.position.y));
        const maxY = Math.max(
          ...selectedNodes.map(n => n.position.y + n.size.height),
        );
        const center = (minY + maxY) / 2;
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: {
                  ...node.position,
                  y: center - node.size.height / 2,
                },
              }
            : node,
        );
        break;
      }
      case 'bottom': {
        const maxY = Math.max(
          ...selectedNodes.map(n => n.position.y + n.size.height),
        );
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: { ...node.position, y: maxY - node.size.height },
              }
            : node,
        );
        break;
      }
      case 'spread': {
        let tempAllNodes = JSON.parse(JSON.stringify(allNodes));
        const MAX_ITERATIONS = 100;
        let iterations = 0;
        let moved = false;
        const selectedIdsSet = new Set(selectedIds);

        // Step 1: Resolve overlaps between selected nodes
        if (selectedNodes.length > 1) {
          iterations = 0;
          do {
            moved = false;
            const currentSelectedNodes = tempAllNodes.filter(n =>
              selectedIdsSet.has(n.id),
            );
            for (let i = 0; i < currentSelectedNodes.length; i++) {
              for (let j = i + 1; j < currentSelectedNodes.length; j++) {
                const nodeA = currentSelectedNodes[i];
                const nodeB = currentSelectedNodes[j];
                const rectA = { ...nodeA.position, ...nodeA.size };
                const rectB = { ...nodeB.position, ...nodeB.size };

                const overlapX = Math.max(
                  0,
                  Math.min(rectA.x + rectA.width, rectB.x + rectB.width) -
                    Math.max(rectA.x, rectB.x),
                );
                const overlapY = Math.max(
                  0,
                  Math.min(rectA.y + rectA.height, rectB.y + rectB.height) -
                    Math.max(rectA.y, rectB.y),
                );

                if (overlapX > 0 && overlapY > 0) {
                  moved = true;
                  const centerA = {
                    x: rectA.x + rectA.width / 2,
                    y: rectA.y + rectA.height / 2,
                  };
                  const centerB = {
                    x: rectB.x + rectB.width / 2,
                    y: rectB.y + rectB.height / 2,
                  };
                  let dx = centerB.x - centerA.x;
                  let dy = centerB.y - centerA.y;

                  if (dx === 0 && dy === 0) {
                    dx = (Math.random() - 0.5) * 2;
                    dy = (Math.random() - 0.5) * 2;
                  }

                  const angle = Math.atan2(dy, dx);
                  const moveX = (overlapX / 2) * Math.cos(angle);
                  const moveY = (overlapY / 2) * Math.sin(angle);

                  nodeA.position.x -= moveX;
                  nodeA.position.y -= moveY;
                  nodeB.position.x += moveX;
                  nodeB.position.y += moveY;
                }
              }
            }
            iterations++;
          } while (moved && iterations < MAX_ITERATIONS);
        }

        // Step 2: Resolve overlaps between selected and unselected nodes
        iterations = 0;
        do {
          moved = false;
          const currentSelectedNodes = tempAllNodes.filter(n =>
            selectedIdsSet.has(n.id),
          );
          const unselectedNodes = tempAllNodes.filter(
            n => !selectedIdsSet.has(n.id),
          );

          for (const selectedNode of currentSelectedNodes) {
            for (const unselectedNode of unselectedNodes) {
              const rectA = { ...selectedNode.position, ...selectedNode.size };
              const rectB = {
                ...unselectedNode.position,
                ...unselectedNode.size,
              };

              const overlapX = Math.max(
                0,
                Math.min(rectA.x + rectA.width, rectB.x + rectB.width) -
                  Math.max(rectA.x, rectB.x),
              );
              const overlapY = Math.max(
                0,
                Math.min(rectA.y + rectA.height, rectB.y + rectB.height) -
                  Math.max(rectA.y, rectB.y),
              );

              if (overlapX > 0 && overlapY > 0) {
                moved = true;
                const centerA = {
                  x: rectA.x + rectA.width / 2,
                  y: rectA.y + rectA.height / 2,
                };
                const centerB = {
                  x: rectB.x + rectB.width / 2,
                  y: rectB.y + rectB.height / 2,
                };
                let dx = centerB.x - centerA.x;
                let dy = centerB.y - centerA.y;

                if (dx === 0 && dy === 0) {
                  dx = (Math.random() - 0.5) * 2;
                  dy = (Math.random() - 0.5) * 2;
                }

                const angle = Math.atan2(dy, dx);
                const moveX = overlapX * Math.cos(angle);
                const moveY = overlapY * Math.sin(angle);

                unselectedNode.position.x += moveX;
                unselectedNode.position.y += moveY;
              }
            }
          }
          iterations++;
        } while (moved && iterations < MAX_ITERATIONS);

        newNodes = tempAllNodes;
        break;
      }
    }

    setAllNodes(newNodes);

    const nodesToUpdate = newNodes.filter(
      node =>
        JSON.stringify(node.position) !== originalNodesMap.get(node.id),
    );

    const updates = nodesToUpdate.map(node =>
      handleUpdateNodePosition(node.id, node.position),
    );

    await Promise.all(updates);
  };

  const handleSaveEditingNode = async nodeToSave => {
    if (!nodeToSave) return;

    const documentPath = RNFS.DocumentDirectoryPath;
    const convertToRelativePath = path => {
      if (path && path.startsWith(documentPath)) {
        return path.substring(documentPath.length + 1);
      }
      return path;
    };

    try {
      let finalAttachmentState = nodeToSave.attachment;

      // Handle attachment changes first
      if (nodeToSave.attachment_deleted && nodeToSave.deleted_attachment_id) {
        await deleteAttachment(nodeToSave.deleted_attachment_id);
        if (!nodeToSave.attachment) {
          finalAttachmentState = null;
        }
      }

      if (nodeToSave.attachment && !nodeToSave.attachment.id) {
        // New attachment, insert it
        const insertData = {
          flow_id: flowId,
          node_id: nodeToSave.id,
          filename: nodeToSave.attachment.filename,
          mime_type: nodeToSave.attachment.mime_type,
          original_uri: nodeToSave.attachment.original_uri,
          stored_path: convertToRelativePath(
            nodeToSave.attachment.stored_path,
          ),
          preview_title: nodeToSave.attachment.preview_title,
          preview_description: nodeToSave.attachment.preview_description,
          preview_image_url: nodeToSave.attachment.preview_image_url,
          thumbnail_path: convertToRelativePath(
            nodeToSave.attachment.thumbnail_path,
          ),
        };
        const result = await insertAttachment(insertData);
        finalAttachmentState = {
          ...nodeToSave.attachment,
          id: result.insertId,
          stored_path: insertData.stored_path,
          thumbnail_path: insertData.thumbnail_path,
        };
      }

      // For existing attachments, ensure paths are relative before saving.
      if (finalAttachmentState && finalAttachmentState.id) {
        finalAttachmentState = {
          ...finalAttachmentState,
          stored_path: convertToRelativePath(finalAttachmentState.stored_path),
          thumbnail_path: convertToRelativePath(
            finalAttachmentState.thumbnail_path,
          ),
        };
      }

      // Then, update the node data
      const dataToUpdate = {
        title: nodeToSave.title,
        description: nodeToSave.description,
        size: nodeToSave.size,
        color: nodeToSave.color,
        attachment: finalAttachmentState,
      };
      await handleUpdateNodeData(flowId, nodeToSave.id, dataToUpdate, fontMgr);
    } catch (err) {
      console.error('Failed to save node or attachment', err);
    } finally {
      setEditingNode(null);
    }
  };

  const fabDisabled = isSeeThrough || linkingState.active || !!editingNode;

  return (
    <PaperProvider theme={OriginalTheme}>
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}
      >
        <FloatingActionButtons
          alignModeOpen={alignModeOpen}
          setAlignModeOpen={setAlignModeOpen}
          handleAlign={handleAlign}
          clearNodeSelection={clearNodeSelection}
          linkingState={linkingState}
          toggleLinkingMode={toggleLinkingMode}
          isSeeThrough={isSeeThrough}
          setIsSeeThrough={setIsSeeThrough}
          showAttachmentsOnCanvas={showAttachmentsOnCanvas}
          setShowAttachmentsOnCanvas={setShowAttachmentsOnCanvas}
          handlePressSectionUp={handlePressSectionUp}
          handleAddNode={handleAddNode}
          resetScale={resetScale}
          moveToNearestCard={moveToNearestCard}
          fabDisabled={fabDisabled}
          setLinkingState={setLinkingState}
        />
        <CanvasRenderer
          composedGesture={composedGesture}
          skiaTransform={skiaTransform}
          skiaOrigin={skiaOrigin}
          displayNodes={displayNodes}
          edges={edges}
          fontMgr={fontMgr}
          paperclipIconSvg={paperclipIconSvg}
          linkingState={linkingState}
          editingNode={editingNode}
          showAttachmentsOnCanvas={showAttachmentsOnCanvas}
          pressState={pressState}
          resolveAttachmentPath={resolveAttachmentPath}
        />
        <EditorModal
          visible={!!editingNode}
          node={editingNode}
          onClose={() => setEditingNode(null)}
          onSave={handleSaveEditingNode}
          onNodeChange={setEditingNode}
          setColorPickerVisible={setColorPickerVisible}
          setUrlInputVisible={setUrlInputVisible}
          handleAttachFile={() => handleAttachFile(editingNode, setEditingNode)}
          handleAttachImageFromLibrary={() =>
            handleAttachImageFromLibrary(editingNode, setEditingNode)
          }
          handleOpenAttachment={() => handleOpenAttachment(editingNode)}
          handleRemoveAttachment={() =>
            handleRemoveAttachment(editingNode, setEditingNode)
          }
          resolveAttachmentPath={resolveAttachmentPath}
        />
        <ColorPickerModal
          visible={colorPickerVisible}
          onClose={() => setColorPickerVisible(false)}
          node={editingNode}
          onColorChange={color => {
            setEditingNode(prev => ({ ...prev, color: color }));
            setColorPickerVisible(false);
          }}
        />
        <UrlInputModal
          visible={urlInputVisible}
          onClose={() => {
            setUrlInputVisible(false);
            setAttachmentUrl('');
          }}
          attachmentUrl={attachmentUrl}
          onUrlChange={handleUrlInputChange}
          onSave={() => handleSaveUrlAttachment(editingNode, setEditingNode)}
        />
      </SafeAreaView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flowArea: {
    flex: 1,
  },
  editingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editingContainer: {
    width: '90%',
    padding: 8,
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  sizeSelectionContainer: {
    marginBottom: 10,
  },
  colorButton: {
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  colorButtonText: {
    fontWeight: 'bold',
  },
  colorPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  colorPickerContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  urlInputContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignSelf: 'center',
  },
  urlInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#ccc',
    marginBottom: 10,
  },
  urlInputLabel: {
    paddingHorizontal: 8,
    color: '#555',
  },
  urlInputField: {
    flex: 1,
    backgroundColor: 'transparent',
    padding: 8,
  },
  scaleIndicatorText: {
    color: 'black',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  attachmentContainer: {
    alignItems: 'center',
  },
  attachmentText: {
    marginTop: 8,
    marginBottom: 10,
  },
  attachmentButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '60%',
  },
  attachmentSection: {
    alignItems: 'center',
    marginVertical: 10,
  },
  attachmentTitle: {
    fontSize: 16,
    marginBottom: 10,
  },
  attachButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    flexWrap: 'wrap',
  },
  attachButton: {
    width: '45%',
    marginBottom: 10,
  },
  thumbnail: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
    marginBottom: 10,
    borderRadius: 5,
  },
});

export default FlowEditorScreen;