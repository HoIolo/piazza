// 生成应用源图标（1024×1024 PNG）。
// 纯 Node 手工构造 PNG，避免为了一张图标引入图形库依赖。
//
// 设计：Piazza —— 意大利语的「广场」。
//   形——广场四周连拱廊的一道宽拱，拱下是终端提示符 ">_"。拱必须**宽大于高、
//       拱脚不落地**：并排比过四种拱形，窄而落地的都会落进墓碑的轮廓。
//   色——陶土（terracotta），意大利广场建筑的赭石色。中心亮、边缘沉的大跨度
//       径向渐变，让它在 Dock 里读起来像一块烧制的陶，而不是一片平涂色块。
//
// 三条 macOS 规范，缺一条图标在 Dock 里就会显得比邻居大：
//   1. 本体占画布 80.5%（1024 里的 824）。已实测：备忘录、终端都是这个值。
//   2. 投影要自己烘焙进 PNG。系统不会代劳——Apple 的图标余量里放的正是投影，
//      少了它，同样尺寸的图标少了落地感，读起来又平又大。
//   3. 拐角是连续曲率的 squircle（超椭圆），不是圆弧。圆弧拐角更方，视觉更重。
//
// 用法：node scripts/gen-icon.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const CANVAS = 1024
/**
 * 本体占画布的比例。
 *
 * macOS 规范值是 80.5%（1024 里的 824），备忘录、终端都严格照此。
 * 但那两个一个近黑、一个低饱和且有内部结构，都是往后退的；
 * 我们是一整块暖色、中心还提得很亮，同样几何下视觉上会明显涨出来
 * （已并排比对确认，不是错觉的错觉）。故按 76.5% 收，用真实尺寸抵消色彩的膨胀。
 */
const BODY_RATIO = 0.765
/** 实际图形区域 */
const BOX = Math.round((CANVAS * BODY_RATIO) / 2) * 2
/** 四周留白 */
const INSET = (CANVAS - BOX) / 2
/**
 * 超椭圆指数。n=5 时 45° 方向的轮廓点落在 0.871a，
 * 与半径 0.2237×边长的圆角矩形（0.869a）几乎重合——
 * 即拐角的「厚度」不变，只是把圆弧换成了连续曲率。
 */
const SQUIRCLE_N = 5
/** 每像素 3×3 超采样，用来抗锯齿 */
const SS = 3

/** 符号色。不用纯白：陶土是暖调，纯白压在上面会显得发青 */
const FG = [255, 249, 242]

// 陶土径向渐变的两端。中心 #F5C09A 亮、边缘 #A85228 沉，跨度拉到最大——
// 渐变本身就是这版图标的视觉特征，收窄了就退回成一块平涂的橙色
const GRAD_INNER = [245, 192, 154]
const GRAD_OUTER = [168, 82, 40]

// 投影参数由实测反推（备忘录、终端的 256 档 ×4 折算到 1024）：
// 四周外扩 16px、向下 28px → 下移 12、高斯 σ≈14.5；中轴峰值透明度 24%（本体正下方覆盖率约 0.78，故此处系数取 0.31）。
// 三次箱式模糊逼近高斯：σ = √(3·((2r+1)²−1)/12)，r=14 时 σ≈14.5。
const SHADOW_DY = 12
const SHADOW_BLUR = 14
const SHADOW_PASSES = 3
const SHADOW_ALPHA = 0.31

/** 超椭圆内外判定。坐标相对图形区域左上角 */
function inSquircle(x, y, half) {
  const dx = Math.abs(x - half) / half
  const dy = Math.abs(y - half) / half
  if (dx > 1 || dy > 1) return false
  const dx2 = dx * dx
  const dy2 = dy * dy
  return dx2 * dx2 * dx + dy2 * dy2 * dy <= 1
}

/** 点到线段的距离，用于画有粗细的线 */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/**
 * 径向渐变取色，入参为图形区域内坐标。
 * 渐变中心略微上移，符合光从上方来的直觉，与 macOS 原生图标的打光一致。
 */
function gradientAt(x, y) {
  const cx = BOX / 2
  const cy = BOX * 0.42
  const maxDist = Math.hypot(BOX / 2, BOX * 0.58)
  const t = Math.min(1, Math.hypot(x - cx, y - cy) / maxDist)
  // 平滑收尾，避免边缘出现一圈生硬的色带
  const eased = t * t * (3 - 2 * t)
  return [
    Math.round(GRAD_INNER[0] + (GRAD_OUTER[0] - GRAD_INNER[0]) * eased),
    Math.round(GRAD_INNER[1] + (GRAD_OUTER[1] - GRAD_INNER[1]) * eased),
    Math.round(GRAD_INNER[2] + (GRAD_OUTER[2] - GRAD_INNER[2]) * eased),
  ]
}

/**
 * 符号几何，写在 64×64 的设计稿坐标系里——与前端的 BrandMark 是同一套坐标，
 * 改形只需动这里，下面的栅格化不必碰。
 */
const ART = {
  /** 设计稿整体映射到图形区域的比例。0.70 即符号四周留三成余量 */
  FIT: 0.7,
  /** 设计稿单位下的笔画宽度 */
  STROKE: 3.9,
  /** 图形包围盒中心，据此在图形区域内居中。注意不是 viewBox 中心 */
  CX: 32,
  CY: 33,
  /** 拱：只画上半圆，下半平面交给两条拱脚 */
  ARC: { cx: 32, cy: 37, r: 23 },
  /** 直线段：两条拱脚 +「>」+「_」。端点天然是圆头，等价于 SVG 的 round linecap */
  SEGMENTS: [
    [9, 37, 9, 52],
    [55, 37, 55, 52],
    [24, 33, 30, 39],
    [30, 39, 24, 45],
    [34, 45, 41, 45],
  ],
}

/** 点是否落在符号笔画上，入参为设计稿坐标 */
function onGlyph(x, y) {
  const half = ART.STROKE / 2
  const { cx, cy, r } = ART.ARC
  // 圆弧与拱脚的接缝正好在圆心高度，两边各管一侧，衔接处不会断也不会叠出疙瘩
  if (y <= cy && Math.abs(Math.hypot(x - cx, y - cy) - r) <= half) return true
  return ART.SEGMENTS.some((s) => distToSegment(x, y, ...s) <= half)
}

/** 逐像素超采样，得到本体与字形两张覆盖率图（0..1） */
function buildMasks() {
  const shape = new Float32Array(CANVAS * CANVAS)
  const glyph = new Float32Array(CANVAS * CANVAS)
  const half = BOX / 2
  const step = 1 / SS
  const total = SS * SS
  const scale = (BOX * ART.FIT) / 64

  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      let inside = 0
      let onInk = 0
      for (let sy = 0; sy < SS; sy++) {
        const py = y + (sy + 0.5) * step - INSET
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) * step - INSET
          if (!inSquircle(px, py, half)) continue
          inside++
          // 反变换回设计稿坐标再判笔画，几何定义才能保持与前端一致
          if (onGlyph((px - half) / scale + ART.CX, (py - half) / scale + ART.CY)) onInk++
        }
      }
      const i = y * CANVAS + x
      shape[i] = inside / total
      glyph[i] = onInk / total
    }
  }
  return { shape, glyph }
}

/** 单次箱式模糊（先横后纵），叠加多次即逼近高斯 */
function boxBlur(src, radius) {
  const span = radius * 2 + 1
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)

  for (let y = 0; y < CANVAS; y++) {
    const row = y * CANVAS
    let sum = 0
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(CANVAS - 1, Math.max(0, x))]
    for (let x = 0; x < CANVAS; x++) {
      tmp[row + x] = sum / span
      sum -= src[row + Math.max(0, x - radius)]
      sum += src[row + Math.min(CANVAS - 1, x + radius + 1)]
    }
  }

  for (let x = 0; x < CANVAS; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++)
      sum += tmp[Math.min(CANVAS - 1, Math.max(0, y)) * CANVAS + x]
    for (let y = 0; y < CANVAS; y++) {
      out[y * CANVAS + x] = sum / span
      sum -= tmp[Math.max(0, y - radius) * CANVAS + x]
      sum += tmp[Math.min(CANVAS - 1, y + radius + 1) * CANVAS + x]
    }
  }
  return out
}

/** 本体下移后模糊，得到烘焙用的投影覆盖率图 */
function buildShadow(shape) {
  let mask = new Float32Array(CANVAS * CANVAS)
  for (let y = 0; y < CANVAS; y++) {
    const from = y - SHADOW_DY
    if (from < 0 || from >= CANVAS) continue
    mask.set(shape.subarray(from * CANVAS, from * CANVAS + CANVAS), y * CANVAS)
  }
  for (let i = 0; i < SHADOW_PASSES; i++) mask = boxBlur(mask, SHADOW_BLUR)
  return mask
}

/** 本体压在投影之上做 over 合成，输出非预乘 RGBA 扫描行 */
function buildPixels() {
  const { shape, glyph } = buildMasks()
  const shadow = buildShadow(shape)
  const rows = []

  for (let y = 0; y < CANVAS; y++) {
    const row = Buffer.alloc(CANVAS * 4 + 1)
    row[0] = 0 // filter type: None

    for (let x = 0; x < CANVAS; x++) {
      const i = y * CANVAS + x
      const bodyAlpha = shape[i]
      const shadowAlpha = shadow[i] * SHADOW_ALPHA
      const alpha = bodyAlpha + shadowAlpha * (1 - bodyAlpha)

      const offset = 1 + x * 4
      if (alpha <= 0) continue // Buffer 已清零，透明像素无需写入

      // 字形覆盖率相对本体归一化，边缘半覆盖的像素才不会偏白
      const base = gradientAt(x - INSET, y - INSET)
      const ink = bodyAlpha > 0 ? Math.min(1, glyph[i] / bodyAlpha) : 0
      const weight = bodyAlpha / alpha // 投影为纯黑，只需按本体权重淡出

      for (let c = 0; c < 3; c++) {
        row[offset + c] = Math.round((base[c] + (FG[c] - base[c]) * ink) * weight)
      }
      row[offset + 3] = Math.round(alpha * 255)
    }
    rows.push(row)
  }
  return Buffer.concat(rows)
}

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(CANVAS, 0)
ihdr.writeUInt32BE(CANVAS, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(buildPixels(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = fileURLToPath(new URL('../src-tauri/icons/', import.meta.url))
mkdirSync(out, { recursive: true })
writeFileSync(out + 'source.png', png)
console.log('已生成 src-tauri/icons/source.png')
