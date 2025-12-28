
import { Application, Router } from "@oak/oak";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import * as cheerio from "cheerio";
import { getCards, upsertCard, deleteCard, Card, getConnections, addConnection, deleteConnection, Connection, getSettings, saveSettings } from "./db.ts";
import { join, dirname, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";

const app = new Application();
const router = new Router();

// CORS 配置
app.use(oakCors({
  origin: "*", 
  optionsSuccessStatus: 200,
}));

// 工具函数：从 URL 下载图片 (Deno Deploy 适配版：直接返回 URL，不下载)
async function downloadImage(url: string): Promise<string> {
  // 在 Deno Deploy 环境下，文件系统是只读的，无法保存图片到本地。
  // 因此直接返回原始 URL，由前端直接加载 (Hotlinking)。
  // 注意：部分网站可能会防盗链导致图片无法显示。
  return url;
}

// 工具函数：保存上传的文件 (Deno Deploy 适配版：不支持)
async function saveUploadedFile(_file: Blob, _filename: string): Promise<string> {
  throw new Error("File uploads are not supported on Deno Deploy (Read-only file system). Please use image URLs instead.");
}

// --- API 路由定义 ---

// 上传接口
router.post("/api/upload", async (ctx) => {
  const body = ctx.request.body;
  
  if (body.type() === "form-data") {
    const formData = await body.formData();
    const file = formData.get("file") as File;
    const url = formData.get("url") as string;

    if (file) {
      try {
        // Deno Deploy 不支持文件写入，尝试上传文件会报错
        const savedPath = await saveUploadedFile(file, file.name);
        ctx.response.body = { url: savedPath };
      } catch (e: any) {
        ctx.response.status = 400;
        ctx.response.body = { error: e.message || "File upload failed" };
      }
    } else if (url) {
      try {
        const savedPath = await downloadImage(url);
        ctx.response.body = { url: savedPath };
      } catch (e) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Failed to process image URL" };
      }
    } else {
      ctx.response.status = 400;
      ctx.response.body = { error: "No file or url provided" };
    }
  } else {
    ctx.response.status = 400;
  }
});

// URL 解析接口
router.post("/api/parse-url", async (ctx) => {
  const { url } = await ctx.request.body.json();
  if (!url) {
    ctx.response.status = 400;
    return;
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)" }
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    
    const isXml = contentType.includes("xml") || text.trim().startsWith("<?xml") || text.includes("<rss") || text.includes("<feed");
    
    if (isXml) {
        const $ = cheerio.load(text, { xmlMode: true });
        const root = $.root();
        const isRss = root.find("rss").length > 0;
        const isAtom = root.find("feed").length > 0;
        
        if (isRss || isAtom) {
            let feedTitle = "";
            let feedDesc = "";
            let items: any[] = [];
            
            if (isRss) {
                feedTitle = $("channel > title").text();
                feedDesc = $("channel > description").text();
                $("channel > item").slice(0, 5).each((_, el) => {
                    const item = $(el);
                    items.push({
                        title: item.find("title").text(),
                        link: item.find("link").text(),
                        description: item.find("description").text().replace(/<[^>]+>/g, "").substring(0, 100) + "..."
                    });
                });
            } else if (isAtom) {
                feedTitle = $("feed > title").text();
                feedDesc = $("feed > subtitle").text();
                $("entry").slice(0, 5).each((_, el) => {
                    const item = $(el);
                    let link = item.find("link").attr("href");
                    if (!link) link = item.find("link").text();
                    items.push({
                        title: item.find("title").text(),
                        link: link,
                        description: (item.find("summary").text() || item.find("content").text()).replace(/<[^>]+>/g, "").substring(0, 100) + "..."
                    });
                });
            }
            
            ctx.response.body = {
                type: "rss",
                title: feedTitle,
                description: feedDesc,
                items,
                originalUrl: url,
                domain: new URL(url).hostname
            };
            return;
        }
    }

    const html = text;
    const $ = cheerio.load(html);

    let title = 
      $('meta[property="og:title"]').attr("content") || 
      $('meta[name="twitter:title"]').attr("content") || 
      $("title").first().text() || 
      $("h1").first().text() || 
      "";

    let description = 
      $('meta[property="og:description"]').attr("content") || 
      $('meta[name="twitter:description"]').attr("content") || 
      $('meta[name="description"]').attr("content") || 
      "";

    let image = 
      $('meta[property="og:image"]').attr("content") || 
      $('meta[name="twitter:image"]').attr("content") || 
      $('link[rel="image_src"]').attr("href") || 
      "";

    let icon = 
      $('link[rel="apple-touch-icon"]').attr("href") || 
      $('link[rel="icon"]').attr("href") || 
      $('link[rel="shortcut icon"]').attr("href") || 
      "/favicon.ico";

    title = title.trim();
    const siteName = $('meta[property="og:site_name"]').attr("content") || "";
    const domain = new URL(url).hostname;
    
    const stripSuffix = (text: string, suffix: string) => {
        if (!suffix || suffix.length < 2) return text;
        const patterns = [` - ${suffix}`, ` | ${suffix}`, `: ${suffix}`, ` — ${suffix}`, ` · ${suffix}`];
        for (const pattern of patterns) {
             if (text.endsWith(pattern)) return text.substring(0, text.length - pattern.length);
        }
        return text;
    };

    if (siteName) title = stripSuffix(title, siteName);
    const domainParts = domain.split('.');
    if (domainParts.length >= 2) {
        const mainName = domainParts[domainParts.length - 2];
        const mainNameTitle = mainName.charAt(0).toUpperCase() + mainName.slice(1);
        title = stripSuffix(title, domain);
        title = stripSuffix(title, mainName);
        title = stripSuffix(title, mainNameTitle);
    }

    const resolveUrl = (relative: string) => {
      try { return new URL(relative, url).href; } catch { return relative; }
    };

    ctx.response.body = {
      title,
      description,
      image: image ? resolveUrl(image) : "",
      icon: icon ? resolveUrl(icon) : "",
      domain: new URL(url).hostname,
      originalUrl: url
    };
  } catch (e) {
    console.error(e);
    ctx.response.status = 400;
    ctx.response.body = { error: "Failed to parse URL" };
  }
});

// 卡片 CRUD 接口 (Updated to await)
router.get("/api/cards", async (ctx) => {
  ctx.response.body = await getCards();
});

router.post("/api/cards", async (ctx) => {
  const card = await ctx.request.body.json();
  await upsertCard(card);
  ctx.response.body = { success: true };
});

router.delete("/api/cards/:id", async (ctx) => {
  const id = ctx.params.id;
  if (id) {
    await deleteCard(id);
    ctx.response.body = { success: true };
  }
});

// 连接线 CRUD 接口 (Updated to await)
router.get("/api/connections", async (ctx) => {
  ctx.response.body = await getConnections();
});

router.post("/api/connections", async (ctx) => {
  const conn = await ctx.request.body.json();
  await addConnection(conn);
  ctx.response.body = { success: true };
});

router.delete("/api/connections/:id", async (ctx) => {
  const id = ctx.params.id;
  if (id) {
    await deleteConnection(id);
    ctx.response.body = { success: true };
  }
});

// 设置接口 (Updated to await)
router.get("/api/settings", async (ctx) => {
  ctx.response.body = await getSettings();
});

router.post("/api/settings", async (ctx) => {
  const state = await ctx.request.body.json();
  await saveSettings(state);
  ctx.response.body = { success: true };
});

// 注册路由
app.use(router.routes());
app.use(router.allowedMethods());

// 静态文件服务：服务前端构建产物 (dist)
// 动态计算 frontend/dist 的绝对路径
const __dirname = dirname(fromFileUrl(import.meta.url));
const frontendDist = join(__dirname, "../frontend/dist");

app.use(async (ctx, next) => {
  try {
    await ctx.send({
      root: frontendDist,
      index: "index.html",
    });
  } catch {
    await next();
  }
});

console.log("Server running on http://localhost:8000");
await app.listen({ port: 8000 });
