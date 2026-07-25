export type WalkGrid = {
  w: number;
  h: number;
  blocked: ReadonlySet<string>;
};

export type GridPoint = { x: number; y: number };

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function inBounds(grid: WalkGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.w && y < grid.h;
}

/** A* shortest path on a 4-connected grid. Returns inclusive from→to, or null if unreachable. */
export function findPath(
  grid: WalkGrid,
  from: GridPoint,
  to: GridPoint,
): GridPoint[] | null {
  if (!inBounds(grid, from.x, from.y) || !inBounds(grid, to.x, to.y)) return null;
  if (grid.blocked.has(key(from.x, from.y)) || grid.blocked.has(key(to.x, to.y))) {
    return null;
  }
  if (from.x === to.x && from.y === to.y) return [{ ...from }];

  const open = new Map<string, { x: number; y: number; g: number; f: number }>();
  const came = new Map<string, string>();
  const gScore = new Map<string, number>();

  const startK = key(from.x, from.y);
  const h0 = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  open.set(startK, { x: from.x, y: from.y, g: 0, f: h0 });
  gScore.set(startK, 0);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  while (open.size > 0) {
    let bestK: string | null = null;
    let bestF = Infinity;
    for (const [k, node] of open) {
      if (node.f < bestF) {
        bestF = node.f;
        bestK = k;
      }
    }
    if (bestK === null) break;
    const current = open.get(bestK)!;
    open.delete(bestK);

    if (current.x === to.x && current.y === to.y) {
      const path: GridPoint[] = [{ x: current.x, y: current.y }];
      let ck = bestK;
      while (came.has(ck)) {
        ck = came.get(ck)!;
        const [xs, ys] = ck.split(',').map(Number) as [number, number];
        path.push({ x: xs, y: ys });
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inBounds(grid, nx, ny)) continue;
      const nk = key(nx, ny);
      if (grid.blocked.has(nk)) continue;
      const tentative = current.g + 1;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      came.set(nk, bestK);
      gScore.set(nk, tentative);
      const f = tentative + Math.abs(to.x - nx) + Math.abs(to.y - ny);
      open.set(nk, { x: nx, y: ny, g: tentative, f });
    }
  }

  return null;
}
