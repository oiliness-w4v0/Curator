
// 背景特效系统：流光效果 (Flowing Light / Aurora Effect)
export class BackgroundSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private orbs: Orb[] = [];
  private theme: 'light' | 'dark' = 'light';
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver;

  // 配置项
  private config = {
    orbCount: 5, // 光球数量
    baseSpeed: 0.2, // 基础移动速度
    colors: {
      light: [
        'rgba(65, 105, 225, 0.4)',  // RoyalBlue
        'rgba(255, 105, 180, 0.3)', // HotPink
        'rgba(0, 255, 255, 0.3)',   // Cyan
        'rgba(147, 112, 219, 0.3)', // MediumPurple
        'rgba(255, 165, 0, 0.3)'    // Orange
      ],
      dark: [
        'rgba(25, 25, 112, 0.5)',   // MidnightBlue
        'rgba(75, 0, 130, 0.4)',    // Indigo
        'rgba(0, 100, 100, 0.4)',   // DarkCyan
        'rgba(139, 0, 139, 0.4)',   // DarkMagenta
        'rgba(0, 0, 139, 0.4)'      // DarkBlue
      ]
    }
  };

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`Canvas element with id "${canvasId}" not found`);
    }
    this.canvas = canvas;
    // 获取 2D 上下文
    this.ctx = this.canvas.getContext('2d')!;

    // 监听画布尺寸变化
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(document.body);

    this.init();
    this.animate();
  }

  // 设置主题（明亮/暗黑）
  public setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
    // 主题切换时重新生成光球颜色
    this.updateOrbColors();
  }

  // 初始化
  private init() {
    this.handleResize();
    this.createOrbs();
  }

  // 处理窗口大小调整
  private handleResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // 创建光球
  private createOrbs() {
    this.orbs = [];
    for (let i = 0; i < this.config.orbCount; i++) {
      const colorSet = this.config.colors[this.theme];
      const color = colorSet[i % colorSet.length];
      this.orbs.push(new Orb(this.canvas.width, this.canvas.height, this.config.baseSpeed, color));
    }
  }

  // 更新光球颜色（切换主题时）
  private updateOrbColors() {
    const colorSet = this.config.colors[this.theme];
    this.orbs.forEach((orb, i) => {
      orb.color = colorSet[i % colorSet.length];
    });
  }

  // 动画循环
  private animate() {
    // 清除画布
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 绘制背景底色（可选，这里保持透明或微淡背景）
    // this.ctx.fillStyle = this.theme === 'light' ? '#f0f2f5' : '#1a1a1a';
    // this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 启用混合模式以获得更好的融合效果
    // 'screen' 模式在暗色背景下产生发光效果，但在亮色下可能太亮
    // 这里使用默认混合，依靠透明度叠加
    // this.ctx.globalCompositeOperation = 'lighter'; 

    // 更新并绘制每个光球
    this.orbs.forEach(orb => {
      orb.update(this.canvas.width, this.canvas.height);
      orb.draw(this.ctx);
    });

    // 恢复混合模式
    this.ctx.globalCompositeOperation = 'source-over';

    // 可选：添加全屏模糊以使光晕更柔和（性能消耗较大，也可以通过 CSS backdrop-filter 实现）
    // 这里我们直接依靠径向渐变的透明度来实现柔和感

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  // 销毁实例
  public destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.resizeObserver.disconnect();
  }
}

// 光球类
class Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;

  constructor(width: number, height: number, speed: number, color: string) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    // 随机速度方向
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    // 半径设置为屏幕尺寸的一大部分，产生大面积柔光
    // 取宽高中较小值的 40% 到 60%
    const minDim = Math.min(width, height);
    this.radius = minDim * (0.4 + Math.random() * 0.2);
    
    this.color = color;
  }

  // 更新位置
  update(width: number, height: number) {
    this.x += this.vx;
    this.y += this.vy;

    // 边界反弹（带有一定的缓冲区域，允许光球中心稍微移出屏幕，保证边缘也有覆盖）
    const buffer = this.radius * 0.5; // 允许移出一半半径
    
    if (this.x < -buffer || this.x > width + buffer) {
        this.vx *= -1;
    }
    if (this.y < -buffer || this.y > height + buffer) {
        this.vy *= -1;
    }
  }

  // 绘制
  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    // 创建径向渐变
    // 从中心 (x,y) 到半径 radius
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    
    // 核心颜色
    gradient.addColorStop(0, this.color);
    // 边缘透明
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    // 绘制一个覆盖光球范围的矩形（比 arc 性能略好，且对于渐变填充足够）
    // 或者直接画圆
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
