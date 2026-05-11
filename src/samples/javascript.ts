// js-interpreter is ES5 only — samples use var (not let/const), no arrow fns.

export const SAMPLE_BUBBLE_SORT = `function bubbleSort(arr) {
  for (var i = 0; i < arr.length; i++) {
    for (var j = 0; j < arr.length - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        var t = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = t;
      }
    }
  }
  return arr;
}
var result = bubbleSort([5, 2, 4, 1, 3]);
console.log(result);`;

export const SAMPLE_BINARY_SEARCH = `function binarySearch(arr, target) {
  var lo = 0;
  var hi = arr.length - 1;
  while (lo <= hi) {
    var mid = Math.floor((lo + hi) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
var idx = binarySearch([1, 3, 5, 7, 9, 11, 13], 9);
console.log("found at index", idx);`;

export const SAMPLE_FACTORIAL = `function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
var result = factorial(5);
console.log("5! =", result);`;

export const SAMPLE_LINKED_LIST_REVERSE = `function makeNode(val) {
  return { val: val, next: null };
}
function buildList(values) {
  var head = makeNode(values[0]);
  var cur = head;
  for (var i = 1; i < values.length; i++) {
    cur.next = makeNode(values[i]);
    cur = cur.next;
  }
  return head;
}
function reverse(head) {
  var prev = null;
  var cur = head;
  while (cur !== null) {
    var nxt = cur.next;
    cur.next = prev;
    prev = cur;
    cur = nxt;
  }
  return prev;
}
var list = buildList([1, 2, 3, 4]);
var rev = reverse(list);`;

export const SAMPLE_CUSTOM = `// Write any JavaScript here (ES5 — use var, not let/const).
// Press Run, or just stop typing for ~400ms and it auto-runs.

function gcd(a, b) {
  while (b !== 0) {
    var t = b;
    b = a % b;
    a = t;
  }
  return a;
}
var result = gcd(48, 18);
console.log("gcd:", result);`;

export const SAMPLE_BINARY_TREE = `function node(val, left, right) {
  return { val: val, left: left, right: right };
}
function inorder(root, out) {
  if (root === null) return;
  inorder(root.left, out);
  out.push(root.val);
  inorder(root.right, out);
}
var tree = node(4,
  node(2, node(1, null, null), node(3, null, null)),
  node(6, node(5, null, null), node(7, null, null))
);
var seq = [];
inorder(tree, seq);
console.log(seq);`;

export interface JsSample {
  key: string;
  label: string;
  source: string;
}

export const JS_SAMPLES: JsSample[] = [
  { key: "bubbleSort", label: "Bubble Sort", source: SAMPLE_BUBBLE_SORT },
  { key: "binarySearch", label: "Binary Search", source: SAMPLE_BINARY_SEARCH },
  { key: "factorial", label: "Factorial (recursion)", source: SAMPLE_FACTORIAL },
  { key: "linkedList", label: "Linked List Reverse", source: SAMPLE_LINKED_LIST_REVERSE },
  { key: "binaryTree", label: "Binary Tree (inorder)", source: SAMPLE_BINARY_TREE },
  { key: "custom", label: "Custom (write your own)", source: SAMPLE_CUSTOM },
];

export const samples: Record<string, string> = Object.fromEntries(
  JS_SAMPLES.map((s) => [s.key, s.source])
);
