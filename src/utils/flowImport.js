// Flow import utilities.
//
// Two entry points:
//   - importZip(zipPath, ctx): unpack a `.zip` produced by the export flow
//     (v2.11.0+ with `_flowcards_manifest.json`, or older ones without),
//     and reconstruct a flow with its section hierarchy.
//   - importCanvas(canvasPath, ctx): read a single `.canvas` file and
//     create a flat flow whose cards all live at root.
//
// ctx must provide the DB writers + RNFS-like fs functions. This keeps
// the util testable without pulling native modules.

import { v4 as uuidv4 } from 'uuid';
import { sanitizeFilename } from './fileSafety';

const ATTACHMENT_DIR_NAME = 'attachments';

// Parse a JSON Canvas file's contents into { nodes, edges, attachments }.
// Node IDs are kept from the canvas — the caller is responsible for
// re-mapping to fresh uuids when inserting.
const parseCanvas = canvas => {
  const nodes = [];
  const edges = [];
  const attachments = {}; // by original node id
  for (const n of canvas.nodes || []) {
    const node = {
      id: String(n.id),
      x: Number.isFinite(n.x) ? n.x : 0,
      y: Number.isFinite(n.y) ? n.y : 0,
      width: Number.isFinite(n.width) ? n.width : 150,
      height: Number.isFinite(n.height) ? n.height : 85,
      color: n.color || '#FFFFFF',
      label: '',
      description: '',
    };
    if (n.type === 'text') {
      const text = String(n.text || '');
      const nl = text.indexOf('\n');
      node.label = nl === -1 ? text : text.slice(0, nl);
      node.description = nl === -1 ? '' : text.slice(nl + 1);
    } else if (n.type === 'file' && n.file) {
      const filename = String(n.file).split('/').pop() || 'file';
      attachments[node.id] = {
        kind: 'file',
        filename,
        stored_path: n.file, // relative path inside the zip
      };
    } else if (n.type === 'link' && n.url) {
      attachments[node.id] = {
        kind: 'link',
        filename: n.url,
        original_uri: n.url,
      };
    }
    nodes.push(node);
  }
  for (const e of canvas.edges || []) {
    edges.push({
      id: String(e.id),
      source: String(e.fromNode),
      target: String(e.toNode),
      sourceHandle: e.fromSide ? `handle${cap(e.fromSide)}` : null,
      targetHandle: e.toSide ? `handle${cap(e.toSide)}` : null,
      color: e.color || null,
    });
  }
  return { nodes, edges, attachments };
};

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');

const guessMime = filename => {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    pdf: 'application/pdf',
    txt: 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
};

// Copy an attachment file from the extracted temp directory to the app's
// attachments/ directory, returning the new relative path to store in DB.
const copyAttachmentFile = async (tempAttachmentPath, ctx) => {
  const { RNFS, ATTACHMENT_BASE_PATH } = ctx;
  const attachmentDir = `${ATTACHMENT_BASE_PATH}/${ATTACHMENT_DIR_NAME}`;
  if (!(await RNFS.exists(attachmentDir))) {
    await RNFS.mkdir(attachmentDir);
  }
  const baseName = tempAttachmentPath.split('/').pop() || 'file';
  const newName = `${Date.now()}-${sanitizeFilename(baseName)}`;
  const dstAbs = `${attachmentDir}/${newName}`;
  await RNFS.copyFile(tempAttachmentPath, dstAbs);
  return `${ATTACHMENT_DIR_NAME}/${newName}`;
};

// Insert a flow (metadata + all nodes / edges / attachments) into the DB.
// idMap: maps original node ids from canvas → fresh uuids in the new DB.
const insertFlowContents = async ({
  flowMeta,
  sections, // [{ canvasFile, sectionId, parentSectionId, label }]
  parsedByFile, // Map<canvasFile, { nodes, edges, attachments }>
  extractedDir,
  ctx,
}) => {
  const { db, RNFS } = ctx;

  const newFlowResult = await db.insertFlow({
    name: flowMeta.name || 'Imported Flow',
    tag: flowMeta.tag || null,
    color: flowMeta.color || null,
  });
  const newFlowId = newFlowResult.insertId;

  // Build id maps
  const sectionIdMap = new Map(); // original sectionId → new node id (or 'root')
  sectionIdMap.set('root', 'root');
  // Sort sections so parents are inserted before their children.
  const sortedSections = [...sections].sort((a, b) => {
    if (a.sectionId === 'root') return -1;
    if (b.sectionId === 'root') return 1;
    return 0;
  });
  // Track which section owns which nodes (by original canvas id).
  const nodeSectionOwner = new Map(); // originalNodeId → sectionId

  // First pass: assign new ids for every node across all sections.
  const globalNodeIdMap = new Map(); // original node id → new uuid
  for (const s of sortedSections) {
    const parsed = parsedByFile.get(s.canvasFile);
    if (!parsed) continue;
    for (const n of parsed.nodes) {
      if (!globalNodeIdMap.has(n.id)) {
        globalNodeIdMap.set(n.id, uuidv4());
      }
      nodeSectionOwner.set(n.id, s.sectionId);
    }
  }
  // The section id (of a non-root section) refers to a node that lives
  // in the PARENT section's canvas. Use its new uuid so parentId links up.
  for (const s of sortedSections) {
    if (s.sectionId === 'root') continue;
    // The section node itself is one of the original canvas nodes,
    // globally mapped above. Try to find its new uuid.
    const newId = globalNodeIdMap.get(s.sectionId);
    if (newId) {
      sectionIdMap.set(s.sectionId, newId);
    } else {
      // Section id not represented in any canvas node — skip.
      sectionIdMap.set(s.sectionId, uuidv4());
    }
  }

  const copiedFilePaths = [];
  const copyIfNeeded = async storedPathRel => {
    if (!storedPathRel) return null;
    // Try both root-of-zip and attachments/ subpath variants.
    const candidates = [
      `${extractedDir}/${storedPathRel}`,
      `${extractedDir}/${storedPathRel.replace(/^attachments\//, '')}`,
    ];
    for (const c of candidates) {
      if (await RNFS.exists(c)) {
        const rel = await copyAttachmentFile(c, ctx);
        copiedFilePaths.push(`${ctx.ATTACHMENT_BASE_PATH}/${rel}`);
        return rel;
      }
    }
    return null;
  };

  // Second pass: insert nodes with correct parentId and attachments.
  for (const s of sortedSections) {
    const parsed = parsedByFile.get(s.canvasFile);
    if (!parsed) continue;
    const parentSectionMapped =
      s.sectionId === 'root'
        ? 'root'
        : sectionIdMap.get(s.sectionId) || 'root';

    for (const n of parsed.nodes) {
      const newId = globalNodeIdMap.get(n.id);
      await db.insertNode({
        id: newId,
        flowId: newFlowId,
        parentId: parentSectionMapped,
        label: n.label || '',
        description: n.description || '',
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        color: n.color || '#FFFFFF',
      });

      const att = parsed.attachments[n.id];
      if (att) {
        if (att.kind === 'file') {
          const newStored = await copyIfNeeded(att.stored_path);
          if (newStored) {
            await db.insertAttachment({
              flow_id: newFlowId,
              node_id: newId,
              filename: att.filename,
              mime_type: guessMime(att.filename),
              original_uri: null,
              stored_path: newStored,
              thumbnail_path: guessMime(att.filename).startsWith('image/')
                ? newStored
                : null,
            });
          }
        } else if (att.kind === 'link') {
          await db.insertAttachment({
            flow_id: newFlowId,
            node_id: newId,
            filename: att.filename || att.original_uri,
            mime_type: 'text/url',
            original_uri: att.original_uri,
            stored_path: null,
            thumbnail_path: null,
          });
        }
      }
    }

    for (const e of parsed.edges) {
      const newSource = globalNodeIdMap.get(e.source);
      const newTarget = globalNodeIdMap.get(e.target);
      if (!newSource || !newTarget) continue;
      await db.insertEdge({
        id: uuidv4(),
        flowId: newFlowId,
        source: newSource,
        target: newTarget,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        direction: null,
        type: null,
      });
    }
  }

  return { newFlowId, copiedFilePaths };
};

const readJson = async (RNFS, path) => {
  const text = await RNFS.readFile(path, 'utf8');
  return JSON.parse(text);
};

// Best-effort import from a `.zip` produced by our own export.
// Falls back to flat-import if the manifest is missing.
export const importZip = async (zipPath, ctx) => {
  const { RNFS, unzip } = ctx;
  const tempDir = `${RNFS.TemporaryDirectoryPath}/import_${Date.now()}`;
  await RNFS.mkdir(tempDir);
  try {
    await unzip(zipPath, tempDir);

    // Read manifest if present.
    let manifest = null;
    const manifestPath = `${tempDir}/_flowcards_manifest.json`;
    if (await RNFS.exists(manifestPath)) {
      try {
        manifest = await readJson(RNFS, manifestPath);
      } catch (_) {
        manifest = null;
      }
    }

    // Parse every .canvas file under tempDir.
    const items = await RNFS.readDir(tempDir);
    const parsedByFile = new Map();
    for (const item of items) {
      if (item.name.toLowerCase().endsWith('.canvas')) {
        try {
          const canvas = await readJson(RNFS, item.path);
          parsedByFile.set(item.name, parseCanvas(canvas));
        } catch (_) {
          // ignore malformed canvas file
        }
      }
    }

    if (manifest && manifest.schemaVersion === 1) {
      return await insertFlowContents({
        flowMeta: manifest.flow || { name: 'Imported Flow' },
        sections: manifest.sections || [],
        parsedByFile,
        extractedDir: tempDir,
        ctx,
      });
    }

    // Fallback: no manifest — flatten every canvas into a single root section.
    const fakeSections = [];
    for (const name of parsedByFile.keys()) {
      fakeSections.push({
        canvasFile: name,
        sectionId: 'root',
        parentSectionId: null,
        label: null,
      });
    }
    return await insertFlowContents({
      flowMeta: { name: 'Imported Flow' },
      sections: fakeSections,
      parsedByFile,
      extractedDir: tempDir,
      ctx,
    });
  } finally {
    await RNFS.unlink(tempDir).catch(() => {});
  }
};

// Import a single `.canvas` file as a new flat flow at root.
export const importCanvas = async (canvasPath, ctx) => {
  const { RNFS } = ctx;
  const canvas = await readJson(RNFS, canvasPath);
  const parsed = parseCanvas(canvas);
  const parsedByFile = new Map();
  const fakeFile = 'imported.canvas';
  parsedByFile.set(fakeFile, parsed);
  const sections = [
    {
      canvasFile: fakeFile,
      sectionId: 'root',
      parentSectionId: null,
      label: null,
    },
  ];
  return await insertFlowContents({
    flowMeta: {
      name: (canvasPath.split('/').pop() || 'Imported').replace(/\.canvas$/i, ''),
    },
    sections,
    parsedByFile,
    extractedDir: canvasPath.substring(0, canvasPath.lastIndexOf('/')),
    ctx,
  });
};
