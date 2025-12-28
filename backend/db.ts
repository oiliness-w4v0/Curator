/// <reference lib="deno.unstable" />

// 初始化 Deno KV 数据库
// Deno Deploy 会自动处理持久化
// 本地运行时，如果不指定 path，数据会存储在临时目录
const kv = await Deno.openKv();

// --- 接口定义 ---

export interface Card {
  id: string;
  type: "text" | "image" | "link" | "rss";
  content: string;
  x: number;
  y: number;
  meta?: any;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

export interface CanvasState {
  offsetX: number;
  offsetY: number;
  scale: number;
  theme: 'light' | 'dark';
}

// --- 数据库操作函数 ---

// 获取所有卡片
export const getCards = async (): Promise<Card[]> => {
  const cards: Card[] = [];
  const iter = kv.list<Card>({ prefix: ["cards"] });
  for await (const res of iter) {
    cards.push(res.value);
  }
  return cards;
};

// 插入或更新卡片
export const upsertCard = async (card: Card) => {
  await kv.set(["cards", card.id], card);
};

// 删除卡片
// 同时会删除该卡片相关的所有连线 (级联删除)
export const deleteCard = async (id: string) => {
  await kv.delete(["cards", id]);
  
  // 删除相关的连接线
  // KV 不支持 SQL 的 WHERE 删除，需要遍历查找
  const connections = await getConnections();
  for (const conn of connections) {
    if (conn.fromId === id || conn.toId === id) {
      await kv.delete(["connections", conn.id]);
    }
  }
};

// 获取所有连线
export const getConnections = async (): Promise<Connection[]> => {
  const connections: Connection[] = [];
  const iter = kv.list<Connection>({ prefix: ["connections"] });
  for await (const res of iter) {
    connections.push(res.value);
  }
  return connections;
};

// 添加连线
export const addConnection = async (conn: Connection) => {
  await kv.set(["connections", conn.id], conn);
};

// 删除连线
export const deleteConnection = async (id: string) => {
  await kv.delete(["connections", id]);
};

// 获取设置
export const getSettings = async (): Promise<CanvasState> => {
  const res = await kv.get<CanvasState>(["settings"]);
  return res.value || {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    theme: 'light'
  };
};

// 保存设置
export const saveSettings = async (state: CanvasState) => {
  await kv.set(["settings"], state);
};

// 导出 KV 实例以备不时之需
export default kv;
