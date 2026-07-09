export interface DiffLine {
  kind: "same" | "add" | "del"
  text: string
}

/**
 * Line-level LCS diff for the Sync panel's YAML preview. Config files are
 * tens of lines; the O(n·m) table is nothing.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.length > 0 ? before.split("\n") : []
  const b = after.length > 0 ? after.split("\n") : []

  // Flat (a+1)×(b+1) LCS-length table, row-major.
  const width = b.length + 1
  const lcs = new Int32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i] })
      i++
      j++
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      lines.push({ kind: "del", text: a[i] })
      i++
    } else {
      lines.push({ kind: "add", text: b[j] })
      j++
    }
  }
  for (; i < a.length; i++) lines.push({ kind: "del", text: a[i] })
  for (; j < b.length; j++) lines.push({ kind: "add", text: b[j] })
  return lines
}
