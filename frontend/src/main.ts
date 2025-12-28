import './style.css'
// import { BackgroundSystem } from './particles'; // Removed
import { createIcons, LayoutGrid, ExternalLink, Copy, Check, X, Sun, Moon, FileText, Link, Rss, Scan } from 'lucide';

// API 基础地址
// 自动判断当前环境：如果是生产环境（非 localhost），使用相对路径或当前域名
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:8000' 
  : ''; 


// 卡片接口定义
interface Card {
  id: string;
  type: 'text' | 'image' | 'link' | 'rss';
  content: string;
  x: number;
  y: number;
  meta?: any;
}

// 连接线接口定义
interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

// 画布状态接口定义
interface CanvasState {
  offsetX: number;
  offsetY: number;
  scale: number;
  theme: 'light' | 'dark';
}

// 初始化应用
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="canvas">
    <svg id="connections-layer"></svg>
    <div id="cards-layer"></div>
    <div id="selection-box"></div>
    <div id="global-toolbar">
        <button class="toolbar-btn" id="btn-arrange-all">
            <i data-lucide="layout-grid"></i> 整理
        </button>
        <button class="toolbar-btn" id="btn-fit-screen">
            <i data-lucide="scan"></i> 适配
        </button>
    </div>
  </div>
  <div id="command-modal">
    <div class="modal-container">
      <div class="modal-header">
        <div class="modal-tabs">
          <button class="modal-tab active" data-tab="search">搜索</button>
          <button class="modal-tab" data-tab="settings">设置</button>
        </div>
        <button class="modal-close" id="modal-close" aria-label="Close"><i data-lucide="x"></i></button>
      </div>
      
      <div class="modal-body">
        <!-- Search Content -->
        <div class="tab-content active" id="content-search">
          <input type="text" class="search-input" placeholder="搜索卡片..." id="search-input" aria-label="Search cards">
          <div class="search-results" id="search-results"></div>
        </div>

        <!-- Settings Content -->
        <div class="tab-content" id="content-settings">
          <div class="settings-row">
            <span>主题</span>
            <div class="theme-toggle">
              <button class="theme-btn" id="theme-light"><i data-lucide="sun"></i> 亮色</button>
              <button class="theme-btn" id="theme-dark"><i data-lucide="moon"></i> 暗色</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

// Initial icon creation
createIcons({
  icons: {
    LayoutGrid,
    X,
    Sun,
    Moon,
    Scan
  }
});

const canvas = document.getElementById('canvas') as HTMLDivElement;
const cardsLayer = document.getElementById('cards-layer') as HTMLDivElement;
const connectionsLayer = document.getElementById('connections-layer') as unknown as SVGSVGElement;
const selectionBox = document.getElementById('selection-box') as HTMLDivElement;
const btnArrangeAll = document.getElementById('btn-arrange-all') as HTMLButtonElement;
const btnFitScreen = document.getElementById('btn-fit-screen') as HTMLButtonElement;

// Removed selectionToolbar definition
const commandModal = document.getElementById('command-modal') as HTMLDivElement;
const modalCloseBtn = document.getElementById('modal-close') as HTMLButtonElement;
const tabs = document.querySelectorAll('.modal-tab');
const tabContents = document.querySelectorAll('.tab-content');

const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchResults = document.getElementById('search-results') as HTMLDivElement;

const themeLightBtn = document.getElementById('theme-light') as HTMLButtonElement;
const themeDarkBtn = document.getElementById('theme-dark') as HTMLButtonElement;

// Removed BackgroundSystem initialization

// 全局状态
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let cards: Card[] = [];
let connections: Connection[] = [];
const cardMap = new Map<string, HTMLElement>();

// ResizeObserver 用于监听卡片尺寸变化（如图片加载）
const resizeObserver = new ResizeObserver(() => {
  renderConnections();
});

let isDraggingCanvas = false;
let lastMouseX = 0;
let lastMouseY = 0;
let canvasDragDistance = 0; // 记录拖拽距离，用于区分点击和拖拽
// 记录当前鼠标位置，用于新卡片放置
let currentMouseX = window.innerWidth / 2;
let currentMouseY = window.innerHeight / 2;

let isDraggingCard = false;
let draggedCardId: string | null = null; // 主要拖拽的卡片（用于计算增量）
// 多选状态
let selectedCardIds = new Set<string>();

// 框选状态
// let isBoxSelecting = false;
// let selectionStartX = 0;
// let selectionStartY = 0;

let dragStartX = 0;
let dragStartY = 0;
let cardStartPositions = new Map<string, {x: number, y: number}>(); // 记录拖拽开始时所有选中卡片的位置

// 连接线状态
let isAltPressed = false;
let isConnecting = false;
let connectionStartId: string | null = null;
let tempConnectionLine: SVGLineElement | null = null;
let selectedConnectionId: string | null = null;

let isCommandModalActive = false;
let currentTab: 'search' | 'settings' = 'search';
let searchSelectedIndex = -1;
let searchResultIds: string[] = [];

// 主题状态
let currentTheme: 'light' | 'dark' = 'light'; // 默认主题，会被 loadSettings 覆盖

// 工具函数：防抖
const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23999\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3crect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'/%3e%3ccircle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'/%3e%3cpolyline points=\'21 15 16 10 5 21\'/%3e%3c/svg%3e';

function debounce(func: Function, wait: number) {
  let timeout: number;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 防抖保存状态
const saveStateDebounced = debounce(() => {
  saveSettings({ offsetX, offsetY, scale, theme: currentTheme });
}, 1000);

// 屏幕坐标转画布坐标
function screenToCanvas(x: number, y: number) {
  return {
    x: (x - offsetX) / scale,
    y: (y - offsetY) / scale
  };
}

// 画布坐标转屏幕坐标
// function canvasToScreen(x: number, y: number) {
//     return {
//         x: x * scale + offsetX,
//         y: y * scale + offsetY
//     };
// }

// 获取卡片中心点
function getCardCenter(card: Card) {
  // 使用 DOM 元素获取精确尺寸
  const el = cardMap.get(card.id);
  if (el) {
    // offsetWidth/Height 包含边框和内边距
    return {
      x: card.x + el.offsetWidth / 2,
      y: card.y + el.offsetHeight / 2
    };
  }
  return { x: card.x + 150, y: card.y + 100 }; // 兜底方案 (300/2, 200/2)
}

// 创建卡片 DOM 元素
function createCardElement(card: Card) {
  const el = document.createElement('div');
  el.className = `card ${selectedCardIds.has(card.id) ? 'selected' : ''}`;
  el.id = card.id;
  // 使用 transform 定位
  el.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`;
  el.style.left = '0';
  el.style.top = '0';

  // 内容渲染
  const content = document.createElement('div');
  if (card.type === 'text') {
    content.className = 'card-text';
    content.textContent = card.content;
    } else if (card.type === 'image') {
      content.className = 'card-image loading'; // 初始加载状态
      
      const img = document.createElement('img');
      img.draggable = false;
      img.alt = "Card Image";
      
      // 使用内容 URL 或占位图
      if (card.content) {
          img.src = `${API_BASE}${card.content}`;
      } else {
          img.src = PLACEHOLDER_IMG;
      }

      img.onload = () => {
        content.classList.remove('loading');
        img.classList.add('loaded');
      };

      img.onerror = () => {
        // 图片加载失败回退到占位图
        if (img.src !== PLACEHOLDER_IMG) {
            img.src = PLACEHOLDER_IMG;
            content.classList.remove('loading');
            img.classList.add('loaded');
        }
      };
      
      content.appendChild(img);
    } else if (card.type === 'link') {
      content.className = 'card-link';
      
      // 始终创建预览图元素
      const img = document.createElement('img');
      img.className = 'link-preview-image';
      img.draggable = false;
      img.alt = card.meta?.title || "Link Preview";
      
      if (card.meta?.image) {
        img.src = card.meta.image;
      } else {
        img.src = PLACEHOLDER_IMG;
        img.classList.add('loaded'); // 如果是占位图则立即显示
      }
      
      img.onload = () => {
        img.classList.add('loaded');
      };

      img.onerror = () => {
         if (img.src !== PLACEHOLDER_IMG) {
            img.src = PLACEHOLDER_IMG;
            img.classList.add('loaded');
         }
      };
      
      content.appendChild(img);
      
      const metaDiv = document.createElement('div');
      metaDiv.className = 'link-meta';
      
      const title = document.createElement('h4');
      title.className = 'link-title';
      title.textContent = card.meta?.title || card.content;
      metaDiv.appendChild(title);
      
      if (card.meta?.description) {
        const desc = document.createElement('p');
        desc.className = 'link-desc';
        desc.textContent = card.meta.description;
        metaDiv.appendChild(desc);
      }
      
      const footer = document.createElement('div');
      footer.className = 'link-footer';
      if (card.meta?.icon) {
        const icon = document.createElement('img');
        icon.src = card.meta.icon;
        icon.className = 'link-icon';
        icon.alt = "Site Icon";
        icon.onerror = () => { icon.style.display = 'none'; }; // 图标加载失败则隐藏
        footer.appendChild(icon);
      }
      const domain = document.createElement('span');
      domain.className = 'link-domain';
      domain.textContent = card.meta?.domain || new URL(card.content).hostname;
      footer.appendChild(domain);
      
      metaDiv.appendChild(footer);
      content.appendChild(metaDiv);
      
      el.ondblclick = () => {
        window.open(card.content, '_blank');
      };
    } else if (card.type === 'rss') {
      content.className = 'card-rss';
      
      const header = document.createElement('div');
      header.className = 'rss-header';
      header.innerHTML = `
          <div class="rss-icon"><i data-lucide="rss"></i></div>
          <div class="rss-title">${card.meta?.title || 'RSS Feed'}</div>
      `;
      content.appendChild(header);
      
      const list = document.createElement('div');
      list.className = 'rss-list';
      
      if (card.meta?.items && Array.isArray(card.meta.items)) {
          card.meta.items.forEach((item: any) => {
              const row = document.createElement('div');
              row.className = 'rss-item';
              row.innerHTML = `
                  <a href="${item.link}" target="_blank" class="rss-item-link">${item.title}</a>
                  <div class="rss-item-desc">${item.description || ''}</div>
              `;
              // Stop propagation for links to work
              const link = row.querySelector('a');
              if (link) link.onmousedown = (e) => e.stopPropagation();
              list.appendChild(row);
          });
      }
      content.appendChild(list);
      
      // Initial icons
      createIcons({
          icons: { Rss },
          root: header,
          attrs: { width: "16", height: "16" }
      });
    }
  
  el.appendChild(content);

  // 工具栏
  const toolbar = document.createElement('div');
  toolbar.className = 'card-toolbar';

  // 跳转按钮 (仅当内容是 URL 或 Link 类型时)
  const isUrl = card.type === 'link' || /^(http|https):\/\/[^ "]+$/.test(card.content);
  if (isUrl) {
      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'card-toolbar-btn';
      jumpBtn.innerHTML = '<i data-lucide="external-link"></i> 跳转';
      jumpBtn.onclick = (e) => {
          e.stopPropagation();
          window.open(card.content, '_blank');
      };
      // 防止拖拽触发
      jumpBtn.onmousedown = (e) => e.stopPropagation();
      toolbar.appendChild(jumpBtn);
  }

  // 复制按钮
  const copyBtn = document.createElement('button');
  copyBtn.className = 'card-toolbar-btn';
  copyBtn.innerHTML = '<i data-lucide="copy"></i> 复制';
  copyBtn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(card.content).then(() => {
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i data-lucide="check"></i> 已复制';
          createIcons({ icons: { Check }, root: copyBtn, attrs: { width: "14", height: "14" } });
          setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
              createIcons({ icons: { Copy }, root: copyBtn, attrs: { width: "14", height: "14" } });
          }, 1000);
      });
  };
  // 防止拖拽触发
  copyBtn.onmousedown = (e) => e.stopPropagation();
  toolbar.appendChild(copyBtn);

  el.appendChild(toolbar);

  // 初始化图标
  createIcons({
      icons: { ExternalLink, Copy, Check },
      root: toolbar,
      attrs: { width: "14", height: "14" }
  });

  // 监听尺寸变化
  resizeObserver.observe(el);

  // 卡片拖拽与连线逻辑
  el.onmousedown = (e) => {
    e.stopPropagation(); // 阻止画布拖拽
    
    // 仅允许左键
    if (e.button !== 0) return;

    // Alt 键逻辑：连线
    if (isAltPressed) {
        // 启动连线
        isConnecting = true;
        connectionStartId = card.id;
        
        const center = getCardCenter(card);
        tempConnectionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tempConnectionLine.setAttribute('x1', center.x.toString());
        tempConnectionLine.setAttribute('y1', center.y.toString());
        tempConnectionLine.setAttribute('x2', center.x.toString());
        tempConnectionLine.setAttribute('y2', center.y.toString());
        tempConnectionLine.classList.add('connection-line', 'temp');
        connectionsLayer.appendChild(tempConnectionLine);
    } else {
        // 默认逻辑：拖拽 + 选中
        
        // 如果没有按住 Shift/Ctrl，且点击了未选中的卡片，清除其他选中
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !selectedCardIds.has(card.id)) {
             selectedCardIds.forEach(id => {
                const prevEl = cardMap.get(id);
                if (prevEl) prevEl.classList.remove('selected');
            });
            selectedCardIds.clear();
        }

        // 添加当前卡片到选中
        if (!selectedCardIds.has(card.id)) {
            selectedCardIds.add(card.id);
            el.classList.add('selected');
        }
        
        // 启动拖拽
        isDraggingCard = true;
        draggedCardId = card.id;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // 仅拖拽当前卡片
        cardStartPositions.clear();
        cardStartPositions.set(card.id, { x: card.x, y: card.y });
        
        app.style.cursor = 'grabbing';
    }
  };

  el.onmouseup = (e) => {
    if (e.button !== 0) return;
    
    // 如果是连线释放到了卡片上
    if (isConnecting && connectionStartId && connectionStartId !== card.id) {
      e.stopPropagation();
      // 完成连线
      const conn: Connection = {
        id: crypto.randomUUID(),
        fromId: connectionStartId,
        toId: card.id
      };
      saveConnection(conn);
      connections.push(conn);
      renderConnections();
      
      // 重置状态
      isConnecting = false;
      connectionStartId = null;
      if (tempConnectionLine) {
        tempConnectionLine.remove();
        tempConnectionLine = null;
      }
    }
  };

  return el;
}

// 渲染所有卡片
function renderCards() {
  const existingIds = new Set(cardMap.keys());
  const newIds = new Set(cards.map(c => c.id));

  // 移除已删除的卡片
  for (const id of existingIds) {
    if (!newIds.has(id)) {
      const el = cardMap.get(id);
      if (el) {
        resizeObserver.unobserve(el);
        el.remove();
      }
      cardMap.delete(id);
    }
  }

  // 添加或更新卡片
  cards.forEach(card => {
    if (cardMap.has(card.id)) {
      const el = cardMap.get(card.id)!;
      // 仅在非拖拽时更新位置，避免抖动 (拖拽时直接操作 DOM)
      if (!isDraggingCard || draggedCardId !== card.id) {
          // 使用 transform 代替 left/top 以配合硬件加速和避免布局抖动
          el.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`;
      }
      
      if (selectedCardIds.has(card.id)) el.classList.add('selected');
      else el.classList.remove('selected');

      // 如果图片卡片之前是空的（加载状态），现在有了 URL，则更新
      if (card.type === 'image' && card.content) {
        const contentDiv = el.querySelector('.card-image');
        const img = contentDiv?.querySelector('img');
        if (contentDiv && !img) {
            const newImg = document.createElement('img');
            newImg.src = `${API_BASE}${card.content}`;
            newImg.draggable = false;
            newImg.alt = "Card Image";
            newImg.onload = () => {
                contentDiv.classList.remove('loading');
                newImg.classList.add('loaded');
            };
            contentDiv.appendChild(newImg);
        }
      }

    } else {
      const el = createCardElement(card);
      cardsLayer.appendChild(el);
      cardMap.set(card.id, el);
    }
  });

  // 卡片放置后渲染连线（确保能获取到尺寸）
  requestAnimationFrame(() => {
    renderConnections();
  });
  
  updateToolbar();
}

// 渲染所有连线
function renderConnections() {
  // 清空连线层（保留临时连线）
  const tempLine = tempConnectionLine;
  connectionsLayer.innerHTML = '';
  if (tempLine) connectionsLayer.appendChild(tempLine);

  connections.forEach(conn => {
    const fromCard = cards.find(c => c.id === conn.fromId);
    const toCard = cards.find(c => c.id === conn.toId);
    
    if (fromCard && toCard) {
      const fromCenter = getCardCenter(fromCard);
      const toCenter = getCardCenter(toCard);
      
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('connection-group');
      if (selectedConnectionId === conn.id) {
          group.classList.add('selected');
      }

      // 点击区域（透明且更宽）
      const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hitLine.setAttribute('x1', fromCenter.x.toString());
      hitLine.setAttribute('y1', fromCenter.y.toString());
      hitLine.setAttribute('x2', toCenter.x.toString());
      hitLine.setAttribute('y2', toCenter.y.toString());
      hitLine.classList.add('connection-hit-area');
      
      // 可见线条
      const visibleLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      visibleLine.setAttribute('x1', fromCenter.x.toString());
      visibleLine.setAttribute('y1', fromCenter.y.toString());
      visibleLine.setAttribute('x2', toCenter.x.toString());
      visibleLine.setAttribute('y2', toCenter.y.toString());
      visibleLine.classList.add('connection-line');

      // 点击连线选中
      group.onmousedown = (e) => {
          e.stopPropagation();
          // 清除卡片选中
          if (selectedCardIds.size > 0) {
              selectedCardIds.forEach(id => {
                  const el = cardMap.get(id);
                  if (el) el.classList.remove('selected');
              });
              selectedCardIds.clear();
              updateToolbar();
          }
          
          if (selectedConnectionId !== conn.id) {
            selectedConnectionId = conn.id;
            renderConnections(); // 重新渲染以更新样式
          }
      };

      group.appendChild(hitLine);
      group.appendChild(visibleLine);
      connectionsLayer.appendChild(group);
    }
  });
}

// 更新画布变换（缩放和平移）
function updateTransform() {
  cardsLayer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
  connectionsLayer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
}

// 滚动定位到指定卡片
function scrollToCard(id: string) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  
  offsetX = window.innerWidth / 2 - (card.x + 150) * scale; // 卡片中心 (300/2)
  offsetY = window.innerHeight / 2 - (card.y + 100) * scale; // 卡片中心 (200/2)
  
  updateTransform();
  saveStateDebounced(); // 滚动后保存状态
  
  // 更新选中状态
  selectedCardIds.clear();
  selectedCardIds.add(id);
  renderCards();
}

// 切换命令面板
function toggleCommandModal(tab: 'search' | 'settings' = 'search') {
  if (isCommandModalActive && currentTab === tab) {
    // 如果已经打开且是当前 tab，则关闭
    commandModal.classList.remove('active');
    isCommandModalActive = false;
  } else {
    // 打开或切换 tab
    commandModal.classList.add('active');
    isCommandModalActive = true;
    switchTab(tab);
    
    if (tab === 'search') {
      searchInput.value = '';
      searchInput.focus();
      renderSearchResults('');
    }
  }
}

function switchTab(tab: 'search' | 'settings') {
  currentTab = tab;
  
  // Update Tabs UI
  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === tab) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  
  // Update Content UI
  tabContents.forEach(c => {
    if (c.id === `content-${tab}`) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
}

// Tab 点击事件
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab') as 'search' | 'settings';
    switchTab(tabName);
    if (tabName === 'search') {
       searchInput.focus();
    }
  });
});

modalCloseBtn.onclick = () => {
    commandModal.classList.remove('active');
    isCommandModalActive = false;
};

function renderSearchResults(query: string) {
  searchResults.innerHTML = '';
  if (!query) return;

  const q = query.toLowerCase();
  const matches = cards.filter(c => {
    if (c.type === 'text') return c.content.toLowerCase().includes(q);
    if (c.type === 'link') {
        return c.content.toLowerCase().includes(q) || 
               c.meta?.title?.toLowerCase().includes(q) || 
               c.meta?.description?.toLowerCase().includes(q);
    }
    return false;
  });

  searchResultIds = matches.map(c => c.id);
  searchSelectedIndex = matches.length > 0 ? 0 : -1;

  matches.forEach((card, index) => {
    const item = document.createElement('div');
    item.className = `search-item ${index === 0 ? 'selected' : ''}`;
    item.onclick = () => {
      scrollToCard(card.id);
      toggleCommandModal('search');
    };

    let icon = '<i data-lucide="file-text"></i>';
    let title = '';
    let desc = '';

    if (card.type === 'text') {
        icon = '<i data-lucide="file-text"></i>';
        title = card.content;
        desc = 'Text';
    } else if (card.type === 'link') {
        icon = '<i data-lucide="link"></i>';
        title = card.meta?.title || card.content;
        desc = card.content;
    }

    item.innerHTML = `
      <div class="search-item-icon">${icon}</div>
      <div class="search-item-content">
        <div class="search-item-title">${title}</div>
        <div class="search-item-desc">${desc}</div>
      </div>
    `;
    searchResults.appendChild(item);
  });
  
  // Initialize icons for search results
  createIcons({
      icons: { FileText, Link },
      root: searchResults,
      attrs: { width: "16", height: "16" }
  });
}

searchInput.oninput = (e) => {
  renderSearchResults((e.target as HTMLInputElement).value);
};

searchInput.onkeydown = (e) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (searchSelectedIndex < searchResultIds.length - 1) {
            searchSelectedIndex++;
            updateSearchSelection();
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (searchSelectedIndex > 0) {
            searchSelectedIndex--;
            updateSearchSelection();
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchSelectedIndex >= 0 && searchSelectedIndex < searchResultIds.length) {
            scrollToCard(searchResultIds[searchSelectedIndex]);
            toggleCommandModal('search'); // Close modal
        }
    } else if (e.key === 'Escape') {
        // Let global handler handle escape
    }
};

function updateSearchSelection() {
    const items = searchResults.children;
    for (let i = 0; i < items.length; i++) {
        if (i === searchSelectedIndex) {
            items[i].classList.add('selected');
            items[i].scrollIntoView({ block: 'nearest' });
        } else {
            items[i].classList.remove('selected');
        }
    }
}

function setTheme(theme: 'light' | 'dark') {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  // backgroundSystem.setTheme(theme); // Removed
  
  if (theme === 'light') {
    themeLightBtn.classList.add('active');
    themeDarkBtn.classList.remove('active');
  } else {
    themeLightBtn.classList.remove('active');
    themeDarkBtn.classList.add('active');
  }
  
  saveStateDebounced();
}

themeLightBtn.onclick = () => setTheme('light');
themeDarkBtn.onclick = () => setTheme('dark');

// API 交互
async function loadData() {
  const [cardsRes, connsRes, settingsRes] = await Promise.all([
    fetch(`${API_BASE}/api/cards`),
    fetch(`${API_BASE}/api/connections`),
    fetch(`${API_BASE}/api/settings`)
  ]);
  cards = await cardsRes.json();
  connections = await connsRes.json();
  const settings: CanvasState = await settingsRes.json();
  
  if (settings.scale) {
    scale = settings.scale;
    offsetX = settings.offsetX;
    offsetY = settings.offsetY;
    if (settings.theme) {
      setTheme(settings.theme);
    }
    updateTransform();
  }
  
  renderCards();
}

async function saveSettings(state: CanvasState) {
  await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
}

async function saveCard(card: Card) {
  await fetch(`${API_BASE}/api/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card)
  });
}

async function saveConnection(conn: Connection) {
  await fetch(`${API_BASE}/api/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conn)
  });
}

async function deleteCard(id: string) {
  // 乐观更新：先更新 UI
  cards = cards.filter(c => c.id !== id);
  connections = connections.filter(c => c.fromId !== id && c.toId !== id);
  if (selectedCardIds.has(id)) selectedCardIds.delete(id);
  
  // 立即重新渲染
  renderCards();
  renderConnections();

  // 后台发送请求
  try {
      await fetch(`${API_BASE}/api/cards/${id}`, { method: 'DELETE' });
  } catch (err) {
      console.error('Failed to delete card:', err);
      // 如果失败，重新加载数据以恢复一致性
      loadData();
  }
}

async function deleteConnection(id: string) {
    await fetch(`${API_BASE}/api/connections/${id}`, { method: 'DELETE' });
    connections = connections.filter(c => c.id !== id);
    if (selectedConnectionId === id) selectedConnectionId = null;
    renderConnections();
}

async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData
  });
  return await res.json();
}

async function parseUrl(url: string) {
  const res = await fetch(`${API_BASE}/api/parse-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('Failed to parse URL');
  return await res.json();
}

// 整理功能
function updateToolbar() {
    // selectionToolbar.style.display = 'none'; // Removed
}

function autoArrangeCards() {
    // 针对所有卡片进行整理
    const selectedCards = cards;
    if (selectedCards.length <= 1) return;

    // 计算选中卡片的几何中心 (Center of Mass)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    selectedCards.forEach(c => {
        const el = cardMap.get(c.id);
        const w = el?.offsetWidth || 300;
        const h = el?.offsetHeight || 150;
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x + w);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y + h);
    });
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const GAP = 20;

    // 筛选出选定卡片内部的连接线
    const relatedConnections = connections;

    // 如果没有内部连线，回退到网格布局（按 Y 排序）
    if (relatedConnections.length === 0) {
        // 1. 排序：按 Y 坐标排序，如果 Y 接近则按 X 排序
        selectedCards.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) < 50) { 
                return a.x - b.x;
            }
            return yDiff;
        });

        const count = selectedCards.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rowsCount = Math.ceil(count / cols);

        // 计算网格单元格的最大尺寸，确保不对齐问题
        let maxW = 0;
        let maxH = 0;
        selectedCards.forEach(c => {
            const el = cardMap.get(c.id);
            maxW = Math.max(maxW, el?.offsetWidth || 300);
            maxH = Math.max(maxH, el?.offsetHeight || 150);
        });

        // 计算整个网格的宽高
        const totalGridW = cols * maxW + (cols - 1) * GAP;
        const totalGridH = rowsCount * maxH + (rowsCount - 1) * GAP;

        // 以中心点为基准计算起始位置
        const startX = centerX - totalGridW / 2;
        const startY = centerY - totalGridH / 2;

        selectedCards.forEach((card, index) => {
            const colIndex = index % cols;
            const rowIndex = Math.floor(index / cols);

            card.x = startX + colIndex * (maxW + GAP);
            card.y = startY + rowIndex * (maxH + GAP);
            
            saveCard(card);
        });
    } else {
        // 核心整理算法 (Christmas Tree Layout)
        // 1. 圣诞树效果：根节点在顶端中心，子节点在下方水平铺开
        // 2. 递归布局：保证子树不重叠
        // 3. 根节点：连线最多的节点

        // A. 构建图与计算度数
        const adj = new Map<string, string[]>();
        const degree = new Map<string, number>();
        
        selectedCards.forEach(c => {
            adj.set(c.id, []);
            degree.set(c.id, 0);
        });

        relatedConnections.forEach(c => {
            if (adj.has(c.fromId) && adj.has(c.toId)) {
                adj.get(c.fromId)!.push(c.toId);
                adj.get(c.toId)!.push(c.fromId);
                
                degree.set(c.fromId, (degree.get(c.fromId) || 0) + 1);
                degree.set(c.toId, (degree.get(c.toId) || 0) + 1);
            }
        });

        // B. 准备数据
        const GAP_X = 50;
        const GAP_Y = 100;
        const nodeWidths = new Map<string, number>();
        const nodeHeights = new Map<string, number>();
        
        selectedCards.forEach(c => {
            const el = cardMap.get(c.id);
            nodeWidths.set(c.id, el?.offsetWidth || 300);
            nodeHeights.set(c.id, el?.offsetHeight || 150);
        });

        const subtreeWidths = new Map<string, number>();
        const treeChildren = new Map<string, string[]>();
        const visited = new Set<string>();
        const layoutPos = new Map<string, {x: number, y: number}>();

        // C. 处理每个连通分量 (森林)
        // 按度数排序，优先处理大树
        const nodesByDegree = [...selectedCards].sort((a, b) => {
            return (degree.get(b.id) || 0) - (degree.get(a.id) || 0);
        });

        let currentForestX = 0; // 森林中每棵树的起始 X 偏移

        nodesByDegree.forEach(rootCandidate => {
            if (visited.has(rootCandidate.id)) return;

            // 1. 构建生成树 (BFS)
            const rootId = rootCandidate.id;
            const queue = [rootId];
            visited.add(rootId);
            treeChildren.set(rootId, []);

            // 保持遍历顺序以生成树结构
            const bfsOrder: string[] = [rootId];

            while(queue.length > 0) {
                const u = queue.shift()!;
                const neighbors = adj.get(u) || [];
                // 排序子节点：度数小的在两边，大的在中间？或者简单的按度数排序
                // 为了平衡，可以交替放置，但简单起见先按默认顺序
                
                const children: string[] = [];
                neighbors.forEach(v => {
                    if (!visited.has(v)) {
                        visited.add(v);
                        children.push(v);
                        treeChildren.set(v, []); // 初始化
                        queue.push(v);
                        bfsOrder.push(v);
                    }
                });
                treeChildren.set(u, children);
            }

            // 2. 计算子树宽度 (后序遍历/自底向上)
            // 由于 bfsOrder 是层序的，反向遍历即可近似自底向上（只要保证父在子前被处理...不对，BFS是父在前）
            // 应该使用递归函数来计算宽度
            
            const calcWidth = (u: string): number => {
                const children = treeChildren.get(u) || [];
                const myW = nodeWidths.get(u) || 300;
                
                if (children.length === 0) {
                    subtreeWidths.set(u, myW);
                    return myW;
                }
                
                let childrenTotalW = 0;
                children.forEach((v, i) => {
                    childrenTotalW += calcWidth(v);
                    if (i < children.length - 1) childrenTotalW += GAP_X;
                });
                
                // 树宽 = max(自身宽度, 子节点总宽)
                const width = Math.max(myW, childrenTotalW);
                subtreeWidths.set(u, width);
                return width;
            };

            const rootTreeWidth = calcWidth(rootId);

            // 3. 分配坐标 (前序遍历/自顶向下)
            const assignPos = (u: string, x: number, y: number) => {
                const children = treeChildren.get(u) || [];
                const myW = nodeWidths.get(u) || 300;
                const myH = nodeHeights.get(u) || 150;
                const mySubtreeW = subtreeWidths.get(u) || myW;
                
                // 居中放置当前节点：在分配给它的区域 [x, x + mySubtreeW] 中居中
                const myX = x + mySubtreeW / 2 - myW / 2;
                layoutPos.set(u, {x: myX, y: y});
                
                // 放置子节点
                if (children.length > 0) {
                    let childrenTotalW = 0;
                    children.forEach((v, i) => {
                        childrenTotalW += subtreeWidths.get(v) || 0;
                        if (i < children.length - 1) childrenTotalW += GAP_X;
                    });
                    
                    // 计算子节点组的起始 X
                    // 如果子节点总宽 < 当前子树宽（说明父节点更宽），则子节点组居中
                    // 如果子节点总宽 = 当前子树宽（说明子节点撑开了树），则从 x 开始
                    let currentChildX = x;
                    if (childrenTotalW < mySubtreeW) {
                        currentChildX += (mySubtreeW - childrenTotalW) / 2;
                    }
                    
                    const nextY = y + myH + GAP_Y;
                    
                    children.forEach(v => {
                        const childSubtreeW = subtreeWidths.get(v) || 0;
                        assignPos(v, currentChildX, nextY);
                        currentChildX += childSubtreeW + GAP_X;
                    });
                }
            };

            assignPos(rootId, currentForestX, 0); // y 从 0 开始相对坐标
            
            // 更新森林偏移量
            currentForestX += rootTreeWidth + GAP_X * 2;
        });

        // D. 全局居中应用
        // 计算布局的包围盒
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        layoutPos.forEach(pos => {
            minX = Math.min(minX, pos.x);
            maxX = Math.max(maxX, pos.x + (nodeWidths.get(selectedCards.find(c => layoutPos.has(c.id))?.id || '') || 300));
            minY = Math.min(minY, pos.y);
            maxY = Math.max(maxY, pos.y + (nodeHeights.get(selectedCards.find(c => layoutPos.has(c.id))?.id || '') || 150));
        });
        
        // 修正 maxX/maxY 计算：上面代码稍显复杂，直接遍历 layoutPos 结合 width/height
        layoutPos.forEach((pos, id) => {
             const w = nodeWidths.get(id) || 300;
             const h = nodeHeights.get(id) || 150;
             maxX = Math.max(maxX, pos.x + w);
             maxY = Math.max(maxY, pos.y + h);
        });

        const totalW = maxX - minX;
        const totalH = maxY - minY;

        const startX = centerX - totalW / 2 - minX; // -minX 是为了抵消相对坐标的偏移
        const startY = centerY - totalH / 2 - minY;

        layoutPos.forEach((pos, id) => {
            const card = cards.find(c => c.id === id);
            if (card) {
                card.x = startX + pos.x;
                card.y = startY + pos.y;
                saveCard(card);
            }
        });
    }

    selectedCardIds.clear(); // 整理完成后自动取消选中
    renderCards(); // 更新 UI
    renderConnections(); // 更新连线
    // updateToolbar(); // Removed
}

// 辅助函数：消除层内重叠
// function removeOverlaps(layer: string[], nodeMap: Map<string, any>, gap: number) {
//     // 按当前 x 排序
//     layer.sort((a, b) => {
//         const nodeA = nodeMap.get(a)!;
//         const nodeB = nodeMap.get(b)!;
//         return nodeA.x - nodeB.x;
//     });

//     // 从左到右扫描
//     for (let i = 1; i < layer.length; i++) {
//         const prev = nodeMap.get(layer[i-1])!;
//         const curr = nodeMap.get(layer[i])!;
        
//         const minX = prev.x + prev.width + gap;
//         if (curr.x < minX) {
//             curr.x = minX;
//         }
//     }
// }

btnArrangeAll.onclick = (e) => {
    e.stopPropagation(); // 防止触发画布点击
    autoArrangeCards();
};

// 适配屏幕功能
function fitScreen() {
    if (cards.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    // 遍历所有卡片计算边界
    cards.forEach(card => {
        const el = cardMap.get(card.id);
        const w = el?.offsetWidth || 300;
        const h = el?.offsetHeight || 240;
        minX = Math.min(minX, card.x);
        maxX = Math.max(maxX, card.x + w);
        minY = Math.min(minY, card.y);
        maxY = Math.max(maxY, card.y + h);
    });

    const padding = 50; // 留白
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    
    // 如果没有有效内容，不进行操作
    if (contentW <= 0 || contentH <= 0) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // 计算适合的缩放比例
    const scaleX = (screenW - padding * 2) / contentW;
    const scaleY = (screenH - padding * 2) / contentH;

    // 限制最小缩放和最大缩放
    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.min(newScale, 1.0); // 不放大超过 100%
    newScale = Math.max(newScale, 0.1); // 不缩小超过 10%

    // 计算中心偏移
    // 内容的中心点 (在 scale=1 的世界里)
    const contentCenterX = minX + contentW / 2;
    const contentCenterY = minY + contentH / 2;

    // 目标偏移量 = 屏幕中心 - 内容中心 * 缩放比例
    offsetX = (screenW / 2) - contentCenterX * newScale;
    offsetY = (screenH / 2) - contentCenterY * newScale;
    scale = newScale;

    updateTransform();
    saveStateDebounced();
    updateToolbar();
}

btnFitScreen.onclick = (e) => {
    e.stopPropagation();
    fitScreen();
};

// 事件监听器

// 画布平移/缩放
app.onwheel = (e) => {
  e.preventDefault();
  const zoomIntensity = 0.1;
  const delta = -Math.sign(e.deltaY);
  const zoomFactor = Math.exp(delta * zoomIntensity);
  
  const mouseX = e.clientX - app.offsetLeft;
  const mouseY = e.clientY - app.offsetTop;

  const nextScale = scale * zoomFactor;
  
  offsetX = mouseX - (mouseX - offsetX) * zoomFactor;
  offsetY = mouseY - (mouseY - offsetY) * zoomFactor;
  scale = nextScale;
  
  updateTransform();
  saveStateDebounced();
  updateToolbar(); // 缩放时更新工具栏位置
};

const isBackground = (target: EventTarget | null) => 
  target === app || target === canvas || target === cardsLayer || target === connectionsLayer || target === selectionBox;

app.onmousedown = (e) => {
  if (isBackground(e.target)) {
    if (e.button !== 0) return;

    // 默认：平移模式 (移除框选逻辑)
    isDraggingCanvas = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvasDragDistance = 0;
    app.style.cursor = 'grabbing';
  }
};

window.onmousemove = (e) => {
  currentMouseX = e.clientX;
  currentMouseY = e.clientY;

  if (isDraggingCanvas) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    canvasDragDistance += Math.abs(dx) + Math.abs(dy); // 累积拖拽距离
    
    offsetX += dx;
    offsetY += dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    updateTransform();
    // updateToolbar(); // Removed
  } else if (isDraggingCard && draggedCardId) {
    const dx = (e.clientX - dragStartX) / scale;
    const dy = (e.clientY - dragStartY) / scale;
    
    // 仅移动当前拖拽的卡片
    const card = cards.find(c => c.id === draggedCardId);
    const startPos = cardStartPositions.get(draggedCardId!);
    if (card && startPos) {
        card.x = startPos.x + dx;
        card.y = startPos.y + dy;
        
        const el = cardMap.get(draggedCardId!);
        if (el) {
            el.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`;
        }
    }
    
    renderConnections();
    // updateToolbar(); // Removed
  } else if (isConnecting && tempConnectionLine) {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    tempConnectionLine.setAttribute('x2', x.toString());
    tempConnectionLine.setAttribute('y2', y.toString());
  }
};

window.onmouseup = () => {
  if (isDraggingCanvas) {
    isDraggingCanvas = false;
    app.style.cursor = 'grab';
    saveStateDebounced();
  }
  
  if (isDraggingCard) {
    // 保存被拖拽的卡片
    const card = cards.find(c => c.id === draggedCardId);
    if (card) saveCard(card);
    
    isDraggingCard = false;
    draggedCardId = null;
    cardStartPositions.clear();
    app.style.cursor = 'default';
  }
  
  if (isConnecting) {
    isConnecting = false;
    connectionStartId = null;
    if (tempConnectionLine) {
      tempConnectionLine.remove();
      tempConnectionLine = null;
    }
  }
};

// 键盘事件处理
window.addEventListener('keydown', (e) => {
    // 兼容 Mac Command 键和 Windows Ctrl 键
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    if (e.key === 'Alt') {
      isAltPressed = true;
    }
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        
        // 拖拽中的卡片不处理删除
        if (isDraggingCard) return;

        if (selectedCardIds.size > 0) {
            // 批量删除
            const idsToDelete = Array.from(selectedCardIds);
            idsToDelete.forEach(id => deleteCard(id));
            selectedCardIds.clear();
            // updateToolbar(); // Removed
        } else if (selectedConnectionId) {
            deleteConnection(selectedConnectionId);
        }
    }

    // 回车打开链接 (仅当选中一个时)
    if (e.key === 'Enter') {
        if (selectedCardIds.size === 1) {
            const id = Array.from(selectedCardIds)[0];
            const card = cards.find(c => c.id === id);
            if (card && (card.type === 'link' || card.type === 'rss')) {
                // 如果是 RSS 卡片，Enter 键可能没有明确的“主链接”，这里假设不处理或者打开原始 URL
                // 如果 RSS meta 中有 originalUrl
                 if (card.meta?.originalUrl) {
                     window.open(card.meta.originalUrl, '_blank');
                 } else {
                     window.open(card.content, '_blank');
                 }
            }
        }
    }
    
    // 全选 (Ctrl + A)
    if (isCtrlOrCmd && e.key.toLowerCase() === 'a') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        selectedCardIds.clear();
        cards.forEach(c => selectedCardIds.add(c.id));
        renderCards();
    }

    // 搜索 (Ctrl/Cmd + P)
    if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        toggleCommandModal('search');
    }
    
    // 设置 (Ctrl/Cmd + Shift + P)
    if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        toggleCommandModal('settings');
    }

    // Esc 关闭弹窗 或 清除选中
    if (e.key === 'Escape') {
        if (isCommandModalActive) {
            toggleCommandModal(currentTab);
        } else if (selectedCardIds.size > 0) {
            selectedCardIds.clear();
            renderCards();
        }
    }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    isAltPressed = false;
    if (isConnecting) {
      isConnecting = false;
      connectionStartId = null;
      if (tempConnectionLine) {
        tempConnectionLine.remove();
        tempConnectionLine = null;
      }
    }
  }
});

// 粘贴处理
window.addEventListener('paste', async (e) => {
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

  const items = e.clipboardData?.items;
  if (!items) return;

  // 使用当前鼠标位置而不是屏幕中心
  const { x, y } = screenToCanvas(currentMouseX, currentMouseY);

  for (const item of items) {
    if (item.type.startsWith('image')) {
      const file = item.getAsFile();
      if (file) {
        // 乐观 UI：立即创建空内容的卡片（加载状态）
        const tempId = crypto.randomUUID();
        const { x, y } = screenToCanvas(currentMouseX, currentMouseY);
        
        const card: Card = {
          id: tempId,
          type: 'image',
          content: '', // 初始为空
          x,
          y
        };
        cards.push(card);
        // 新增卡片不自动选中，或者只选中新增的
        renderCards(); 
        
        const { url } = await uploadImage(file);
        
        // 更新卡片为真实 URL
        const targetCard = cards.find(c => c.id === tempId);
        if (targetCard) {
            targetCard.content = url;
            saveCard(targetCard);
            renderCards(); // 触发图片加载
        }
      }
    } else if (item.type === 'text/plain') {
      item.getAsString(async (text) => {
        const urlRegex = /^(http|https):\/\/[^ "]+$/;
        if (urlRegex.test(text)) {
          // 乐观 UI：先创建 Loading 卡片
          const tempId = crypto.randomUUID();
          const { x, y } = screenToCanvas(currentMouseX, currentMouseY);
          
          const tempCard: Card = {
              id: tempId,
              type: 'text',
              content: 'Loading...',
              x,
              y
          };
          cards.push(tempCard);
          renderCards();

          try {
            const meta = await parseUrl(text);
            
            // 移除临时卡片
            cards = cards.filter(c => c.id !== tempId);
            
            const card: Card = {
              id: crypto.randomUUID(),
              type: meta.type === 'rss' ? 'rss' : 'link',
              content: text,
              x,
              y,
              meta
            };
            cards.push(card);
            renderCards();
            saveCard(card);
          } catch (err) {
            console.error(err);
            // 解析失败，转为普通文本卡片
            cards = cards.filter(c => c.id !== tempId);
            
             const card: Card = {
              id: crypto.randomUUID(),
              type: 'text',
              content: text,
              x,
              y
            };
            cards.push(card);
            renderCards();
            saveCard(card);
          }
        } else {
          const card: Card = {
            id: crypto.randomUUID(),
            type: 'text',
            content: text,
            x,
            y
          };
          cards.push(card);
          renderCards();
          saveCard(card);
        }
      });
    }
  }
});

// 初始化
loadData();
updateTransform();
