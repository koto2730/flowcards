import SQLite from 'react-native-sqlite-storage';
import * as RNLocalize from 'react-native-localize';
import RNFS from 'react-native-fs';

const db = SQLite.openDatabase({
  name: 'flowcards.db',
  location: 'default',
});

const ATTACHMENT_DIR = `${RNFS.DocumentDirectoryPath}/attachments`;

// SQLite.enablePromise(true); // Promiseベースの操作を有効にする場合

const executeSql = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, err) => reject(err),
      );
    });
  });
};

const getSampleDataByLang = lang => {
  const language =
    lang ||
    (Array.isArray(RNLocalize.getLocales())
      ? RNLocalize.getLocales()[0].languageCode
      : 'en');

  if (lang === 'ja') {
    return {
      flowName: 'サンプル フロー',
      nodes: [
        {
          id: '1',
          parentId: 'root',
          label: 'アイデアの種',
          description: 'ここから始めよう',
          x: 250,
          y: 50,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '2',
          parentId: 'root',
          label: '具体的な機能',
          description: 'どんな機能が必要？',
          x: 100,
          y: 200,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '3',
          parentId: '1',
          label: '子カード１',
          description: 'アイデアの子',
          x: 50,
          y: 50,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '4',
          parentId: 'root',
          label: 'カードを長押し',
          description: '編集できる',
          x: 100,
          y: 300,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '5',
          parentId: 'root',
          label: 'ダブルタップ（大）',
          description: 'カードの中に入る',
          x: 100,
          y: 400,
          width: 180,
          height: 254,
          color: '#FFFFFF',
        },
      ],
    };
  } else if (lang === 'zh') {
    return {
      flowName: '示例流程',
      nodes: [
        {
          id: '1',
          parentId: 'root',
          label: '创意种子',
          description: '从这里开始',
          x: 250,
          y: 50,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '2',
          parentId: 'root',
          label: '具体功能',
          description: '需要哪些功能？',
          x: 100,
          y: 200,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '3',
          parentId: '1',
          label: '子卡片1',
          description: '创意的子项',
          x: 50,
          y: 50,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '4',
          parentId: 'root',
          label: '长按卡片',
          description: '可以编辑',
          x: 100,
          y: 300,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '5',
          parentId: 'root',
          label: '双击卡片（大）',
          description: '可以进入卡片内部',
          x: 100,
          y: 4000,
          width: 180,
          height: 254,
          color: '#FFFFFF',
        },
      ],
    };
  } else {
    return {
      flowName: 'Sample Flow',
      nodes: [
        {
          id: '1',
          parentId: 'root',
          label: 'Seed of Idea',
          description: 'Start from here',
          x: 250,
          y: 50,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '2',
          parentId: 'root',
          label: 'Specific Feature',
          description: 'What features are needed?',
          x: 100,
          y: 200,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '3',
          parentId: '1',
          label: 'Child Card 1',
          description: 'Child of idea',
          x: 50,
          y: 50,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '4',
          parentId: 'root',
          label: 'Long press card',
          description: 'You can edit',
          x: 100,
          y: 300,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        },
        {
          id: '5',
          parentId: 'root',
          label: 'Double Tap card (Large)',
          description: 'Enter inside the card',
          x: 100,
          y: 400,
          width: 180,
          height: 254,
          color: '#FFFFFF',
        },
      ],
    };
  }
};

const insertSampleData = (tx, lang) => {
  const sample = getSampleDataByLang(lang);
  return new Promise((resolve, reject) => {
    tx.executeSql(
      'INSERT INTO flows (name) VALUES (?);',
      [sample.flowName],
      (_, { insertId }) => {
        const promises = sample.nodes.map(node => {
          return new Promise((resolveNode, rejectNode) => {
            tx.executeSql(
              'INSERT INTO nodes (id, flowId, parentId, label, description, x, y, width, height, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
              [
                node.id,
                insertId,
                node.parentId,
                node.label,
                node.description,
                node.x,
                node.y,
                node.width,
                node.height,
                node.color,
              ],
              () => {
                resolveNode();
              },
              (_, err) => {
                rejectNode(err);
              },
            );
          });
        });

        Promise.all(promises)
          .then(() => {
            resolve();
          })
          .catch(reject);
      },
      (_, err) => {
        reject(err);
      },
    );
  });
};

export const initDB = lang => {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS flows (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          tag TEXT,
          "group" TEXT,
          lastPosition TEXT,
          zoomLevel REAL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );`,
        [],
        () => {
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS nodes (
              id TEXT PRIMARY KEY,
              flowId INTEGER NOT NULL,
              parentId TEXT,
              label TEXT,
              description TEXT,
              x REAL,
              y REAL,
              width REAL,
              height REAL,
              color TEXT,
              contents TEXT,
              FOREIGN KEY (flowId) REFERENCES flows (id) ON DELETE CASCADE
            );`,
            [],
            () => {
              tx.executeSql(
                `CREATE TABLE IF NOT EXISTS edges (
                  id TEXT PRIMARY KEY,
                  flowId INTEGER NOT NULL,
                  source TEXT NOT NULL,
                  target TEXT NOT NULL,
                  sourceHandle TEXT,
                  targetHandle TEXT,
                  direction TEXT,
                  type TEXT,
                  FOREIGN KEY (flowId) REFERENCES flows (id) ON DELETE CASCADE
                );`,
                [],
                () => {
                  tx.executeSql(
                    `CREATE TABLE IF NOT EXISTS attachments (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      flow_id INTEGER NOT NULL,
                      node_id TEXT NOT NULL,
                      filename TEXT,
                      mime_type TEXT,
                      original_uri TEXT,
                      stored_path TEXT,
                      preview_title TEXT,
                      preview_description TEXT,
                      preview_image_url TEXT,
                      thumbnail_path TEXT,
                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE CASCADE
                    );`,
                    [],
                    () => {
                      tx.executeSql(
                        'SELECT * FROM flows;',
                        [],
                        (_, { rows }) => {
                          if (rows.length === 0) {
                            insertSampleData(tx, lang)
                              .then(resolve)
                              .catch(reject);
                          } else {
                            resolve();
                          }
                        },
                        (_, err) => reject(err),
                      );
                    },
                    (_, err) => reject(err),
                  );
                },
                (_, err) => reject(err),
              );
            },
            (_, err) => reject(err),
          );
        },
        (_, err) => reject(err),
      );
    });
  });
};

// --- attachments CRUD ---
export const getAttachmentByNodeId = (flowId, nodeId) =>
  executeSql('SELECT * FROM attachments WHERE flow_id = ? and node_id = ?;', [
    flowId,
    nodeId,
  ]).then(({ rows }) => (rows.length > 0 ? rows.raw()[0] : null));

export const insertAttachment = data => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');
  return executeSql(
    `INSERT INTO attachments (${keys.join(', ')}) VALUES (${placeholders});`,
    values,
  );
};

export const updateAttachment = (id, data) => {
  const fields = Object.keys(data)
    .map(key => `${key} = ?`)
    .join(', ');
  const values = Object.values(data);
  return executeSql(`UPDATE attachments SET ${fields} WHERE id = ?;`, [
    ...values,
    id,
  ]);
};

export const deleteAttachment = id =>
  executeSql('DELETE FROM attachments WHERE id = ?;', [id]);

export const getFlowDiskUsage = async flowId => {
  try {
    const attachments = await executeSql(
      'SELECT stored_path FROM attachments WHERE flow_id = ?;',
      [flowId],
    ).then(({ rows }) => rows.raw());

    let totalSize = 0;
    for (const attachment of attachments) {
      if (attachment.stored_path) {
        try {
          const fileExists = await RNFS.exists(attachment.stored_path);
          if (fileExists) {
            const stat = await RNFS.stat(attachment.stored_path);
            totalSize += stat.size;
          }
        } catch (error) {
          console.error(
            `Could not get size for file: ${attachment.stored_path}`,
            error,
          );
        }
      }
    }
    return totalSize;
  } catch (error) {
    console.error(`Failed to get disk usage for flow ${flowId}:`, error);
    return 0;
  }
};

// --- flows CRUD ---
export const getFlows = (options = {}) => {
  const { limit, offset, searchQuery, sortBy, sortOrder = 'DESC' } = options;

  let query = 'SELECT * FROM flows';
  const params = [];

  if (searchQuery) {
    query += ' WHERE name LIKE ?';
    params.push(`%${searchQuery}%`);
  }

  // Whitelist of sortable columns to prevent SQL injection
  const sortableColumns = ['name', 'createdAt'];
  const orderBy = sortableColumns.includes(sortBy) ? sortBy : 'createdAt';
  const orderDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  query += ` ORDER BY ${orderBy} ${orderDirection}`;

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  if (offset) {
    query += ' OFFSET ?';
    params.push(offset);
  }

  return executeSql(query, params).then(({ rows }) => rows.raw());
};

export const getFlowsCount = (options = {}) => {
  const { searchQuery } = options;
  let query = 'SELECT COUNT(*) as count FROM flows';
  const params = [];

  if (searchQuery) {
    query += ' WHERE name LIKE ?';
    params.push(`%${searchQuery}%`);
  }

  return executeSql(query, params).then(({ rows }) => rows.raw()[0].count);
};

export const updateFlow = (id, data) => {
  const fields = Object.keys(data)
    .map(key => `${key} = ?`)
    .join(', ');
  const values = Object.values(data);
  return executeSql(`UPDATE flows SET ${fields} WHERE id = ?;`, [
    ...values,
    id,
  ]);
};

export const deleteFlow = id =>
  executeSql('DELETE FROM flows WHERE id = ?;', [id]);

// --- nodes CRUD ---
export const getNodes = flowId =>
  executeSql('SELECT * FROM nodes WHERE flowId = ?;', [flowId]).then(
    ({ rows }) => rows.raw(),
  );

export const updateNode = (id, data) => {
  const fields = Object.keys(data)
    .map(key => `${key} = ?`)
    .join(', ');
  const values = Object.values(data);
  return executeSql(`UPDATE nodes SET ${fields} WHERE id = ?;`, [
    ...values,
    id,
  ]);
};

export const deleteNode = id =>
  executeSql('DELETE FROM nodes WHERE id = ?;', [id]);

// nodesをflowId単位で全削除
export const deleteNodesByFlowId = flowId =>
  executeSql('DELETE FROM nodes WHERE flowId = ?;', [flowId]);

// --- edges CRUD ---
export const getEdges = flowId =>
  executeSql('SELECT * FROM edges WHERE flowId = ?;', [flowId]).then(
    ({ rows }) => rows.raw(),
  );

export const updateEdge = (id, data) => {
  const fields = Object.keys(data)
    .map(key => `${key} = ?`)
    .join(', ');
  const values = Object.values(data);
  return executeSql(`UPDATE edges SET ${fields} WHERE id = ?;`, [
    ...values,
    id,
  ]);
};

export const deleteEdge = id =>
  executeSql('DELETE FROM edges WHERE id = ?;', [id]);

// edgesをflowId単位で全削除
export const deleteEdgesByFlowId = flowId =>
  executeSql('DELETE FROM edges WHERE flowId = ?;', [flowId]);

// DB初期化（全テーブル削除＆再作成）
export const resetDB = lang => {
  return new Promise((resolve, reject) => {
    // 1. Delete all physical attachment files
    RNFS.unlink(ATTACHMENT_DIR)
      .catch(err => {
        // Ignore if the directory doesn't exist
        if (err.code === 'ENOENT') {
          return;
        }
        throw err;
      })
      .then(() => RNFS.mkdir(ATTACHMENT_DIR)) // Recreate the directory
      .then(() => {
        // 2. Drop all tables
        db.transaction(tx => {
          tx.executeSql(
            'DROP TABLE IF EXISTS attachments;',
            [],
            () => {
              tx.executeSql(
                'DROP TABLE IF EXISTS edges;',
                [],
                () => {
                  tx.executeSql(
                    'DROP TABLE IF EXISTS nodes;',
                    [],
                    () => {
                      tx.executeSql(
                        'DROP TABLE IF EXISTS flows;',
                        [],
                        () => {
                          // 3. Re-initialize the schema and sample data
                          initDB(lang).then(resolve).catch(reject);
                        },
                        (_, err) => reject(err),
                      );
                    },
                    (_, err) => reject(err),
                  );
                },
                (_, err) => reject(err),
              );
            },
            (_, err) => reject(err),
          );
        });
      })
      .catch(reject);
  });
};

// --- flows INSERT ---
export const insertFlow = data => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');
  return executeSql(
    `INSERT INTO flows (${keys.join(', ')}) VALUES (${placeholders});`,
    values,
  );
};

// --- nodes INSERT ---
export const insertNode = data => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');
  return executeSql(
    `INSERT INTO nodes (${keys.join(', ')}) VALUES (${placeholders});`,
    values,
  );
};

// --- edges INSERT ---
export const insertEdge = data => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');
  return executeSql(
    `INSERT INTO edges (${keys.join(', ')}) VALUES (${placeholders});`,
    values,
  );
};
