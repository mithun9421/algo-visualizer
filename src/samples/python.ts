export const SAMPLE_PY_BUBBLE_SORT = `def bubble_sort(arr):
    for i in range(len(arr)):
        for j in range(len(arr) - i - 1):
            if arr[j] > arr[j + 1]:
                t = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = t
    return arr

result = bubble_sort([5, 2, 4, 1, 3])
print(result)`;

export const SAMPLE_PY_BINARY_SEARCH = `def binary_search(arr, target):
    lo = 0
    hi = len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1

idx = binary_search([1, 3, 5, 7, 9, 11, 13], 9)
print("found at index", idx)`;

export const SAMPLE_PY_FACTORIAL = `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

result = factorial(5)
print("5! =", result)`;

export const SAMPLE_PY_FIBONACCI = `def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

result = fib(6)
print("fib(6) =", result)`;

export const SAMPLE_PY_LINKED_LIST = `def make_node(val):
    return {"val": val, "next": None}

def build_list(values):
    head = make_node(values[0])
    cur = head
    i = 1
    while i < len(values):
        cur["next"] = make_node(values[i])
        cur = cur["next"]
        i = i + 1
    return head

def reverse(head):
    prev = None
    cur = head
    while cur != None:
        nxt = cur["next"]
        cur["next"] = prev
        prev = cur
        cur = nxt
    return prev

lst = build_list([1, 2, 3, 4])
rev = reverse(lst)`;

export const SAMPLE_PY_BINARY_TREE = `def node(val, left, right):
    return {"val": val, "left": left, "right": right}

def inorder(root, out):
    if root == None:
        return
    inorder(root["left"], out)
    out.append(root["val"])
    inorder(root["right"], out)

tree = node(4,
    node(2, node(1, None, None), node(3, None, None)),
    node(6, node(5, None, None), node(7, None, None))
)
seq = []
inorder(tree, seq)
print(seq)`;

export const SAMPLE_PY_CUSTOM = `# Write any Python here. Subset: vars, if/elif/else, for/while, lists, dicts,
# tuples, functions, recursion, len/range/print/min/max/sum/abs/sorted.
# Not supported: classes, imports, comprehensions, try/except, f-strings, lambda.

def gcd(a, b):
    while b != 0:
        t = b
        b = a % b
        a = t
    return a

print("gcd:", gcd(48, 18))`;

export interface PySample {
  key: string;
  label: string;
  source: string;
}

export const PY_SAMPLES: PySample[] = [
  { key: "bubbleSort", label: "Bubble Sort", source: SAMPLE_PY_BUBBLE_SORT },
  { key: "binarySearch", label: "Binary Search", source: SAMPLE_PY_BINARY_SEARCH },
  { key: "factorial", label: "Factorial (recursion)", source: SAMPLE_PY_FACTORIAL },
  { key: "fibonacci", label: "Fibonacci (recursion)", source: SAMPLE_PY_FIBONACCI },
  { key: "linkedList", label: "Linked List Reverse", source: SAMPLE_PY_LINKED_LIST },
  { key: "binaryTree", label: "Binary Tree (inorder)", source: SAMPLE_PY_BINARY_TREE },
  { key: "custom", label: "Custom (write your own)", source: SAMPLE_PY_CUSTOM },
];

export const samples: Record<string, string> = Object.fromEntries(
  PY_SAMPLES.map((s) => [s.key, s.source])
);
