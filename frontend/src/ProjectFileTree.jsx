import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Database,
  File,
  ChevronDown,
  ChevronRight,
  FolderTree,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react';

function FileIcon({ filename, size = 13, color = '#00aa28', style = {} }) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (
    [
      'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss',
      'json', 'yaml', 'yml', 'c', 'cpp', 'rs', 'go', 'java',
      'rb', 'php', 'sh', 'sql', 'toml',
    ].includes(ext)
  ) {
    return <FileCode size={size} color={color} style={style} />;
  }
  if (['md', 'txt', 'rst', 'log', 'env', 'gitignore'].includes(ext)) {
    return <FileText size={size} color={color} style={style} />;
  }
  if (
    [
      'cache', 'db', 'sqlite', 'csv', 'parquet', 'dat', 'bin',
      'pt', 'pth', 'onnx', 'pkl', 'tar', 'gz', 'zip',
    ].includes(ext)
  ) {
    return <Database size={size} color={color} style={style} />;
  }
  return <File size={size} color={color} style={style} />;
}

function buildFileTree(files, rootName = 'repository') {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return null;
  }

  const root = {
    name: rootName,
    path: '',
    isDirectory: true,
    children: new Map(),
  };

  files.forEach(item => {
    const rawPath = typeof item === 'string' ? item : item?.path;
    if (!rawPath || typeof rawPath !== 'string') return;

    // Normalize forward slashes and trim
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalized) return;

    const parts = normalized.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const subPath = parts.slice(0, i + 1).join('/');

      if (isFile) {
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: subPath,
            isDirectory: false,
            children: new Map(),
          });
        }
      } else {
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: subPath,
            isDirectory: true,
            children: new Map(),
          });
        }
        current = current.children.get(part);
      }
    }
  });

  function toArray(node) {
    const childrenArr = Array.from(node.children.values()).map(toArray);
    childrenArr.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      name: node.name,
      path: node.path,
      isDirectory: node.isDirectory,
      children: childrenArr,
    };
  }

  return toArray(root);
}

function TreeNode({ node, depth = 0, collapsedDirs, toggleDir, highlightPaths = [] }) {
  const isCollapsed = Boolean(collapsedDirs[node.path]);
  const isDir = node.isDirectory;
  
  const isHighlighted = highlightPaths.includes(node.path);
  const highlightStyle = isHighlighted ? { background: 'rgba(255, 204, 0, 0.2)', color: '#ffcc00' } : {};

  return (
    <div style={{ marginLeft: depth > 0 ? 14 : 0 }}>
      {isDir ? (
        <div>
          <button
            type="button"
            onClick={() => toggleDir(node.path)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              padding: '3px 6px',
              borderRadius: 3,
              cursor: 'pointer',
              color: '#00dd33',
              textAlign: 'left',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0, 255, 65, 0.08)';
              e.currentTarget.style.color = '#00ff41';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#00dd33';
            }}
          >
            <span style={{ color: '#00701a', display: 'flex', alignItems: 'center' }}>
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
            {isCollapsed ? (
              <Folder size={13} color="#00aa28" />
            ) : (
              <FolderOpen size={13} color="#00ff41" />
            )}
            <span style={{ fontWeight: 600, color: '#00ee3b' }}>
              {node.name}/
            </span>
            <span style={{ fontSize: 10, color: '#005515', marginLeft: 'auto' }}>
              {node.children.length} {node.children.length === 1 ? 'item' : 'items'}
            </span>
          </button>

          {!isCollapsed && (
            <div
              style={{
                borderLeft: '1px dashed rgba(0, 255, 65, 0.18)',
                marginLeft: 11,
                paddingLeft: 4,
              }}
            >
              {node.children.map(child => (
                <TreeNode
                  key={child.path || child.name}
                  node={child}
                  depth={depth + 1}
                  collapsedDirs={collapsedDirs}
                  toggleDir={toggleDir}
                  highlightPaths={highlightPaths}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 6px',
            borderRadius: 3,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#00bb2f',
            ...highlightStyle
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(0, 255, 65, 0.05)';
            e.currentTarget.style.color = '#00ff41';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#00bb2f';
          }}
        >
          <span style={{ width: 12, display: 'inline-block' }} />
          <FileIcon filename={node.name} size={13} color="#00aa28" style={{ flexShrink: 0 }} />
          <span style={{ wordBreak: 'break-all' }}>{node.name}</span>
        </div>
      )}
    </div>
  );
}

export default function ProjectFileTree({ files, repoName, isPartial = false, highlightPaths = [] }) {
  const isAlreadyTree = files && files.length > 0 && typeof files[0] === 'object' && 'isDirectory' in files[0];
  
  const tree = useMemo(() => {
    if (isAlreadyTree) {
      return { name: repoName, path: '', isDirectory: true, children: files };
    }
    return buildFileTree(files, repoName);
  }, [files, repoName, isAlreadyTree]);

  // Expand folders along the highlighted paths by default
  const defaultCollapsedDirs = useMemo(() => {
    const allPaths = {};
    const expandPaths = new Set();
    
    // Add highlighted paths and their parents to expand list
    highlightPaths.forEach(p => {
      const parts = p.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current += (i === 0 ? '' : '/') + parts[i];
        expandPaths.add(current);
      }
    });

    function collect(node) {
      if (node.isDirectory && node.path) {
        if (!expandPaths.has(node.path)) {
          allPaths[node.path] = true;
        }
      }
      if (node.children) {
        node.children.forEach(collect);
      }
    }
    collect(tree || {});
    return allPaths;
  }, [tree, highlightPaths]);

  const [collapsedDirs, setCollapsedDirs] = useState(defaultCollapsedDirs);

  if (!tree || !tree.children || tree.children.length === 0) {
    return (
      <div
        style={{
          padding: '12px 14px',
          color: '#00701a',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          fontStyle: 'italic',
        }}
      >
        No directory structure detected for this query.
      </div>
    );
  }

  const toggleDir = path => {
    setCollapsedDirs(prev => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const expandAll = () => setCollapsedDirs({});

  const collapseAll = () => {
    // Gather all directory paths
    const allPaths = {};
    function collect(node) {
      if (node.isDirectory && node.path) {
        allPaths[node.path] = true;
      }
      if (node.children) {
        node.children.forEach(collect);
      }
    }
    collect(tree);
    setCollapsedDirs(allPaths);
  };

  const fileCount = Array.isArray(files) ? files.length : 0;

  return (
    <div
      style={{
        background: 'rgba(0, 8, 2, 0.7)',
        border: '1px solid rgba(0, 255, 65, 0.12)',
        borderRadius: 4,
        padding: '12px 14px',
        overflow: 'hidden',
      }}
    >
      {/* Top bar with quick actions & disclaimer badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(0, 255, 65, 0.08)',
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderTree size={12} color="#00ff41" />
          <span style={{ color: '#00aa28', letterSpacing: 1, fontWeight: 600 }}>
            REFERENCED FILE TREE
          </span>
          <span
            style={{
              background: 'rgba(0, 180, 50, 0.12)',
              border: '1px solid rgba(0, 180, 50, 0.3)',
              color: '#00dd33',
              borderRadius: 2,
              padding: '1px 5px',
              fontSize: 9,
              letterSpacing: 0.5,
            }}
          >
            {fileCount} {fileCount === 1 ? 'FILE' : 'FILES'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={expandAll}
            title="Expand All Folders"
            style={{
              background: 'transparent',
              border: '1px solid rgba(0, 255, 65, 0.15)',
              borderRadius: 2,
              color: '#00aa28',
              fontSize: 9,
              padding: '2px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#00ff41';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#00aa28';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.15)';
            }}
          >
            <ChevronsDown size={10} />
            <span>EXPAND</span>
          </button>
          <button
            type="button"
            onClick={collapseAll}
            title="Collapse All Folders"
            style={{
              background: 'transparent',
              border: '1px solid rgba(0, 255, 65, 0.15)',
              borderRadius: 2,
              color: '#00aa28',
              fontSize: 9,
              padding: '2px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontFamily: "'JetBrains Mono', monospace",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#00ff41';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#00aa28';
              e.currentTarget.style.borderColor = 'rgba(0, 255, 65, 0.15)';
            }}
          >
            <ChevronsUp size={10} />
            <span>COLLAPSE</span>
          </button>
        </div>
      </div>

      {/* Root node and recursive children */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <TreeNode
          node={tree}
          depth={0}
          collapsedDirs={collapsedDirs}
          toggleDir={toggleDir}
          highlightPaths={highlightPaths}
        />
      </div>

      {/* Partial inference disclaimer */}
      {isPartial && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid rgba(0, 255, 65, 0.06)',
            fontSize: 10,
            color: '#005515',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>// Note: Partial structure reconstructed from referenced files; not the complete repository.</span>
        </div>
      )}
    </div>
  );
}
