class KDTree {
  constructor(points, depth = 0) {
    if (!points.length) return null;

    this.axis = depth % 3; // Rotace přes osy R, G, B
    points.sort((a, b) => a[this.axis] - b[this.axis]);
    const median = Math.floor(points.length / 2);

    this.point = points[median];
    this.left = new KDTree(points.slice(0, median), depth + 1);
    this.right = new KDTree(points.slice(median + 1), depth + 1);
  }

  nearest(point, depth = 0, best = { dist: Infinity, node: null }) {
    if (!this.point) return best;

    const axis = depth % 3;
    const dist = this.squaredDistance(point, this.point);

    if (dist < best.dist) {
      best.dist = dist;
      best.node = this;
    }

    const nextBranch = point[axis] < this.point[axis] ? this.left : this.right;
    const otherBranch = nextBranch === this.left ? this.right : this.left;

    if (nextBranch) {
      best = nextBranch.nearest(point, depth + 1, best);
    }

    if (otherBranch && (point[axis] - this.point[axis]) ** 2 < best.dist) {
      best = otherBranch.nearest(point, depth + 1, best);
    }

    return best;
  }

  squaredDistance(point1, point2) {
    return point1.reduce((sum, coord, i) => sum + (coord - point2[i]) ** 2, 0);
  }
}

module.exports = KDTree;
