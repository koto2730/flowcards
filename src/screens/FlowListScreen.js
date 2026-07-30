import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import {
  Provider as PaperProvider,
  FAB,
  Portal,
  Button,
  List,
  Checkbox,
  Appbar,
  TextInput,
  Card,
  Modal,
  Searchbar,
  Menu,
  Divider,
} from 'react-native-paper';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import ColorPalette from 'react-native-color-palette';
import {
  getFlows,
  getAllFlowTags,
  insertFlow,
  deleteFlow,
  updateFlow,
  deleteNodesByFlowId,
  deleteEdgesByFlowId,
  resetDB,
  getFlowDiskUsage,
  getNodes,
  getEdges,
  getAttachmentByNodeId,
} from '../db';
import OriginalTheme from './OriginalTheme';
import { useTranslation } from 'react-i18next';
import { convertFlowToJSONCanvas } from '../utils/flowUtils';
import { sanitizeFilename } from '../utils/fileSafety';
import { zip } from 'react-native-zip-archive';

const PAGE_SIZE = 15;

// Override Paper theme fragments so the outlined TextInput inside the
// edit modal reads black-on-white regardless of the app's dark surface.
const editModalInputTheme = {
  colors: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    onSurface: '#000000',
    onSurfaceVariant: '#666666',
    primary: OriginalTheme.colors.primary,
  },
};

const FlowListScreen = ({ navigation }) => {
  const [flows, setFlows] = useState([]);
  const [editingFlowId, setEditingFlowId] = useState(null);
  const [newFlowName, setNewFlowName] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFlows, setSelectedFlows] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  // Pagination and loading state
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  // Search and Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [sort, setSort] = useState({ sortBy: 'createdAt', sortOrder: 'DESC' });
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  // Tag / color (#36)
  const [allTags, setAllTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFlow, setEditingFlow] = useState(null); // { id, name, tag, color }
  const [colorPickerVisible, setColorPickerVisible] = useState(false);

  const { t, i18n } = useTranslation();

  const fetchFlows = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      }

      const offset = isRefresh ? 0 : page * PAGE_SIZE;
      const options = {
        limit: PAGE_SIZE,
        offset,
        searchQuery: debouncedSearchQuery,
        tagFilter: selectedTag,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      };

      try {
        const flowsData = await getFlows(options);
        if (flowsData.length < PAGE_SIZE) {
          setHasMore(false);
        }

        const flowsWithDiskUsage = await Promise.all(
          flowsData.map(async flow => {
            const diskUsage = await getFlowDiskUsage(flow.id);
            return { ...flow, diskUsage };
          }),
        );

        if (isRefresh) {
          setFlows(flowsWithDiskUsage);
          setPage(1);
          if (flowsData.length >= PAGE_SIZE) {
            setHasMore(true);
          }
        } else if (hasMore) {
          setFlows(prevFlows => [...prevFlows, ...flowsWithDiskUsage]);
          setPage(prevPage => prevPage + 1);
        }
      } catch (error) {
        console.error('FlowListScreen: Failed to fetch flows:', error);
      } finally {
        if (isRefresh) {
          setRefreshing(false);
        }
        setLoadingMore(false);
      }
    },
    [page, hasMore, debouncedSearchQuery, sort, selectedTag],
  );

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Trigger refresh when debounced query, sort, or tag filter changes
  useEffect(() => {
    fetchFlows(true);
  }, [debouncedSearchQuery, sort, selectedTag]);

  // Keep the tag filter list in sync with the flows currently in the DB.
  const refreshTags = useCallback(async () => {
    try {
      const tags = await getAllFlowTags();
      setAllTags(tags);
      // If the currently selected tag was removed from all flows, clear it.
      if (selectedTag && !tags.includes(selectedTag)) {
        setSelectedTag(null);
      }
    } catch (e) {
      console.error('Failed to fetch tags:', e);
    }
  }, [selectedTag]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags, flows.length]);

  const onRefresh = () => fetchFlows(true);

  const loadMoreFlows = () => {
    if (!refreshing && !loadingMore && hasMore) {
      setLoadingMore(true);
      fetchFlows(false);
    }
  };

  // Refetch on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('FlowListScreen: Screen focused, fetching flows.');
      fetchFlows(true);
      setSelectionMode(false);
      setSelectedFlows([]);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (selectionMode && selectedFlows.length === 0) {
      setSelectionMode(false);
    }
  }, [selectedFlows, selectionMode]);

  const handleAddFlowRow = () => {
    if (flows.some(f => f.isNew)) {
      return;
    }
    const tempId = `temp-${Date.now()}`;
    setFlows([{ id: tempId, name: '', isNew: true }, ...flows]);
    setEditingFlowId(tempId);
    setNewFlowName('');
  };

  const handleSaveNewFlow = async tempId => {
    if (!newFlowName.trim()) {
      Alert.alert(t('error'), t('flowNameEmpty'));
      return;
    }
    try {
      const newFlow = { name: newFlowName };
      const result = await insertFlow(newFlow);
      const newFlowId = result.insertId;

      setEditingFlowId(null);
      setNewFlowName('');
      fetchFlows(true);
      navigation.navigate('FlowEditor', { flowId: newFlowId, flowName: newFlowName });
    } catch (error) {
      console.error('Failed to add flow:', error);
    }
  };

  const handleCancelNewFlow = tempId => {
    setFlows(flows.filter(f => f.id !== tempId));
    setEditingFlowId(null);
    setNewFlowName('');
  };

  const toggleSelection = id => {
    if (selectedFlows.includes(id)) {
      setSelectedFlows(selectedFlows.filter(flowId => flowId !== id));
    } else {
      setSelectedFlows([...selectedFlows, id]);
    }
  };

  const handleEditExistingFlow = item => {
    setEditingFlow({
      id: item.id,
      name: item.name || '',
      tag: item.tag || '',
      color: item.color || '',
    });
    setEditModalVisible(true);
  };

  // Live-transform the tag input while the user is typing: when the
  // last character just became a separator (space / comma) and the
  // token immediately before it lacks a leading `#`, prepend one so
  // users don't have to reach for `#` on the mobile keyboard.
  const autocompleteHashInTagInput = text => {
    if (typeof text !== 'string' || text.length === 0) return text;
    const lastChar = text.slice(-1);
    if (lastChar !== ' ' && lastChar !== ',') return text;
    const beforeSep = text.replace(/[\s,]+$/, '');
    const trailing = text.slice(beforeSep.length);
    if (!beforeSep) return text;
    const tokens = beforeSep.split(/[\s,]+/);
    const lastToken = tokens[tokens.length - 1];
    if (!lastToken || lastToken.startsWith('#')) return text;
    return beforeSep.slice(0, -lastToken.length) + '#' + lastToken + trailing;
  };

  // Normalize a user-entered tag string to " "-separated `#tag` tokens.
  // Splits on any whitespace or comma, drops empty and single-`#` entries,
  // prepends `#` when missing.
  const normalizeTags = input => {
    if (!input) return '';
    return String(input)
      .split(/[\s,]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(t => (t.startsWith('#') ? t : `#${t}`))
      .filter(t => t.length > 1)
      .join(' ');
  };

  const handleSaveEditModal = async () => {
    if (!editingFlow || !editingFlow.name.trim()) {
      Alert.alert(t('error'), t('flowNameEmpty'));
      return;
    }
    try {
      await updateFlow(editingFlow.id, {
        name: editingFlow.name.trim(),
        tag: normalizeTags(editingFlow.tag),
        color: editingFlow.color || null,
      });
      setEditModalVisible(false);
      setEditingFlow(null);
      fetchFlows(true);
      // Tag / color edits do not change flow count, so trigger a tag
      // refresh explicitly (the length-based effect wouldn't fire).
      refreshTags();
    } catch (error) {
      console.error('Failed to update flow:', error);
    }
  };

  const handleCancelEditModal = () => {
    setEditModalVisible(false);
    setEditingFlow(null);
  };

  const handleDeleteFlow = id => {
    Alert.alert(
      t('deleteConfirmTitle'),
      t('deleteConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ok'),
          onPress: async () => {
            try {
              await deleteNodesByFlowId(id);
              await deleteEdgesByFlowId(id);
              await deleteFlow(id);
              fetchFlows(true);
            } catch (error) {
              Alert.alert(t('deleteFailedTitle'), t('deleteFailed'));
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleExportFlows = async () => {
    if (selectedFlows.length !== 1) {
      Alert.alert(t('exportError'), t('exportSingleFlowOnly'));
      return;
    }

    const exportFlow = async format => {
      const flowId = selectedFlows[0];
      const flow = flows.find(f => f.id === flowId);
      if (!flow) return;

      const exportTempDir = `${RNFS.TemporaryDirectoryPath}/export_${
        flow.id
      }_${Date.now()}`;
      const zipPath = `${RNFS.TemporaryDirectoryPath}/${sanitizeFilename(
        flow.name.replace(/\s/g, '_'),
      )}.zip`;

      try {
        const allNodes = await getNodes(flowId);
        const allEdges = await getEdges(flowId);

        const nodesByParent = allNodes.reduce((acc, node) => {
          const parentId = node.parentId || 'root';
          if (!acc[parentId]) {
            acc[parentId] = [];
          }
          acc[parentId].push(node);
          return acc;
        }, {});

        const allAttachments = new Map();
        for (const node of allNodes) {
          const attachment = await getAttachmentByNodeId(flow.id, node.id);
          if (attachment) {
            allAttachments.set(node.id, attachment);
          }
        }

        if (format === 'zip') {
          const attachmentsDir = `${exportTempDir}/attachments`;
          await RNFS.mkdir(exportTempDir);
          await RNFS.mkdir(attachmentsDir); // Create attachments subdirectory

          const updatedAttachments = new Map();

          for (const node of allNodes) {
            const attachment = allAttachments.get(node.id);
            if (attachment && attachment.stored_path) {
              // 1. Resolve source path
              const sourcePath = `${RNFS.DocumentDirectoryPath}/${attachment.stored_path}`;

              const fileExists = await RNFS.exists(sourcePath);
              if (fileExists) {
                const filename = attachment.stored_path.split('/').pop();
                // 2. Copy to a structured directory
                const destPath = `${attachmentsDir}/${filename}`;
                await RNFS.copyFile(sourcePath, destPath);

                // 3. Create updated attachment info with relative path for the zip
                const updatedAttachment = { ...attachment };
                updatedAttachment.stored_path = `attachments/${filename}`; // New relative path
                if (updatedAttachment.thumbnail_path) {
                  // Also update thumbnail path if it exists and is the same
                  const thumbFilename =
                    attachment.thumbnail_path.split('/').pop();
                  updatedAttachment.thumbnail_path = `attachments/${thumbFilename}`;
                }
                updatedAttachments.set(node.id, updatedAttachment);
              } else {
                console.warn(
                  `Attachment file not found, skipping: ${sourcePath}`,
                );
              }
            } else if (attachment) {
              // For attachments without stored_path (like URLs), just pass them through
              updatedAttachments.set(node.id, attachment);
            }
          }

          for (const parentId in nodesByParent) {
            const sectionNodes = [...nodesByParent[parentId]];
            const sectionNodeIds = new Set(sectionNodes.map(n => n.id));

            const sectionEdges = allEdges.filter(
              e => sectionNodeIds.has(e.source) && sectionNodeIds.has(e.target),
            );

            const sectionAttachments = {};
            for (const node of sectionNodes) {
              if (updatedAttachments.has(node.id)) {
                sectionAttachments[node.id] = updatedAttachments.get(node.id);
              }
            }

            const parentNode = allNodes.find(n => n.id === parentId);
            const sectionName = parentNode ? parentNode.label : '';
            const canvasName = parentId === 'root' ? flow.name : sectionName;

            const jsonCanvas = convertFlowToJSONCanvas(
              flow,
              sectionNodes,
              sectionEdges,
              sectionAttachments,
            );

            const canvasData = JSON.stringify(jsonCanvas, null, 2);
            const fileName = `${sanitizeFilename(canvasName.replace(/\s/g, '_'))}.canvas`;
            const filePath = `${exportTempDir}/${fileName}`;
            await RNFS.writeFile(filePath, canvasData, 'utf8');
          }

          await zip(exportTempDir, zipPath);

          await Share.open({
            title: t('exportFlow', { count: 1 }),
            url: `file://${zipPath}`,
            type: 'application/zip',
            failOnCancel: false,
          });
        } else {
          // canvas only
          const filesToShare = [];
          const fileNames = [];
          for (const parentId in nodesByParent) {
            const sectionNodes = [...nodesByParent[parentId]];
            const sectionNodeIds = new Set(sectionNodes.map(n => n.id));

            const sectionEdges = allEdges.filter(
              e => sectionNodeIds.has(e.source) && sectionNodeIds.has(e.target),
            );

            const sectionAttachments = {};
            for (const node of sectionNodes) {
              if (allAttachments.has(node.id)) {
                sectionAttachments[node.id] = allAttachments.get(node.id);
              }
            }

            const parentNode = allNodes.find(n => n.id === parentId);
            const sectionName = parentNode ? parentNode.label : '';
            const canvasName = parentId === 'root' ? flow.name : sectionName;

            const jsonCanvas = convertFlowToJSONCanvas(
              flow,
              sectionNodes,
              sectionEdges,
              sectionAttachments,
            );

            const canvasData = JSON.stringify(jsonCanvas, null, 2);
            const fileName = `${sanitizeFilename(canvasName.replace(/\s/g, '_'))}.canvas`;
            fileNames.push(fileName);
            const filePath = `${RNFS.TemporaryDirectoryPath}/${fileName}`;
            await RNFS.writeFile(filePath, canvasData, 'utf8');
            filesToShare.push(`file://${filePath}`);
          }

          await Share.open({
            title: t('exportFlow', { count: filesToShare.length }),
            urls: filesToShare,
            type: 'text/plain', // Add type for better compatibility
            subject: fileNames.join(', '), // Add subject for context
            failOnCancel: false,
          });
        }

        setSelectionMode(false);
        setSelectedFlows([]);
      } catch (error) {
        console.error('Export failed:', error);
        if (error.message.includes('Cancel')) {
          // Handle user cancellation
        } else if (error.message !== 'User did not share') {
          Alert.alert(
            t('exportFailedTitle'),
            t('exportFailedMessage') + ': ' + error.message,
          );
        }
      } finally {
        // Clean up temp files and dirs
        const tempDirExists = await RNFS.exists(exportTempDir);
        if (tempDirExists) {
          await RNFS.unlink(exportTempDir);
        }
        const zipFileExists = await RNFS.exists(zipPath);
        if (zipFileExists) {
          await RNFS.unlink(zipPath);
        }
      }
    };

    Alert.alert(
      t('exportConfirmTitle'),
      t('exportOptionsMessage'),
      [
        {
          text: t('exportOptionCanvas'),
          onPress: () => exportFlow('canvas'),
        },
        {
          text: t('exportOptionZip'),
          onPress: () => exportFlow('zip'),
        },
        {
          text: t('cancel'),
          style: 'cancel',
        },
      ],
      { cancelable: true },
    );
  };

  const handleDeleteFlows = async () => {
    Alert.alert(
      t('deleteConfirmTitle'),
      t('deleteSelectedConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ok'),
          onPress: async () => {
            try {
              for (const flowId of selectedFlows) {
                await deleteNodesByFlowId(flowId);
                await deleteEdgesByFlowId(flowId);
                await deleteFlow(flowId);
              }
              setSelectedFlows([]);
              setSelectionMode(false);
              fetchFlows(true);
            } catch (error) {
              Alert.alert(t('deleteFailedTitle'), t('deleteFailed'));
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const handleResetDB = async () => {
    Alert.alert(
      t('dbInit'),
      t('dbInitConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ok'),
          onPress: async () => {
            try {
              await resetDB(i18n.language);
              fetchFlows(true);
              setMenuVisible(false);
              Alert.alert(t('dbInitDoneTitle'), t('dbInitDone'));
            } catch (error) {
              Alert.alert(t('dbInitFailedTitle'), t('dbInitFailed'));
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return <ActivityIndicator style={{ marginVertical: 20 }} />;
  };

  const formatDiskUsage = bytes => {
    if (!bytes || bytes === 0) {
      return null; // or '0.0 GB'
    }
    const gigabytes = bytes / (1024 * 1024 * 1024);
    if (gigabytes < 0.1) {
      return null; // 0.1GB未満は表示しない
    }
    return `${gigabytes.toFixed(1)} GB`;
  };

  const renderItem = ({ item }) => {
    if (item.isNew && item.id === editingFlowId) {
      return (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}
        >
          <TextInput
            style={[styles.textInput, { flex: 1 }]}
            placeholder={t('flowNamePlaceholder')}
            value={newFlowName}
            onChangeText={setNewFlowName}
            autoFocus
            mode="outlined"
          />
          <Button
            mode="contained"
            onPress={() => handleSaveNewFlow(item.id)}
            style={{ marginLeft: 8 }}
          >
            {t('save')}
          </Button>
          <Button
            mode="outlined"
            onPress={() => handleCancelNewFlow(item.id)}
            style={{ marginLeft: 8 }}
          >
            {t('cancel')}
          </Button>
        </View>
      );
    }
    const diskUsageText = formatDiskUsage(item.diskUsage);
    const itemTags = item.tag
      ? String(item.tag)
          .split(/\s+/)
          .filter(x => x.startsWith('#') && x.length > 1)
      : [];

    const visibleTags = itemTags.slice(0, 2);
    const extraTagCount = itemTags.length - visibleTags.length;

    return (
      <Card
        style={[
          { flex: 1, marginVertical: 4, marginHorizontal: 8 },
          item.color && {
            borderLeftWidth: 6,
            borderLeftColor: item.color,
          },
        ]}
        onPress={() => {
          if (selectionMode) {
            if (!selectionMode) {
              setSelectionMode(true);
            }
            toggleSelection(item.id);
            return;
          }
          navigation.navigate('FlowEditor', {
            flowId: item.id,
            flowName: item.name,
          });
        }}
        onLongPress={() => {
          if (!selectionMode) {
            handleEditExistingFlow(item);
          }
        }}
      >
        <Card.Title
          title={item.name}
          left={props => {
            const isSelected = selectedFlows.includes(item.id);
            const status = isSelected ? 'checked' : 'unchecked';
            const isUncheckedIOS =
              Platform.OS === 'ios' && status === 'unchecked';

            return (
              <TouchableOpacity
                style={props.style} // Card.Titleからのマージンなどを適用
                onPress={() => {
                  if (!selectionMode) {
                    setSelectionMode(true);
                  }
                  toggleSelection(item.id);
                }}
              >
                <View style={styles.checkboxContainer}>
                  {isUncheckedIOS && (
                    <View style={styles.iosCheckboxBackground} />
                  )}
                  <View pointerEvents="none">
                    <Checkbox status={status} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          right={props => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {diskUsageText && (
                <Text style={{ marginRight: 8, color: 'gray' }}>
                  {diskUsageText}
                </Text>
              )}
              <Button
                mode="text"
                onPress={() => handleDeleteFlow(item.id)}
                compact
                style={{ marginRight: 8 }}
                icon="delete"
              >
                {t('delete')}
              </Button>
            </View>
          )}
        />
        {itemTags.length > 0 && (
          <View style={styles.itemTagsRow}>
            {visibleTags.map(tag => (
              <View key={tag} style={styles.itemTagChip}>
                <Text style={styles.itemTagChipText}>{tag}</Text>
              </View>
            ))}
            {extraTagCount > 0 && (
              <Text style={styles.itemTagOverflow}>+{extraTagCount}</Text>
            )}
          </View>
        )}
      </Card>
    );
  };

  return (
    <PaperProvider theme={OriginalTheme}>
      <View style={styles.container}>
        <Appbar.Header
          style={{ backgroundColor: OriginalTheme.colors.primary }}
        >
          {searchVisible ? (
            <Searchbar
              placeholder={t('search')}
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={{ flex: 1 }}
              autoFocus
            />
          ) : (
            <>
              {selectionMode ? (
                <>
                  <Appbar.Action
                    icon="close"
                    onPress={() => {
                      setSelectionMode(false);
                      setSelectedFlows([]);
                    }}
                    iconColor={'#fff'}
                  />
                  <Appbar.Content
                    title={t('selected', { count: selectedFlows.length })}
                  />
                </>
              ) : (
                <>
                  <Appbar.Action
                    icon="menu"
                    onPress={() => setMenuVisible(true)}
                    iconColor={'#fff'}
                  />
                  <Appbar.Content title={t('flowCards')} />
                  <Menu
                    visible={sortMenuVisible}
                    onDismiss={() => setSortMenuVisible(false)}
                    anchor={
                      <Appbar.Action
                        icon="sort"
                        onPress={() => setSortMenuVisible(true)}
                        iconColor={'#fff'}
                      />
                    }
                  >
                    <Menu.Item
                      onPress={() => {
                        setSort({ sortBy: 'name', sortOrder: 'ASC' });
                        setSortMenuVisible(false);
                      }}
                      title={t('sortNameAsc')}
                    />
                    <Menu.Item
                      onPress={() => {
                        setSort({ sortBy: 'name', sortOrder: 'DESC' });
                        setSortMenuVisible(false);
                      }}
                      title={t('sortNameDesc')}
                    />
                    <Divider />
                    <Menu.Item
                      onPress={() => {
                        setSort({ sortBy: 'createdAt', sortOrder: 'DESC' });
                        setSortMenuVisible(false);
                      }}
                      title={t('sortDateDesc')}
                    />
                    <Menu.Item
                      onPress={() => {
                        setSort({ sortBy: 'createdAt', sortOrder: 'ASC' });
                        setSortMenuVisible(false);
                      }}
                      title={t('sortDateAsc')}
                    />
                  </Menu>
                </>
              )}
            </>
          )}
          <Appbar.Action
            icon={searchVisible ? 'close' : 'magnify'}
            onPress={() => {
              if (searchVisible) {
                setSearchQuery('');
              }
              setSearchVisible(!searchVisible);
            }}
            iconColor={'#fff'}
          />
        </Appbar.Header>
        <Portal>
          <Modal
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            contentContainerStyle={styles.menuModal}
          >
            <View>
              <Button
                icon="database-refresh"
                mode="contained"
                onPress={handleResetDB}
                style={{ marginBottom: 16 }}
              >
                {t('dbInit')}
              </Button>
              <Button
                mode="outlined"
                onPress={() => i18n.changeLanguage('en')}
                style={{ marginBottom: 8 }}
              >
                LANG（en）
              </Button>
              <Button
                mode="outlined"
                onPress={() => i18n.changeLanguage('ja')}
                style={{ marginBottom: 8 }}
              >
                LANG（ja）
              </Button>
              <Button
                mode="outlined"
                onPress={() => i18n.changeLanguage('zh')}
                style={{ marginBottom: 16 }}
              >
                LANG（zh）
              </Button>
              <Button
                icon="close"
                mode="outlined"
                onPress={() => setMenuVisible(false)}
              >
                {t('cancel')}
              </Button>
            </View>
          </Modal>
          {selectionMode ? (
            <FAB.Group
              open={fabOpen}
              visible={selectedFlows.length > 0}
              icon={fabOpen ? 'close' : 'dots-vertical'}
              actions={[
                {
                  icon: 'export-variant',
                  label: t('export'),
                  onPress: handleExportFlows,
                },
                {
                  icon: 'delete',
                  label: t('delete'),
                  onPress: handleDeleteFlows,
                },
              ]}
              onStateChange={({ open }) => setFabOpen(open)}
              onPress={() => {
                if (fabOpen) {
                  // do something if the speed dial is open
                }
              }}
            />
          ) : (
            <FAB style={styles.fab} icon="plus" onPress={handleAddFlowRow} />
          )}
          <Modal
            visible={editModalVisible}
            onDismiss={handleCancelEditModal}
            contentContainerStyle={styles.editModalContainer}
          >
            {editingFlow && (
              <View>
                <Text style={styles.editModalTitle}>{t('editFlow')}</Text>
                <TextInput
                  label={t('name')}
                  value={editingFlow.name}
                  onChangeText={txt =>
                    setEditingFlow(prev => ({ ...prev, name: txt }))
                  }
                  mode="outlined"
                  style={styles.editModalInput}
                  textColor="#000"
                  theme={editModalInputTheme}
                />
                <TextInput
                  label={t('tags')}
                  value={editingFlow.tag}
                  onChangeText={txt =>
                    setEditingFlow(prev => ({
                      ...prev,
                      tag: autocompleteHashInTagInput(txt),
                    }))
                  }
                  placeholder="work personal"
                  mode="outlined"
                  autoCapitalize="none"
                  style={styles.editModalInput}
                  textColor="#000"
                  theme={editModalInputTheme}
                />
                <Text style={styles.editModalHint}>
                  {t('tagsHint')}
                </Text>
                <View style={styles.editModalColorRow}>
                  <Text style={styles.editModalColorLabel}>{t('color')}</Text>
                  <TouchableOpacity
                    style={[
                      styles.editModalColorSwatch,
                      {
                        backgroundColor:
                          editingFlow.color || 'transparent',
                        borderColor: editingFlow.color ? '#333' : '#bbb',
                      },
                    ]}
                    onPress={() => setColorPickerVisible(true)}
                  >
                    {!editingFlow.color && (
                      <Text style={styles.editModalColorPlaceholder}>—</Text>
                    )}
                  </TouchableOpacity>
                  {editingFlow.color && (
                    <Button
                      compact
                      onPress={() =>
                        setEditingFlow(prev => ({ ...prev, color: '' }))
                      }
                    >
                      {t('clear')}
                    </Button>
                  )}
                </View>
                <View style={styles.editModalButtonRow}>
                  <Button mode="outlined" onPress={handleCancelEditModal}>
                    {t('cancel')}
                  </Button>
                  <Button mode="contained" onPress={handleSaveEditModal}>
                    {t('save')}
                  </Button>
                </View>
              </View>
            )}
          </Modal>
          <Modal
            visible={colorPickerVisible}
            onDismiss={() => setColorPickerVisible(false)}
            contentContainerStyle={styles.colorPickerContainer}
          >
            {editingFlow && (
              <ColorPalette
                onChange={color => {
                  setEditingFlow(prev => ({ ...prev, color }));
                  setColorPickerVisible(false);
                }}
                value={editingFlow.color}
                colors={[
                  '#FCA5A5',
                  '#FDBA74',
                  '#FDE047',
                  '#86EFAC',
                  '#5EEAD4',
                  '#93C5FD',
                  '#A5B4FC',
                  '#C4B5FD',
                  '#F9A8D4',
                  '#D1D5DB',
                ]}
                title=""
                icon={<Text>✓</Text>}
              />
            )}
          </Modal>
        </Portal>
        {allTags.length > 0 && (
          <View style={styles.tagFilterBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tagFilterContent}
            >
              <TouchableOpacity
                onPress={() => setSelectedTag(null)}
                style={[
                  styles.tagFilterChip,
                  !selectedTag && styles.tagFilterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.tagFilterChipText,
                    !selectedTag && styles.tagFilterChipTextActive,
                  ]}
                >
                  {t('all')}
                </Text>
              </TouchableOpacity>
              {allTags.map(tag => (
                <TouchableOpacity
                  key={tag}
                  onPress={() =>
                    setSelectedTag(prev => (prev === tag ? null : tag))
                  }
                  style={[
                    styles.tagFilterChip,
                    selectedTag === tag && styles.tagFilterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagFilterChipText,
                      selectedTag === tag && styles.tagFilterChipTextActive,
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        <FlatList
          data={flows}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          ListEmptyComponent={<List.Item title={t('noFlows')} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={loadMoreFlows}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          scrollIndicatorInsets={{ top: 0 }}
        />
      </View>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  tagFilterBar: {
    backgroundColor: '#F5F5F5',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tagFilterContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tagFilterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 6,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
  },
  tagFilterChipActive: {
    backgroundColor: OriginalTheme.colors.primary,
  },
  tagFilterChipText: {
    fontSize: 13,
    color: '#333',
  },
  tagFilterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  itemTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 10,
    marginTop: -4,
    gap: 4,
  },
  itemTagChip: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
  },
  itemTagChipText: {
    fontSize: 11,
    color: '#1976D2',
  },
  itemTagOverflow: {
    fontSize: 11,
    color: '#666',
    marginLeft: 2,
  },
  editModalContainer: {
    backgroundColor: 'white',
    padding: 20,
    marginHorizontal: 24,
    borderRadius: 8,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  editModalInput: {
    marginBottom: 8,
  },
  editModalHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  editModalColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  editModalColorLabel: {
    fontSize: 14,
    marginRight: 12,
  },
  editModalColorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  editModalColorPlaceholder: {
    fontSize: 18,
    color: '#bbb',
  },
  editModalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  colorPickerContainer: {
    backgroundColor: 'white',
    padding: 20,
    marginHorizontal: 24,
    borderRadius: 8,
  },
  textInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    paddingHorizontal: 10,
    borderRadius: 5,
    color: 'white',
    backgroundColor: OriginalTheme.colors.surface,
  },
  flatListItem: {
    color: 'black',
  },
  menuModal: {
    backgroundColor: 'white',
    padding: 20,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 220,
    justifyContent: 'flex-start',
  },
  checkboxContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iosCheckboxBackground: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: OriginalTheme.colors.surfaceVariant,
  },
});

export default FlowListScreen;
