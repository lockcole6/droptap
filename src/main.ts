import { Cell, Config, Game } from "./game";
import { Renderer } from "./render";
import "./style.css";

const canvas = document.getElementById("board") as HTMLCanvasElement;
const nextCanvas = document.getElementById("next") as HTMLCanvasElement;
const scoreEl = document.getElementById("score")!;
const linesEl = document.getElementById("lines")!;
const levelEl = document.getElementById("level")!;
const pauseBtn = document.getElementById("pause") as HTMLButtonElement;
const restartBtn = document.getElementById("restart") as HTMLButtonElement;
const applyBtn = document.getElementById("apply") as HTMLButtonElement;
const widthInput = document.getElementById("cfg-width") as HTMLInputElement;
const heightInput = document.getElementById("cfg-height") as HTMLInputElement;
const speedSelect = document.getElementById("cfg-speed") as HTMLSelectElement;

const CLEAR_ANIM_MS = 250;

function readConfig(): Config {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.floor(v) || lo));
  return {
    width: clamp(Number(widthInput.value), 4, 12),
    height: clamp(Number(heightInput.value), 8, 24),
    dropMs: Number(speedSelect.value),
  };
}

let game = new Game(readConfig());
const renderer = new Renderer(canvas);
let paused = false;
let lastDrop = 0;
let clearStart = 0; // 0 = 消去演出中でない

function maybeStartClear(now: number) {
  if (game.clearing.length > 0 && clearStart === 0) clearStart = now;
}

function restart() {
  game = new Game(readConfig());
  paused = false;
  lastDrop = performance.now();
  clearStart = 0;
  pauseBtn.textContent = "一時停止";
}

function cellFromEvent(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const cell = Math.min(
    rect.width / game.cfg.width,
    rect.height / game.cfg.height,
  );
  return {
    x: Math.floor((e.clientX - rect.left) / cell),
    y: Math.floor((e.clientY - rect.top) / cell),
  };
}

// ドラッグで連続配置/連続消去。最初にタップしたマスで塗るか消すかが決まる
let dragging = false;
let dragPlace = true;
let lastCellKey = "";

// 灰色へのダブルタップ検出（透過用）。
// 1回目のタップで灰色は一旦消え、300ms以内に同じマスを再タップすると
// 透過状態（ミノが通過できる）で置き直される
const DOUBLE_TAP_MS = 300;
let lastEraseTime = 0;
let lastEraseKey = "";

canvas.addEventListener("pointerdown", (e) => {
  if (paused) return;
  const { x, y } = cellFromEvent(e);
  if (game.pieceOccupies(x, y)) {
    const now = performance.now();
    game.hardDrop();
    maybeStartClear(now);
    lastDrop = now;
    return;
  }
  const key = `${x},${y}`;
  const now = performance.now();
  dragPlace = game.grid[y]?.[x] !== Cell.Player;
  if (!dragPlace) {
    // 灰色を消すタップ。ダブルタップ判定のために記録しておく
    lastEraseTime = now;
    lastEraseKey = key;
  } else if (key === lastEraseKey && now - lastEraseTime < DOUBLE_TAP_MS) {
    // 直前に消した灰色をすぐ再タップ → 透過状態で復活
    game.paint(x, y, true);
    game.phase(x, y);
    lastEraseKey = "";
    return;
  }
  dragging = true;
  lastCellKey = key;
  canvas.setPointerCapture(e.pointerId);
  game.paint(x, y, dragPlace);
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging || paused) return;
  const { x, y } = cellFromEvent(e);
  const key = `${x},${y}`;
  if (key === lastCellKey) return;
  lastCellKey = key;
  game.paint(x, y, dragPlace);
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});

pauseBtn.addEventListener("click", () => {
  if (game.over) return;
  paused = !paused;
  pauseBtn.textContent = paused ? "再開" : "一時停止";
  if (!paused) lastDrop = performance.now();
});

restartBtn.addEventListener("click", restart);
applyBtn.addEventListener("click", restart);

function loop(now: number) {
  if (!paused && !game.over) {
    if (clearStart > 0) {
      if (now - clearStart >= CLEAR_ANIM_MS) {
        game.finishClear();
        clearStart = 0;
        lastDrop = now;
      }
    } else if (now - lastDrop >= game.dropInterval) {
      game.tick();
      maybeStartClear(now);
      lastDrop = now;
    }
  }
  renderer.draw(game);
  renderer.drawNext(nextCanvas, game.next);
  scoreEl.textContent = String(game.score);
  linesEl.textContent = String(game.lines);
  levelEl.textContent = String(game.level + 1);
  requestAnimationFrame(loop);
}

lastDrop = performance.now();
requestAnimationFrame(loop);
