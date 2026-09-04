import { Cell, Game } from "./game";
import { ShapeDef } from "./pieces";

const PLAYER_COLOR = "#8b93a5"; // 自分で置いたブロック（ミノで使っていない灰色で区別する）
const BG_COLOR = "#1c1f28";
const GHOST_ALPHA = 0.3;

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  /**
   * 親要素の空きスペースに収まる盤面サイズを計算し、canvas 要素自体を
   * 盤面と同じ縦横比にリサイズする（表示が引き伸ばされるとタップ座標が
   * ずれるため）。デバイスピクセルでのセルサイズを返す。
   */
  private fit(game: Game): number {
    const dpr = window.devicePixelRatio || 1;
    const avail = this.canvas.parentElement!.getBoundingClientRect();
    const cellCss = Math.min(
      avail.width / game.cfg.width,
      avail.height / game.cfg.height,
    );
    const cssW = cellCss * game.cfg.width;
    const cssH = cellCss * game.cfg.height;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return w / game.cfg.width;
  }

  draw(game: Game) {
    const cell = this.fit(game);
    const ctx = this.ctx;
    const W = game.cfg.width * cell;
    const H = game.cfg.height * cell;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // グリッド線
    ctx.strokeStyle = "#2a2e3a";
    ctx.lineWidth = 1;
    for (let x = 0; x <= game.cfg.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, H);
      ctx.stroke();
    }
    for (let y = 0; y <= game.cfg.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell);
      ctx.lineTo(W, y * cell);
      ctx.stroke();
    }

    // 固定ブロック。囲われた空マス（灰色を置けない場所）は暗く影を落とす
    const clearing = new Set(game.clearing);
    for (let y = 0; y < game.cfg.height; y++) {
      for (let x = 0; x < game.cfg.width; x++) {
        const c = game.grid[y][x];
        if (c === Cell.Empty) {
          if (!game.open[y][x]) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
            ctx.fillRect(x * cell, y * cell, cell, cell);
          }
          continue;
        }
        if (clearing.has(y)) {
          this.block(x, y, cell, "#ffffff");
        } else if (c === Cell.Player) {
          if (game.phased.has(`${x},${y}`)) {
            // 透過中: 薄く点滅させて「ミノが通過できる」ことを示す
            ctx.globalAlpha =
              0.22 + 0.12 * Math.sin(performance.now() / 130);
            this.block(x, y, cell, PLAYER_COLOR);
            ctx.globalAlpha = 1;
          } else {
            this.block(x, y, cell, PLAYER_COLOR);
          }
        } else {
          this.block(x, y, cell, game.colors[y][x]);
        }
      }
    }

    // 着地予測（ゴースト）と落下中のピース
    const p = game.piece;
    if (p) {
      const gy0 = game.ghostY();
      if (gy0 !== p.y) {
        ctx.globalAlpha = GHOST_ALPHA;
        this.drawShape(p.shape, p.x, gy0, cell, p.color);
        ctx.globalAlpha = 1;
      }
      this.drawShape(p.shape, p.x, p.y, cell, p.color);
    }

    if (game.over) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(cell * 0.8)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ゲームオーバー", W / 2, H / 2);
    }
  }

  private drawShape(
    shape: number[][],
    px: number,
    py: number,
    cell: number,
    color: string,
  ) {
    for (let sy = 0; sy < shape.length; sy++) {
      for (let sx = 0; sx < shape[sy].length; sx++) {
        if (shape[sy][sx] === 0) continue;
        const gy = py + sy;
        if (gy < 0) continue;
        this.block(px + sx, gy, cell, color);
      }
    }
  }

  /** NEXT予告バー: 次の1個を小さく描く */
  drawNext(canvas: HTMLCanvasElement, queue: ShapeDef[]) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    const count = Math.min(queue.length, 1);
    const slotW = w;
    for (let i = 0; i < count; i++) {
      const { shape, color } = queue[i];
      const rows = shape.length;
      const cols = shape[0].length;
      const cell = Math.min((slotW * 0.8) / cols, (h * 0.8) / rows);
      const ox = i * slotW + (slotW - cols * cell) / 2;
      const oy = (h - rows * cell) / 2;
      ctx.fillStyle = color;
      for (let sy = 0; sy < rows; sy++) {
        for (let sx = 0; sx < cols; sx++) {
          if (shape[sy][sx] === 0) continue;
          const pad = Math.max(0.25, cell * 0.025);
          ctx.beginPath();
          ctx.roundRect(
            ox + sx * cell + pad,
            oy + sy * cell + pad,
            cell - pad * 2,
            cell - pad * 2,
            cell * 0.08,
          );
          ctx.fill();
        }
      }
    }
  }

  private block(x: number, y: number, cell: number, color: string) {
    const pad = Math.max(0.5, cell * 0.025);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.roundRect(
      x * cell + pad,
      y * cell + pad,
      cell - pad * 2,
      cell - pad * 2,
      cell * 0.08,
    );
    this.ctx.fill();
  }
}
