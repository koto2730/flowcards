import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
  ActivityIndicator,
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
import {
  getFlows,
  insertFlow,
  deleteFlow,
  updateFlow,
  deleteNodesByFlowId,
  deleteEdgesByFlowId,
  resetDB,
} from '../db';
import OriginalTheme from './OriginalTheme';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 15;

const FlowListScreen = ({ navigation }) => {
  const [flows, setFlows] = useState([]);
  const [editingFlowId, setEditingFlowId] = useState(null);
  const [newFlowName, setNewFlowName] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFlows, setSelectedFlows] = useState([]);
  const [editingExistingName, setEditingExistingName] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);

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

        if (isRefresh) {
          setFlows(flowsData);
          setPage(1);
          if (flowsData.length >= PAGE_SIZE) {
            setHasMore(true);
          }
        } else if (hasMore) {
          setFlows(prevFlows => [...prevFlows, ...flowsData]);
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

  const handleAddFlowRow = () => {
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
    return (
      <Card
        style={{ flex: 1, marginVertical: 4, marginHorizontal: 8 }}
        onPress={() => {
          if (selectionMode) {
            toggleSelection(item.id);
          } else {
            navigation.navigate('FlowEditor', {
              flowId: item.id,
              flowName: item.name,
            });
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            handleEditExistingFlow(item);
          } else {
            setSelectionMode(true);
            toggleSelection(item.id);
          }
        }}
      >
        <Card.Title
          title={item.name}
          left={props =>
            selectionMode ? (
              <Checkbox
                status={
                  selectedFlows.includes(item.id) ? 'checked' : 'unchecked'
                }
                onPress={() => toggleSelection(item.id)}
              />
            ) : null
          }
          right={props => (
            <Button
              mode="text"
              onPress={() => handleDeleteFlow(item.id)}
              compact
              style={{ marginRight: 8 }}
              icon="delete"
            >
              {t('delete')}
            </Button>
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
              <Appbar.Action
                icon="menu"
                onPress={() => setMenuVisible(true)}
              />
              <Appbar.Content title={t('flowCards')} />
              <Menu
                visible={sortMenuVisible}
                onDismiss={() => setSortMenuVisible(false)}
                anchor={
                  <Appbar.Action
                    icon="sort"
                    onPress={() => setSortMenuVisible(true)}
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
          <Appbar.Action
            icon={searchVisible ? 'close' : 'magnify'}
            onPress={() => {
              if (searchVisible) {
                setSearchQuery('');
              }
              setSearchVisible(!searchVisible);
            }}
          />
          {selectionMode && !searchVisible ? (
            <>
              <Appbar.Action
                icon="close"
                onPress={() => {
                  setSelectionMode(false);
                  setSelectedFlows([]);
                }}
              />
              <Appbar.Content
                title={t('selected', { count: selectedFlows.length })}
              />
              <Appbar.Action
                icon="delete"
                onPress={handleDeleteFlows}
                disabled={selectedFlows.length === 0}
              />
            </>
          ) : null}
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
        />
        <FAB style={styles.fab} icon="plus" onPress={handleAddFlowRow} />
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
});

export default FlowListScreen;
