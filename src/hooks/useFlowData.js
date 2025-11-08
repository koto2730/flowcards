import { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  getNodes,
  getEdges,
  updateNode,
  insertEdge,
  deleteEdge,
  updateEdge,
  insertNode,
  deleteNode,
  getAttachmentByNodeId,
  updateAttachment,
  updateAttachmentPaths,
} from '../db';
import RNFS from 'react-native-fs';
import { doRectsOverlap, getRect, getClosestHandle } from '../utils/flowUtils';

// 3つの固定サイズを定義
const CARD_SIZES = {
  small: { width: 150, height: 60 },
  medium: { width: 150, height: 85 },
  large: { width: 180, height: 254 },
};

export const useFlowData = (flowId, isSeeThrough, alignModeOpen, t) => {
  const [allNodes, setAllNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [currentParentId, setCurrentParentId] = useState('root');
  const [parentIdHistory, setParentIdHistory] = useState([]);
  const [linkingState, setLinkingState] = useState({
    active: false,
    sourceNodeId: null,
    selectedNodeIds: new Set(),
  });

  const fetchData = useCallback(async () => {
    try {
      const nodesData = await getNodes(flowId);
      const edgesData = await getEdges(flowId);

      const attachmentPromises = nodesData.map(n =>
        getAttachmentByNodeId(flowId, n.id),
      );
      let attachments = await Promise.all(attachmentPromises);

      // Lazy migration
      const documentPath = RNFS.DocumentDirectoryPath;
      for (const attachment of attachments) {
        if (attachment) {
          let needsUpdate = false;
          let { stored_path, thumbnail_path } = attachment;

          if (stored_path && stored_path.startsWith(documentPath)) {
            stored_path = stored_path.substring(documentPath.length + 1);
            needsUpdate = true;
          }

          if (thumbnail_path && thumbnail_path.startsWith(documentPath)) {
            thumbnail_path = thumbnail_path.substring(documentPath.length + 1);
            needsUpdate = true;
          }

          if (needsUpdate) {
            await updateAttachmentPaths(
              attachment.id,
              stored_path,
              thumbnail_path,
            );
          }
        }
      }

      // Re-fetch attachments after migration
      const migratedAttachmentPromises = nodesData.map(n =>
        getAttachmentByNodeId(flowId, n.id),
      );
      attachments = await Promise.all(migratedAttachmentPromises);

      const attachmentsMap = attachments.reduce((acc, att) => {
        if (att) {
          acc[att.node_id] = att;
        }
        return acc;
      }, {});

      const formattedNodes = Array.isArray(nodesData)
        ? nodesData.map(n => {
            let size = 'medium'; // デフォルト
            if (
              n.width === CARD_SIZES.small.width &&
              n.height === CARD_SIZES.small.height
            ) {
              size = 'small';
            } else if (
              n.width === CARD_SIZES.large.width &&
              n.height === CARD_SIZES.large.height
            ) {
              size = 'large';
            }

            return {
              id: n.id,
              parentId: n.parentId,
              data: {
                label: n.label ?? '',
                description: n.description ?? '',
                size: size,
                color: n.color ?? '#FFFFFF',
              },
              position: { x: n.x, y: n.y },
              size: { width: n.width, height: n.height },
              color: n.color ?? '#FFFFFF',
              attachment: attachmentsMap[n.id] || null,
            };
          })
        : [];
      setAllNodes(Array.isArray(formattedNodes) ? formattedNodes : []);
      setEdges(Array.isArray(edgesData) ? edgesData : []);
    } catch (error) {
      setAllNodes([]);
      setEdges([]);
      console.error('Failed to fetch data:', error);
      Alert.alert('Error', 'Failed to load flow data.');
    }
  }, [flowId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const displayNodes = useMemo(() => {
    if (!Array.isArray(allNodes)) {
      return [];
    }
    const baseNodes = allNodes.filter(
      node => node.parentId === currentParentId,
    );

    if (!isSeeThrough) {
      const newMap = baseNodes.map(n => ({ ...n, zIndex: 1 }));
      return Array.isArray(newMap) ? newMap : [];
    }

    const PADDING = 20;
    const TITLE_HEIGHT = 40;
    const CARD_SPACING = 20;

    const workingNodes = JSON.parse(JSON.stringify(baseNodes));
    const allNodesCopy = JSON.parse(JSON.stringify(allNodes));

    const initialCenters = new Map();
    workingNodes.forEach(node => {
      initialCenters.set(node.id, {
        x: node.position.x + node.size.width / 2,
        y: node.position.y + node.size.height / 2,
      });
    });

    const topLevelNodes = [];
    const childrenByParent = new Map();
    const originalNodesMap = new Map();

    workingNodes.forEach(node => {
      originalNodesMap.set(node.id, JSON.parse(JSON.stringify(node)));
      const children = allNodesCopy.filter(n => n.parentId === node.id);
      if (children.length > 0) {
        const minX = Math.min(...children.map(c => c.position.x));
        const minY = Math.min(...children.map(c => c.position.y));

        const arrangedChildren = children.map(child => {
          const newX = node.position.x + PADDING + (child.position.x - minX);
          const newY =
            node.position.y + TITLE_HEIGHT + (child.position.y - minY);
          return {
            ...child,
            position: { x: newX, y: newY },
          };
        });

        const maxChildX = Math.max(
          ...arrangedChildren.map(
            c => c.position.x - node.position.x + c.size.width,
          ),
        );
        const maxChildY = Math.max(
          ...arrangedChildren.map(
            c => c.position.y - node.position.y + c.size.height,
          ),
        );

        const calculatedParentWidth = Math.max(
          node.size.width,
          maxChildX + PADDING,
        );
        const calculatedParentHeight = Math.max(
          node.size.height,
          maxChildY + PADDING,
        );

        node.size = {
          width: calculatedParentWidth,
          height: calculatedParentHeight,
        };
        node.isSeeThroughParent = true;
        node.zIndex = 1;
        childrenByParent.set(node.id, arrangedChildren);
      } else {
        node.isSeeThroughParent = false;
        node.zIndex = 1;
      }
      topLevelNodes.push(node);
    });

    let changed = true;
    const MAX_ITERATIONS = 100;
    let iterations = 0;

    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;

      for (let i = 0; i < topLevelNodes.length; i++) {
        for (let j = i + 1; j < topLevelNodes.length; j++) {
          const nodeA = topLevelNodes[i];
          const nodeB = topLevelNodes[j];

          if (doRectsOverlap(getRect(nodeA), getRect(nodeB))) {
            changed = true;

            const overlapX =
              Math.min(
                nodeA.position.x + nodeA.size.width,
                nodeB.position.x + nodeB.size.width,
              ) - Math.max(nodeA.position.x, nodeB.position.x);
            const overlapY =
              Math.min(
                nodeA.position.y + nodeA.size.height,
                nodeB.position.y + nodeB.size.height,
              ) - Math.max(nodeA.position.y, nodeB.position.y);

            const initialCenterA = initialCenters.get(nodeA.id);
            const initialCenterB = initialCenters.get(nodeB.id);

            const initialDx = initialCenterB.x - initialCenterA.x;
            const initialDy = initialCenterB.y - initialCenterA.y;

            if (overlapX < overlapY) {
              const move = (overlapX + CARD_SPACING) / 2;
              if (initialDx > 0) {
                nodeA.position.x -= move;
                nodeB.position.x += move;
              } else {
                nodeA.position.x += move;
                nodeB.position.x -= move;
              }
            } else {
              const move = (overlapY + CARD_SPACING) / 2;
              if (initialDy > 0) {
                nodeA.position.y -= move;
                nodeB.position.y += move;
              } else {
                nodeA.position.y += move;
                nodeB.position.y -= move;
              }
            }
          }
        }
      }
    }

    const finalNodes = [...topLevelNodes];

    topLevelNodes.forEach(adjustedParent => {
      if (childrenByParent.has(adjustedParent.id)) {
        const originalParent = originalNodesMap.get(adjustedParent.id);
        const children = childrenByParent.get(adjustedParent.id);

        const dx = adjustedParent.position.x - originalParent.position.x;
        const dy = adjustedParent.position.y - originalParent.position.y;

        const adjustedChildren = children.map(child => ({
          ...child,
          position: {
            x: child.position.x + dx,
            y: child.position.y + dy,
          },
          zIndex: 10,
        }));
        finalNodes.push(...adjustedChildren);
      }
    });

    return Array.isArray(finalNodes) ? finalNodes : [];
  }, [allNodes, currentParentId, isSeeThrough, edges]);

  const handleUpdateNodeData = async (flowId, nodeId, newData) => {
    try {
      const newDimensions = CARD_SIZES[newData.size] || CARD_SIZES.medium;

      const dbUpdateData = {
        label: newData.title,
        description: newData.description,
        width: newDimensions.width,
        height: newDimensions.height, // Add bottom margin
        color: newData.color,
      };

      await updateNode(nodeId, dbUpdateData);
      if (newData?.attachment) {
        const dbAttachmentUpdateData = {
          id: newData.attachment.id,
          flow_id: flowId,
          node_id: nodeId,
          filename: newData.attachment.filename
            ? newData.attachment.filename
            : '',
          mime_type: newData.attachment.mime_type
            ? newData.attachment.mime_type
            : '',
          original_uri: newData.attachment.original_uri
            ? newData.attachment.original_uri
            : '',
          stored_path: newData.attachment.stored_path
            ? newData.attachment.stored_path
            : '',
          preview_title: newData.attachment.preview_title
            ? newData.attachment.preview_title
            : '',
          preview_description: newData.attachment.preview_description
            ? newData.attachment.preview_description
            : '',
          preview_image_url: newData.attachment.preview_image_url
            ? newData.attachment.preview_image_url
            : '',
          thumbnail_path: newData.attachment.thumbnail_path
            ? newData.attachment.thumbnail_path
            : '',
        };
        await updateAttachment(
          dbAttachmentUpdateData.id,
          dbAttachmentUpdateData,
        );
      }
      await fetchData();
    } catch (error) {
      console.error('Failed to update node data:', error);
      Alert.alert('Error', 'Failed to update node data.');
    }
  };

  const handleUpdateNodePosition = async (nodeId, newPosition) => {
    if (isSeeThrough) return;
    try {
      await updateNode(nodeId, { x: newPosition.x, y: newPosition.y });
      setAllNodes(nds =>
        Array.isArray(nds)
          ? nds.map(node =>
              node.id === nodeId ? { ...node, position: newPosition } : node,
            )
          : [],
      );
    } catch (error) {
      console.error('Failed to update node position:', error);
    }
  };

  const addNode = async position => {
    const newNodeData = {
      id: uuidv4(),
      flowId: flowId,
      parentId: currentParentId,
      label: t('newCard'),
      description: '',
      x: position.x,
      y: position.y,
      width: CARD_SIZES.medium.width,
      height: CARD_SIZES.medium.height,
      color: '#FFFFFF',
    };
    try {
      await insertNode(newNodeData);
      fetchData(); // Re-fetch to get the new node
    } catch (error) {
      console.error('Failed to add node:', error);
    }
  };

  const handleDeleteNode = async nodeId => {
    const nodesToRemove = new Set();
    const findChildren = id => {
      nodesToRemove.add(id);
      allNodes.forEach(n => {
        if (n.parentId === id) {
          findChildren(n.id);
        }
      });
    };
    findChildren(nodeId);

    try {
      const deletePromises = Array.from(nodesToRemove).map(async id => {
        const attachment = await getAttachmentByNodeId(flowId, id);
        if (attachment) {
          if (attachment.stored_path) {
            const fileExists = await RNFS.exists(attachment.stored_path);
            if (fileExists) {
              await RNFS.unlink(attachment.stored_path);
            }
          }
          if (attachment.thumbnail_path) {
            const thumbExists = await RNFS.exists(attachment.thumbnail_path);
            if (thumbExists) {
              await RNFS.unlink(attachment.thumbnail_path);
            }
          }
        }
        return deleteNode(id);
      });

      await Promise.all(deletePromises);
      fetchData();
    } catch (error) {
      console.error('Failed to delete node(s):', error);
    }
  };

  const handleDoubleClick = nodeId => {
    if (isSeeThrough || linkingState.active) return;
    const node = allNodes.find(n => n.id === nodeId);
    if (node) {
      setParentIdHistory(history => [...history, currentParentId]);
      setCurrentParentId(nodeId);
    }
  };

  const handleSectionUp = async screenCenter => {
    if (isSeeThrough || linkingState.active) return;
    if (parentIdHistory.length > 0) {
      const newHistory = [...parentIdHistory];
      const lastParentId = newHistory.pop();
      setParentIdHistory(newHistory);
      setCurrentParentId(lastParentId);
    } else {
      if (displayNodes.length === 0) return;

      const newParentId = uuidv4();
      const newParentNode = {
        id: newParentId,
        flowId: flowId,
        parentId: 'root',
        label: t('newSection'),
        description: t('grouped'),
        x: screenCenter.x - CARD_SIZES.medium.width / 2,
        y: screenCenter.y - CARD_SIZES.medium.height / 2,
        width: CARD_SIZES.medium.width,
        height: CARD_SIZES.medium.height,
      };

      try {
        await insertNode(newParentNode);
        const childrenIds = displayNodes.map(n => n.id);
        await Promise.all(
          childrenIds.map(id => updateNode(id, { parentId: newParentId })),
        );
        fetchData();
      } catch (error) {
        console.error('Failed to create section:', error);
      }
    }
  };

  const toggleNodeSelection = nodeId => {
    setLinkingState(prev => {
      const newSelectedIds = new Set(prev.selectedNodeIds);
      if (newSelectedIds.has(nodeId)) {
        newSelectedIds.delete(nodeId);
      } else {
        newSelectedIds.add(nodeId);
      }
      return { ...prev, selectedNodeIds: newSelectedIds };
    });
  };

  const toggleLinkingMode = () => {
    setLinkingState(prev => ({
      ...prev,
      active: !prev.active,
      sourceNodeId: null,
      selectedNodeIds: new Set(), // Clear selection when toggling linking mode
    }));
  };

  const handleDeleteEdge = async edgeId => {
    try {
      await deleteEdge(edgeId);
      setEdges(eds => eds.filter(edge => edge.id !== edgeId));
    } catch (error) {
      console.error('Failed to delete edge:', error);
    }
  };

  const handleCardTap = async nodeId => {
    if (alignModeOpen) {
      toggleNodeSelection(nodeId);
      return;
    }

    if (!linkingState.active) return;

    if (!linkingState.sourceNodeId) {
      setLinkingState(prev => ({ ...prev, sourceNodeId: nodeId }));
    } else {
      if (linkingState.sourceNodeId === nodeId) {
        setLinkingState(prev => ({ ...prev, sourceNodeId: null }));
        return;
      }

      const sourceNode = allNodes.find(n => n.id === linkingState.sourceNodeId);
      const targetNode = allNodes.find(n => n.id === nodeId);

      if (sourceNode && targetNode) {
        const forwardEdge = edges.find(
          edge =>
            edge.source === linkingState.sourceNodeId && edge.target === nodeId,
        );

        if (forwardEdge) {
          setLinkingState(prev => ({ ...prev, sourceNodeId: null }));
          return;
        }

        const reverseEdge = edges.find(
          edge =>
            edge.source === nodeId && edge.target === linkingState.sourceNodeId,
        );

        if (reverseEdge) {
          try {
            await updateEdge(reverseEdge.id, { type: 'bidirectional' });
            setEdges(eds =>
              eds.map(e =>
                e.id === reverseEdge.id ? { ...e, type: 'bidirectional' } : e,
              ),
            );
          } catch (error) {
            console.error('Failed to update edge to bidirectional:', error);
          }
        } else {
          const sourceHandle = getClosestHandle(sourceNode, targetNode);
          const targetHandle = getClosestHandle(targetNode, sourceNode);

          const newEdge = {
            id: uuidv4(),
            flowId: flowId,
            source: linkingState.sourceNodeId,
            target: nodeId,
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            type: 'default',
          };
          try {
            await insertEdge(newEdge);
            setEdges(eds => [...eds, newEdge]);
          } catch (error) {
            console.error('Failed to add edge:', error);
          }
        }
        setLinkingState(prev => ({ ...prev, sourceNodeId: null }));
      }
    }
  };

  return {
    allNodes,
    setAllNodes,
    edges,
    setEdges,
    currentParentId,
    parentIdHistory,
    fetchData,
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
  };
};
