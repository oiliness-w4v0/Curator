FROM denoland/deno:alpine-1.40.0

WORKDIR /app

# 优先复制依赖定义文件以利用缓存
COPY backend/deno.json ./backend/

# 复制源代码
COPY . .

# 缓存依赖
RUN deno cache backend/server.ts

# 暴露端口
EXPOSE 8000

# 启动命令：显式添加 --unstable 参数
# 注意：这里直接运行 server.ts，确保参数被正确传递
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--unstable", "backend/server.ts"]
