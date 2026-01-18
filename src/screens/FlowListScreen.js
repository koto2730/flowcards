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
import {
  getFlows,
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
import { zip } from 'react-native-zip-archive';

const PAGE_SIZE = 15;

const FlowListScreen = ({ navigation }) => {
  const [flows, setFlows] = useState([]);
  const [editingFlowId, setEditingFlowId] = useState(null);
  const [newFlowName, setNewFlowName] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFlows, setSelectedFlows] = useState([]);
  const [editingExistingName, setEditingExistingName] = useState('');
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
    [page, hasMore, debouncedSearchQuery, sort],
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

  // Trigger refresh when debounced query or sort changes
  useEffect(() => {
    fetchFlows(true);
  }, [debouncedSearchQuery, sort]);

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
      navigation.navigate('FlowEditor', { flowId: newFlowId });
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
    setEditingFlowId(item.id);
    setEditingExistingName(item.name);
  };

  const handleSaveExistingFlow = async id => {
    if (!editingExistingName.trim()) {
      Alert.alert(t('error'), t('flowNameEmpty'));
      return;
    }
    try {
      await updateFlow(id, { name: editingExistingName });
      setEditingFlowId(null);
      setEditingExistingName('');
      fetchFlows(true);
    } catch (error) {
      console.error('Failed to update flow:', error);
    }
  };

  const handleCancelEditExistingFlow = () => {
    setEditingFlowId(null);
    setEditingExistingName('');
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
      const zipPath = `${RNFS.TemporaryDirectoryPath}/${flow.name.replace(
        /\s/g,
        '_',
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
            const fileName = `${canvasName.replace(/\s/g, '_')}.canvas`;
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
            const fileName = `${canvasName.replace(/\s/g, '_')}.canvas`;
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
    if (item.id === editingFlowId && !item.isNew) {
      return (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}
        >
          <TextInput
            style={[styles.textInput, { flex: 1 }]}
            value={editingExistingName}
            onChangeText={setEditingExistingName}
            autoFocus
            mode="outlined"
          />
          <Button
            mode="contained"
            onPress={() => handleSaveExistingFlow(item.id)}
            style={{ marginLeft: 8 }}
          >
            {t('save')}
          </Button>
          <Button
            mode="outlined"
            onPress={handleCancelEditExistingFlow}
            style={{ marginLeft: 8 }}
          >
            {t('cancel')}
          </Button>
        </View>
      );
    }

    const diskUsageText = formatDiskUsage(item.diskUsage);

    return (
      <Card
        style={{ flex: 1, marginVertical: 4, marginHorizontal: 8 }}
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
        </Portal>
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
