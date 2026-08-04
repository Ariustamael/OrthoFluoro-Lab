export const appPointFromSource = ([x, y, z]) => [
  1000 * x,
  1000 * z,
  1000 * y,
];

export function appTriangleFromSource(points, triangle, normals) {
  const mapped = {
    points: points.map(appPointFromSource),
    triangle: [triangle[0], triangle[2], triangle[1]],
  };

  if (normals) {
    mapped.normals = normals.map(([x, y, z]) => {
      const transformed = [x, z, y];
      const length = Math.hypot(...transformed);
      return transformed.map((coordinate) => coordinate / length);
    });
  }

  return mapped;
}

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
  const inputSpan = boundsDiagonal(points);
  ensureWellConditionedSpatialSamples(centeredPoints, inputSpan);
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

  const radius = Math.sqrt(radiusSquared);
  if (radius > inputSpan * 100) {
    throw new Error("Sphere fit produced an implausible radius for the sample bounds");
  }

  const rootMeanSquareResidual = Math.sqrt(
    points.reduce((sum, point) => {
      const distance = Math.hypot(
        point[0] - center[0],
        point[1] - center[1],
        point[2] - center[2],
      );
      return sum + (distance - radius) ** 2;
    }, 0) / points.length,
  );
  if (rootMeanSquareResidual > inputSpan * 0.1) {
    throw new Error("Sphere fit residual is implausible for the sample bounds");
  }

  return { center, radius };
}

function boundsDiagonal(points) {
  const min = [...points[0]];
  const max = [...points[0]];
  for (const point of points.slice(1)) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return Math.hypot(...max.map((coordinate, axis) => coordinate - min[axis]));
}

function ensureWellConditionedSpatialSamples(centeredPoints, inputSpan) {
  if (!Number.isFinite(inputSpan) || inputSpan <= 0) {
    throw new Error("Sphere points are ill-conditioned");
  }

  const covariance = Array.from({ length: 3 }, () => Array(3).fill(0));
  for (const point of centeredPoints) {
    const scaled = point.map((coordinate) => coordinate / inputSpan);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        covariance[row][column] += scaled[row] * scaled[column];
      }
    }
  }

  const determinant =
    covariance[0][0] *
      (covariance[1][1] * covariance[2][2] -
        covariance[1][2] * covariance[2][1]) -
    covariance[0][1] *
      (covariance[1][0] * covariance[2][2] -
        covariance[1][2] * covariance[2][0]) +
    covariance[0][2] *
      (covariance[1][0] * covariance[2][1] -
        covariance[1][1] * covariance[2][0]);
  const trace = covariance[0][0] + covariance[1][1] + covariance[2][2];
  const normalizedDeterminant = determinant / (trace / 3) ** 3;

  if (!Number.isFinite(normalizedDeterminant) || normalizedDeterminant <= 1e-10) {
    throw new Error("Sphere points are coplanar or ill-conditioned");
  }
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
