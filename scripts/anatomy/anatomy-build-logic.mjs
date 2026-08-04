export const appPointFromSource = ([x, y, z]) => [
  1000 * x,
  1000 * z,
  1000 * y,
];

export function mirrorPointAndTriangle(points, triangle) {
  return {
    points: points.map(([x, y, z]) => [x === 0 ? 0 : -x, y, z]),
    triangle: [triangle[0], triangle[2], triangle[1]],
  };
}

export function selectFemoralHeadCandidates(points) {
  if (points.length === 0) {
    return [];
  }

  const axes = [0, 1, 2].map((axis) => points.map((point) => point[axis]));
  const min = axes.map((values) => Math.min(...values));
  const max = axes.map((values) => Math.max(...values));

  return points.filter(
    ([x, , z]) =>
      z >= min[2] + 0.86 * (max[2] - min[2]) &&
      x >= min[0] + 0.5 * (max[0] - min[0]),
  );
}

export function fitSphere(points) {
  if (points.length < 4) {
    throw new Error("At least four points are required to fit a sphere");
  }

  if (
    points.some(
      (point) =>
        point.length !== 3 || point.some((coordinate) => !Number.isFinite(coordinate)),
    )
  ) {
    throw new Error("Sphere points must contain three finite coordinates");
  }

  const origin = [0, 1, 2].map(
    (axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length,
  );
  const centeredPoints = points.map(([x, y, z]) => [
    x - origin[0],
    y - origin[1],
    z - origin[2],
  ]);
  const normalMatrix = Array.from({ length: 4 }, () => Array(4).fill(0));
  const normalVector = Array(4).fill(0);

  for (const [x, y, z] of centeredPoints) {
    const row = [2 * x, 2 * y, 2 * z, 1];
    const squaredDistance = x * x + y * y + z * z;

    for (let column = 0; column < 4; column += 1) {
      normalVector[column] += row[column] * squaredDistance;
      for (let otherColumn = 0; otherColumn < 4; otherColumn += 1) {
        normalMatrix[column][otherColumn] += row[column] * row[otherColumn];
      }
    }
  }

  const solution = solveLinearSystem(normalMatrix, normalVector);
  const localCenter = solution.slice(0, 3);
  const center = localCenter.map((coordinate, axis) => coordinate + origin[axis]);
  const radiusSquared =
    solution[3] +
    localCenter.reduce((sum, coordinate) => sum + coordinate ** 2, 0);

  if (!Number.isFinite(radiusSquared) || radiusSquared < 0) {
    throw new Error("Sphere fit produced an invalid radius");
  }

  return { center, radius: Math.sqrt(radiusSquared) };
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivotColumn = 0; pivotColumn < size; pivotColumn += 1) {
    let pivotRow = pivotColumn;
    for (let row = pivotColumn + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][pivotColumn]) >
        Math.abs(augmented[pivotRow][pivotColumn])
      ) {
        pivotRow = row;
      }
    }

    const pivotMagnitude = Math.abs(augmented[pivotRow][pivotColumn]);
    const rowScale = Math.max(
      1,
      ...augmented[pivotRow].slice(0, size).map((value) => Math.abs(value)),
    );
    if (pivotMagnitude <= Number.EPSILON * rowScale * size) {
      throw new Error("Sphere points must not be coplanar");
    }

    [augmented[pivotColumn], augmented[pivotRow]] = [
      augmented[pivotRow],
      augmented[pivotColumn],
    ];

    const pivot = augmented[pivotColumn][pivotColumn];
    for (let column = pivotColumn; column <= size; column += 1) {
      augmented[pivotColumn][column] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivotColumn) {
        continue;
      }
      const factor = augmented[row][pivotColumn];
      for (let column = pivotColumn; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivotColumn][column];
      }
    }
  }

  const solution = augmented.map((row) => row[size]);
  if (solution.some((value) => !Number.isFinite(value))) {
    throw new Error("Sphere fit produced a non-finite solution");
  }
  return solution;
}
