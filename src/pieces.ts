export interface ShapeDef {
  shape: number[][];
  color: string;
}

// テトロミノの基本形と色。出現時にランダムな回転を適用する（プレイヤーは操作できない）
const BASE_SHAPES: ShapeDef[] = [
  { shape: [[1, 1, 1, 1]], color: "#46c3e0" }, // I: シアン
  {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "#e8c33d", // O: 黄
  },
  {
    shape: [
      [1, 1, 1],
      [0, 1, 0],
    ],
    color: "#a469d6", // T: 紫
  },
  {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: "#6cc24a", // S: 緑
  },
  {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: "#e05a5a", // Z: 赤
  },
  {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: "#4a6de0", // J: 青
  },
  {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: "#e98a3d", // L: オレンジ
  },
];

function rotate(m: number[][]): number[][] {
  const rows = m.length;
  const cols = m[0].length;
  const out: number[][] = [];
  for (let x = 0; x < cols; x++) {
    const row: number[] = [];
    for (let y = rows - 1; y >= 0; y--) row.push(m[y][x]);
    out.push(row);
  }
  return out;
}

export function randomShape(): ShapeDef {
  const base = BASE_SHAPES[Math.floor(Math.random() * BASE_SHAPES.length)];
  let shape = base.shape;
  const turns = Math.floor(Math.random() * 4);
  for (let i = 0; i < turns; i++) shape = rotate(shape);
  return { shape, color: base.color };
}
