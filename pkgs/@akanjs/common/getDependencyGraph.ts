interface DependencyItem {
  key: string;
  deps: string[];
}

interface DependencyLevel {
  level: number;
  keys: string[];
}

interface DependencyGraph {
  levels: string[][];
  levelMap: Map<string, number>;
}

/**
 * Sorts items by their dependency levels using topological sorting
 * @param items Array of items with their dependencies
 * @returns Array of arrays, where each inner array contains keys at the same dependency level
 */
const sortByDependencyLevels = (items: DependencyItem[]): string[][] => {
  // Create adjacency list and in-degree map
  const graph = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  const allKeys = new Set<string>();

  // Initialize graph structures
  for (const item of items) {
    allKeys.add(item.key);
    if (!graph.has(item.key)) graph.set(item.key, new Set());
    if (!inDegree.has(item.key)) inDegree.set(item.key, 0);

    // Add dependencies
    for (const dep of item.deps) {
      const deps = graph.get(dep) ?? new Set();
      deps.add(item.key);
      graph.set(dep, deps);
      inDegree.set(item.key, (inDegree.get(item.key) ?? 0) + 1);
    }
  }

  // Find all nodes with no dependencies (in-degree = 0)
  const queue: string[] = [];
  const levels: string[][] = [];
  const visited = new Set<string>();

  // Start with nodes that have no dependencies
  for (const [key, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(key);
  }

  // Process level by level
  while (queue.length > 0) {
    const currentLevel: string[] = [];
    const queueSize = queue.length;

    // Process all nodes at current level
    for (let i = 0; i < queueSize; i++) {
      const node = queue.shift();
      if (!node) continue;
      if (allKeys.has(node)) currentLevel.push(node);
      visited.add(node);

      // Reduce in-degree for dependent nodes
      const dependents = graph.get(node) ?? new Set();
      for (const dependent of dependents) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) queue.push(dependent);
      }
    }
    if (currentLevel.length > 0) levels.push(currentLevel);
  }

  // Check for missing dependencies
  const missingDeps: string[] = [];
  for (const item of items) {
    for (const dep of item.deps) {
      if (!allKeys.has(dep)) missingDeps.push(`${item.key} -> ${dep} (undefined)`);
    }
  }
  if (missingDeps.length > 0) throw new Error(`Missing dependencies: ${missingDeps.join(", ")}`);

  // Check for circular dependencies
  if (visited.size < allKeys.size) {
    const unvisited = Array.from(allKeys).filter((key) => !visited.has(key));
    throw new Error(`Circular dependency detected involving: ${unvisited.join(", ")}`);
  }

  return levels;
};

/**
 * Alternative: Returns a more detailed dependency graph with level information
 */
export const getDependencyGraph = (items: DependencyItem[]): DependencyGraph => {
  const levels = sortByDependencyLevels(items);
  const levelMap = new Map<string, number>();
  levels.forEach((level, index) => {
    level.forEach((key) => levelMap.set(key, index));
  });
  return { levels, levelMap };
};

/**
 * Helper function to validate dependencies
 */
// function validateDependencies(items: DependencyItem[]): {
//   valid: boolean;
//   missingDeps: string[];
//   circularDeps: boolean;
// } {
//   const allKeys = new Set(items.map((item) => item.key));
//   const missingDeps: string[] = [];

//   for (const item of items) {
//     for (const dep of item.deps) {
//       if (!allKeys.has(dep)) {
//         missingDeps.push(`${item.key} depends on undefined key: ${dep}`);
//       }
//     }
//   }

//   let circularDeps = false;
//   try {
//     sortByDependencyLevels(items);
//   } catch (e) {
//     if (e instanceof Error && e.message.includes("Circular dependency")) {
//       circularDeps = true;
//     }
//   }

//   return {
//     valid: missingDeps.length === 0 && !circularDeps,
//     missingDeps,
//     circularDeps,
//   };
// }
