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
} from '../db';
import { doRectsOverlap, getRect, getClosestHandle } from '../utils/flowUtils';

const CARD_MIN_SIZE = { width: 150, height: 70 };

export const useFlowData = (flowId, isSeeThrough) => {
  const [allNodes, setAllNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [currentParentId, setCurrentParentId] = useState('root');
  const [parentIdHistory, setParentIdHistory] = useState([]);
  const [linkingState, setLinkingState] = useState({
    active: false,
    sourceNodeId: null,
  });

  const fetchData = useCallback(async () => {
    try {
      const nodesData = await getNodes(flowId);
      const edgesData = await getEdges(flowId);

      const formattedNodes = Array.isArray(nodesData)
        ? nodesData.map(n => ({
            id: n.id,
            parentId: n.parentId,
            data: { label: n.label ?? '', description: n.description ?? '' },
            position: { x: n.x, y: n.y },
            size: { width: n.width, height: n.height },
          }))
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

  const handleUpdateNodeData = async (nodeId, newData) => {
    try {
      await updateNode(nodeId, {
        label: newData.title,
        description: newData.description,
      });
      setAllNodes(nds =>
        Array.isArray(nds)
          ? nds.map(node =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      label: newData.title ?? '',
                      description: newData.description ?? '',
                    },
                  }
                : node,
            )
          : [],
      );
    } catch (error) {
      console.error('Failed to update node data:', error);
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
      label: '新しいカード',
      description: '',
      x: position.x,
      y: position.y,
      width: CARD_MIN_SIZE.width,
      height: CARD_MIN_SIZE.height,
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
      await Promise.all(Array.from(nodesToRemove).map(id => deleteNode(id)));
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
        label: '新しいセクション',
        description: 'グループ化されました',
        x: screenCenter.x - CARD_MIN_SIZE.width / 2,
        y: screenCenter.y - CARD_MIN_SIZE.height / 2,
        width: CARD_MIN_SIZE.width,
        height: CARD_MIN_SIZE.height,
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

  const toggleLinkingMode = () => {
    setLinkingState(prev => ({ active: !prev.active, sourceNodeId: null }));
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
    if (!linkingState.active) return;

    if (!linkingState.sourceNodeId) {
      setLinkingState({ active: true, sourceNodeId: nodeId });
    } else {
      if (linkingState.sourceNodeId === nodeId) {
        setLinkingState({ active: true, sourceNodeId: null });
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
          setLinkingState({ active: true, sourceNodeId: null });
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
        setLinkingState({ active: true, sourceNodeId: null });
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
    toggleLinkingMode,
    handleCardTap,
    handleDeleteEdge,
  };
};
