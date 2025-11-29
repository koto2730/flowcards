import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
} from 'react';
import RNFS from 'react-native-fs';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  getNodes,
  getEdges,
  insertNode,
  updateNode,
  deleteNode as dbDeleteNode,
  insertEdge,
  deleteEdge as dbDeleteEdge,
  getAttachmentByNodeId,
  insertAttachment,
  deleteAttachment,
  updateAttachment,
  updateAttachmentPaths,
} from '../db';
import {
  processNodes,
  processEdges,
  getClosestHandle,
} from '../utils/flowUtils';
import { ATTACHMENT_DIR } from '../constants/fileSystem';

const FlowContext = createContext(null);

const initialState = {
  allNodes: [],
  edges: [],
  linkingState: {
    active: false,
    startNode: null,
    endNode: null,
    selectedNodeIds: new Set(),
  },
  isDataLoaded: false,
  editingNode: null,
  currentParentId: 'root',
  parentIdHistory: [],
};

function flowReducer(state, action) {
  switch (action.type) {
    case 'SET_DATA':
      return {
        ...state,
        allNodes: action.payload.nodes,
        edges: action.payload.edges,
        isDataLoaded: true,
      };
    case 'SET_NODES':
      return { ...state, allNodes: action.payload };
    case 'UPDATE_NODE_POSITION_IMMEDIATE': {
      const { nodeId, position } = action.payload;
      return {
        ...state,
        allNodes: state.allNodes.map(node =>
          node.id === nodeId ? { ...node, position } : node,
        ),
      };
    }
    case 'UPDATE_NODE_POSITION': {
      const { nodeId, position } = action.payload;
      return {
        ...state,
        allNodes: state.allNodes.map(node =>
          node.id === nodeId ? { ...node, position } : node,
        ),
      };
    }
    case 'SET_LINKING_STATE':
      return { ...state, linkingState: action.payload };
    case 'OPEN_EDITOR':
      return { ...state, editingNode: action.payload };
    case 'CLOSE_EDITOR':
      return { ...state, editingNode: null };
    case 'UPDATE_EDITING_NODE':
      return { ...state, editingNode: action.payload };
    case 'SET_PARENT':
      return {
        ...state,
        currentParentId: action.payload.currentParentId,
        parentIdHistory: action.payload.parentIdHistory,
      };
    default:
      return state;
  }
}

export function FlowProvider({ children, flowId }) {
  const [state, dispatch] = useReducer(flowReducer, initialState);

  const loadData = useCallback(async () => {
    try {
      const [nodesDataFromDB, edgesData] = await Promise.all([
        getNodes(flowId),
        getEdges(flowId),
      ]);
      const nodesData = nodesDataFromDB.map(node => {
        return {
          id: node.id,
          parentId: node.parentId,
          label: node.label,
          description: node.description,
          color: node.color,
          contents: node.contents,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
        };
      });

      const attachmentPromises = nodesData.map(n =>
        getAttachmentByNodeId(flowId, n.id),
      );
      const attachments = await Promise.all(attachmentPromises);

      const attachmentsMap = attachments.reduce((acc, att) => {
        if (att) {
          acc[att.node_id] = att;
        }
        return acc;
      }, {});

      const nodes = processNodes(nodesData, attachmentsMap);
      const edges = processEdges(edgesData);

      dispatch({ type: 'SET_DATA', payload: { nodes, edges } });
    } catch (error) {
      console.error('Failed to load flow data:', error);
    }
  }, [flowId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addNode = useCallback(async () => {
    const newNode = {
      id: uuidv4(),
      flowId,
      parentId: state.currentParentId,
      label: 'New Card',
      description: '',
      x: 10,
      y: 10,
      width: 150,
      height: 85,
      color: '#FFFFFF',
    };
    try {
      await insertNode(newNode);
      await loadData();
    } catch (error) {
      console.error('Failed to add node:', error);
    }
  }, [flowId, loadData, state.currentParentId]);

  const updateNodePosition = useCallback(async (nodeId, position) => {
    try {
      dispatch({ type: 'UPDATE_NODE_POSITION', payload: { nodeId, position } });
      await updateNode(nodeId, { x: position.x, y: position.y });
    } catch (error) {
      console.error('Failed to update node position:', error);
    }
  }, []);

  const updateNodeData = useCallback(
    async (nodeId, data) => {
      try {
        await updateNode(nodeId, data);
        await loadData();
      } catch (error) {
        console.error('Failed to update node data:', error);
      }
    },
    [loadData],
  );

  const deleteNode = useCallback(
    async nodeId => {
      try {
        await dbDeleteNode(nodeId); // DB handles cascading deletes
        await loadData();
      } catch (error) {
        console.error('Failed to delete node(s):', error);
      }
    },
    [loadData],
  );

  const addEdge = useCallback(
    async (source, target) => {
      const sourceNode = state.allNodes.find(n => n.id === source);
      const targetNode = state.allNodes.find(n => n.id === target);
      if (!sourceNode || !targetNode) return;

      const newEdge = {
        id: uuidv4(),
        flowId,
        source,
        target,
        sourceHandle: getClosestHandle(sourceNode, targetNode),
        targetHandle: getClosestHandle(targetNode, sourceNode),
        type: 'default',
      };
      try {
        await insertEdge(newEdge);
        await loadData();
      } catch (error) {
        console.error('Failed to add edge:', error);
      }
    },
    [flowId, loadData, state.allNodes],
  );

  const deleteEdge = useCallback(
    async edgeId => {
      try {
        await dbDeleteEdge(edgeId);
        await loadData();
      } catch (error) {
        console.error('Failed to delete edge:', error);
      }
    },
    [loadData],
  );

  const setLinkingState = useCallback(linkingState => {
    dispatch({ type: 'SET_LINKING_STATE', payload: linkingState });
  }, []);

  const goIntoNode = useCallback(
    nodeId => {
      dispatch({
        type: 'SET_PARENT',
        payload: {
          currentParentId: nodeId,
          parentIdHistory: [...state.parentIdHistory, state.currentParentId],
        },
      });
    },
    [state.parentIdHistory, state.currentParentId],
  );

  const goBack = useCallback(() => {
    if (state.parentIdHistory.length === 0) return;
    const newHistory = [...state.parentIdHistory];
    const lastParentId = newHistory.pop();
    dispatch({
      type: 'SET_PARENT',
      payload: {
        currentParentId: lastParentId,
        parentIdHistory: newHistory,
      },
    });
  }, [state.parentIdHistory]);

  const openEditor = useCallback(
    async nodeId => {
      const nodeToEdit = state.allNodes.find(n => n.id === nodeId);
      console.log(nodeToEdit);
      if (!nodeToEdit) return;

      try {
        const attachment = await getAttachmentByNodeId(flowId, nodeId);
        dispatch({
          type: 'OPEN_EDITOR',
          payload: {
            ...nodeToEdit,
            label: nodeToEdit.label,
            description: nodeToEdit.description,
            color: nodeToEdit.color,
            attachment: attachment,
          },
        });
      } catch (e) {
        console.error('Failed to fetch attachment', e);
        dispatch({
          type: 'OPEN_EDITOR',
          payload: {
            ...nodeToEdit,
            label: nodeToEdit.label,
            description: nodeToEdit.description,
            color: nodeToEdit.color,
            attachment: null,
          },
        });
      }
    },
    [state.allNodes, flowId],
  );

  const closeEditor = useCallback(() => {
    dispatch({ type: 'CLOSE_EDITOR' });
  }, []);

  const saveEditor = useCallback(async () => {
    const nodeToSave = state.editingNode;
    if (!nodeToSave) return;

    try {
      const nodeUpdateData = {
        label: nodeToSave.label,
        description: nodeToSave.description,
        color: nodeToSave.color,
        width: nodeToSave.width,
        height: nodeToSave.height,
      };
      await updateNode(nodeToSave.id, nodeUpdateData);

      if (nodeToSave.attachment_deleted && nodeToSave.deleted_attachment_id) {
        await deleteAttachment(nodeToSave.deleted_attachment_id);
      }
      if (nodeToSave.attachment && !nodeToSave.attachment.id) {
        await insertAttachment({
          ...nodeToSave.attachment,
          flow_id: flowId,
          node_id: nodeToSave.id,
        });
      } else if (nodeToSave.attachment) {
        await updateAttachment(nodeToSave.attachment.id, nodeToSave.attachment);
      }
    } catch (err) {
      console.error('Failed to save node or attachment', err);
    } finally {
      closeEditor();
      await loadData();
    }
  }, [state.editingNode, flowId, closeEditor, loadData]);

  const value = {
    ...state,
    dispatch,
    addNode,
    updateNodePosition,
    updateNodeData,
    deleteNode,
    addEdge,
    deleteEdge,
    setLinkingState,
    openEditor,
    closeEditor,
    saveEditor,
    goIntoNode,
    goBack,
  };

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlowContext() {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}
