import { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import { getNodes, getEdges, updateNode } from '../db';
import { doRectsOverlap, getRect } from '../utils/flowUtils';

export const useFlowData = (flowId, isSeeThrough) => {
  const [allNodes, setAllNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [currentParentId, setCurrentParentId] = useState('root');
  const [parentIdHistory, setParentIdHistory] = useState([]);

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

  const handleUpdateNode = async (nodeId, newData) => {
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

  return {
    allNodes,
    setAllNodes,
    edges,
    setEdges,
    currentParentId,
    setCurrentParentId,
    parentIdHistory,
    setParentIdHistory,
    fetchData,
    displayNodes,
    handleUpdateNode,
  };
};