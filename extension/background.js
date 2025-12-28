// API Base URL
const API_BASE = 'http://localhost:8000';

// Initialize Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "curator-root",
    title: "保存到 Curator",
    contexts: ["page", "selection", "image", "link"]
  });

  chrome.contextMenus.create({
    id: "save-page",
    parentId: "curator-root",
    title: "保存当前页面",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "save-selection",
    parentId: "curator-root",
    title: "保存选中内容",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "save-image",
    parentId: "curator-root",
    title: "保存图片",
    contexts: ["image"]
  });

  chrome.contextMenus.create({
    id: "save-link",
    parentId: "curator-root",
    title: "保存链接",
    contexts: ["link"]
  });
});

// Handle Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-page") {
    handleSavePage(tab);
  } else if (info.menuItemId === "save-selection") {
    handleSaveText(info.selectionText);
  } else if (info.menuItemId === "save-image") {
    handleSaveImage(info.srcUrl);
  } else if (info.menuItemId === "save-link") {
    handleSaveLink(info.linkUrl);
  }
});

// Helper: Generate UUID
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper: Send Notification
function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title,
    message: message
  });
}

// Helper: Create Card
async function createCard(type, content, meta = null) {
  // Random position around (100, 100) to avoid total overlap
  const x = 100 + Math.random() * 50;
  const y = 100 + Math.random() * 50;

  const card = {
    id: generateUUID(),
    type,
    content,
    x,
    y,
    meta
  };

  try {
    const response = await fetch(`${API_BASE}/api/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    });

    if (response.ok) {
      notify('保存成功!', '内容已保存到 Curator。');
    } else {
      notify('错误', '保存内容失败。');
      console.error('Server error:', response.statusText);
    }
  } catch (error) {
    notify('错误', '无法连接到 Curator 服务器。');
    console.error('Fetch error:', error);
  }
}

// Helper: Parse URL (mimic frontend logic)
async function parseUrl(url) {
  try {
    const response = await fetch(`${API_BASE}/api/parse-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Parse URL error:', error);
  }
  return null;
}

// Handlers
async function handleSavePage(tab) {
  if (!tab || !tab.url) return;
  notify('正在保存...', `正在处理 ${tab.title || '页面'}...`);
  
  const meta = await parseUrl(tab.url);
  const type = (meta && meta.type === 'rss') ? 'rss' : 'link';
  
  // Use parsed meta or fallback to basic info
  const finalMeta = meta || {
    title: tab.title,
    description: '',
    originalUrl: tab.url
  };

  await createCard(type, tab.url, finalMeta);
}

async function handleSaveLink(url) {
  if (!url) return;
  notify('正在保存...', '正在处理链接...');
  
  const meta = await parseUrl(url);
  const type = (meta && meta.type === 'rss') ? 'rss' : 'link';
  
  await createCard(type, url, meta);
}

async function handleSaveText(text) {
  if (!text) return;
  
  // Check if text looks like a URL
  if (/^(http|https):\/\/[^ "]+$/.test(text)) {
    handleSaveLink(text);
    return;
  }

  await createCard('text', text);
}

async function handleSaveImage(srcUrl) {
  if (!srcUrl) return;
  
  // For images, we can either save the URL directly (if hotlinking is allowed)
  // or trigger the backend download logic.
  // The current backend card 'image' type expects 'content' to be a path or URL.
  // If we pass a full URL, the frontend <img> src will be `${API_BASE}${card.content}`.
  // Wait, frontend logic:
  // if (card.content) { img.src = `${API_BASE}${card.content}`; }
  // This implies card.content is expected to be a relative path like /uploads/xxx.
  // BUT the upload endpoint /api/upload supports 'url' param to download and return path.
  
  notify('正在保存...', '正在下载图片...');

  try {
    const formData = new FormData();
    formData.append('url', srcUrl);
    
    const uploadRes = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      // data.url is likely "/uploads/uuid.png"
      await createCard('image', data.url);
    } else {
      // Fallback: try saving as link card with image as content? No, save as text?
      // Or just save the URL directly, but frontend needs to handle external URLs if we change it.
      // Current frontend prepends API_BASE. So we MUST upload/download it.
      notify('错误', '图片下载失败。');
    }
  } catch (error) {
    notify('错误', '图片处理失败。');
    console.error(error);
  }
}