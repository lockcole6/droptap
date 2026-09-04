import { randomShape, ShapeDef } from "./pieces";

export const enum Cell {
  Empty = 0,
  Player = 1, // プレイヤーがタップで置いたブロック（これだけではラインが揃っても消えない）
  Fallen = 2, // 落下ブロック由来（消去条件のトリガー）
}

export interface Piece {
  shape: number[][];
  color: string;
  x: number;
  y: number; // 負の値 = フィールド上端より上
}

export interface Config {
  width: number;
  height: number;
  dropMs: number;
}

export class Game {
  grid: Cell[][];
  colors: string[][]; // Fallen セルの色（着地したミノの色を保持）
  piece: Piece | null = null;
  score = 0;
  lines = 0;
  over = false;
  clearing: number[] = []; // 消去演出中の行
  phased = new Set<string>(); // 透過中の灰色（Player）セル（"x,y"）。次のミノ着地で元に戻る
  open: boolean[][] = []; // 上端の空とつながっている空マス。囲われたマスには灰色を置けない
  next: ShapeDef[] = []; // 次に出現するミノの予告キュー

  /** 5ライン消すごとにレベルアップ */
  get level(): number {
    return Math.floor(this.lines / 5);
  }

  /** レベルが上がるほど落下間隔が短くなる（15%ずつ、下限120ms） */
  get dropInterval(): number {
    return Math.max(120, this.cfg.dropMs * Math.pow(0.85, this.level));
  }

  constructor(public cfg: Config) {
    this.grid = Array.from({ length: cfg.height }, () =>
      new Array<Cell>(cfg.width).fill(Cell.Empty),
    );
    this.colors = Array.from({ length: cfg.height }, () =>
      new Array<string>(cfg.width).fill(""),
    );
    this.updateOpen();
    this.spawn();
  }

  /**
   * 上端から塗りつぶし探索して、空につながっているマスを求める。
   * 壁になるのはミノ由来（Fallen）のセルだけ。自分の灰色は通り抜け扱いに
   * することで、置く順番によって「自分で閉じ込めて置けなくなる」ことを防ぐ。
   */
  private updateOpen() {
    const { width, height } = this.cfg;
    const open = Array.from({ length: height }, () =>
      new Array<boolean>(width).fill(false),
    );
    const stack: [number, number][] = [];
    for (let x = 0; x < width; x++) {
      if (this.grid[0][x] !== Cell.Fallen) {
        open[0][x] = true;
        stack.push([x, 0]);
      }
    }
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (open[ny][nx] || this.grid[ny][nx] === Cell.Fallen) continue;
        open[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
    this.open = open;
  }

  private spawn() {
    while (this.next.length < 2) this.next.push(randomShape());
    const { shape, color } = this.next.shift()!;
    this.piece = {
      shape,
      color,
      x: Math.floor(Math.random() * (this.cfg.width - shape[0].length + 1)),
      y: -shape.length + 1, // 最下段の1列がフィールド内に見える位置から出現
    };
  }

  /** 現在のピースが占めるマスか */
  pieceOccupies(x: number, y: number): boolean {
    const p = this.piece;
    if (!p) return false;
    const sy = y - p.y;
    const sx = x - p.x;
    return (
      sy >= 0 &&
      sy < p.shape.length &&
      sx >= 0 &&
      sx < p.shape[0].length &&
      p.shape[sy][sx] === 1
    );
  }

  /** ピースを縦位置 y に置いたとき衝突しないか */
  private fits(p: Piece, y: number): boolean {
    for (let sy = 0; sy < p.shape.length; sy++) {
      for (let sx = 0; sx < p.shape[sy].length; sx++) {
        if (p.shape[sy][sx] === 0) continue;
        const gy = y + sy;
        const gx = p.x + sx;
        if (gy >= this.cfg.height) return false;
        if (
          gy >= 0 &&
          this.grid[gy][gx] !== Cell.Empty &&
          !this.phased.has(`${gx},${gy}`) // 透過中のセルは通過できる
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /** 現在のピースがこのまま落ちたときの着地位置（ゴースト表示用） */
  ghostY(): number {
    const p = this.piece;
    if (!p) return 0;
    let y = p.y;
    while (this.fits(p, y + 1)) y++;
    return y;
  }

  /** 1ステップ落下。着地したら固定 → ライン判定 → 次のピース出現 */
  tick() {
    if (this.over || this.clearing.length > 0 || !this.piece) return;
    if (this.fits(this.piece, this.piece.y + 1)) {
      this.piece.y++;
      return;
    }
    this.lock();
  }

  /** ミノをタップしたとき: 着地位置まで一気に落として固定 */
  hardDrop() {
    if (this.over || this.clearing.length > 0 || !this.piece) return;
    this.piece.y = this.ghostY();
    this.lock();
  }

  private lock() {
    const p = this.piece!;
    for (let sy = 0; sy < p.shape.length; sy++) {
      for (let sx = 0; sx < p.shape[sy].length; sx++) {
        if (p.shape[sy][sx] === 0) continue;
        const gy = p.y + sy;
        if (gy < 0) {
          // フィールド上端からあふれて固定 = ゲームオーバー
          this.over = true;
          continue;
        }
        // 透過中の灰色に重なって着地したら、灰色は砕けてミノで上書き
        this.grid[gy][p.x + sx] = Cell.Fallen;
        this.colors[gy][p.x + sx] = p.color;
      }
    }
    this.phased.clear(); // 透過はミノ1回分。着地したら残りは元に戻る
    this.piece = null;
    this.updateOpen();
    this.checkClear();
    if (!this.over && this.clearing.length === 0) this.spawn();
  }

  /** 揃った行のうち、落下由来のセルを含む行だけを消去対象にする（ミノ設置時のみ呼ばれる） */
  private checkClear() {
    const rows: number[] = [];
    for (let y = 0; y < this.cfg.height; y++) {
      const row = this.grid[y];
      if (row.every((c) => c !== Cell.Empty) && row.includes(Cell.Fallen)) {
        rows.push(y);
      }
    }
    this.clearing = rows;
  }

  /** 消去演出が終わったら呼ぶ。行を削除して上を詰め、次のピースを出す */
  finishClear() {
    if (this.clearing.length === 0) return;
    const remove = new Set(this.clearing);
    this.grid = this.grid.filter((_, y) => !remove.has(y));
    this.colors = this.colors.filter((_, y) => !remove.has(y));
    while (this.grid.length < this.cfg.height) {
      this.grid.unshift(new Array<Cell>(this.cfg.width).fill(Cell.Empty));
      this.colors.unshift(new Array<string>(this.cfg.width).fill(""));
    }
    const n = this.clearing.length;
    this.lines += n;
    this.score += [0, 100, 300, 500, 800][Math.min(n, 4)];
    this.clearing = [];
    this.updateOpen();
    if (!this.over && !this.piece) this.spawn();
  }

  /** 灰色ブロックを透過状態にして落下ミノが通過できるようにする（ダブルタップ用） */
  phase(x: number, y: number) {
    if (this.over || this.clearing.length > 0) return;
    if (x < 0 || x >= this.cfg.width || y < 0 || y >= this.cfg.height) return;
    if (this.grid[y][x] !== Cell.Player) return;
    this.phased.add(`${x},${y}`);
  }

  /**
   * マスを塗る/消す（タップとドラッグ共用）。
   * place=true なら空マスにブロックを置き、false なら自分のブロックを消す。
   * 落下由来のマス・ピースの真下・囲われたマス（空につながっていない）は配置不可。
   */
  paint(x: number, y: number, place: boolean) {
    if (this.over) return;
    if (x < 0 || x >= this.cfg.width || y < 0 || y >= this.cfg.height) return;
    if (this.clearing.includes(y)) return;
    if (this.pieceOccupies(x, y)) return;
    const cur = this.grid[y][x];
    // 灰色は囲い判定の壁にならないので、置き外しで open の再計算は不要
    if (place && cur === Cell.Empty && this.open[y][x]) {
      this.grid[y][x] = Cell.Player;
    } else if (!place && cur === Cell.Player) {
      this.grid[y][x] = Cell.Empty;
      this.phased.delete(`${x},${y}`);
    }
  }
}
