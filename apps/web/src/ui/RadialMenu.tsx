import type { OpDef } from '../gal/ops'
import type { NodeAnchor } from './CanvasView'

/**
 * 径向菜单（交互模型 §4.3）：**三类两层**。
 *
 * 第一层三个按钮——**看 / 算 / 造**：
 *   - 看：只往竖卡填内容，不产生对象
 *   - 算：一元操作，点一下就直接长出对象
 *   - 造：多元操作，点了进入 pending，再去点其它节点凑参数
 *
 * 第二层环绕展开该类的操作。一个群有 15+ 个可做操作，**平铺一圈太挤**，
 * 所以先分类、再环绕——这是"三类两层"要解决的问题。
 */

/** 菜单上的短标签：圆形环绕里放不下 `pSub(G, p)` 这种全记法。 */
const MENU_LABEL: Record<string, string> = {
  directProduct: '×',
  quotient: '/',
  intersection: '∩',
  union: '∪',
  difference: '\\',
  productSet: '·',
  center: 'Z',
  centralizer: 'C_G',
  normalizer: 'N_G',
  commutatorGroup: '[G,G]',
  automorphismGroup: 'Aut',
  subgroups: 'Sub',
  pSubgroups: 'pSub',
  sylow: 'Syl',
  normalSubgroups: '⊴',
  conjugationAction: '↷',
  leftTranslationAction: '↻',
  orbits: 'Orb',
  stabilizers: 'Stab',
  fixedPoints: 'Fix',
  kernel: 'ker',
  image: 'im',
  closure: '⟨⟩',
  elementOrder: 'ord',
}

export function menuLabel(op: OpDef): string {
  if (MENU_LABEL[op.id]) return MENU_LABEL[op.id]
  const paren = op.notation.indexOf('(')
  return paren > 0 ? op.notation.slice(0, paren) : op.notation
}

export type MenuStage = 'ring' | 'compute' | 'build'

interface Props {
  anchor: NodeAnchor
  stage: MenuStage
  compute: OpDef[]
  build: OpDef[]
  containerW: number
  containerH: number
  onInspect: () => void
  onOpenGroup: (g: '算' | '造') => void
  onBack: () => void
  onPick: (op: OpDef) => void
}

interface Item {
  key: string
  label: string
  tone: string
  title?: string
  onClick: () => void
}

/** 环绕角度：从正上方开始，均分一圈。 */
function angleAt(i: number, n: number): number {
  return -90 + (i * 360) / n
}

export function RadialMenu({
  anchor,
  stage,
  compute,
  build,
  containerW,
  containerH,
  onInspect,
  onOpenGroup,
  onBack,
  onPick,
}: Props) {
  const items: Item[] =
    stage === 'ring'
      ? [
          { key: 'look', label: '看', tone: 'look', title: '查看属性（只填竖卡，不产生对象）', onClick: onInspect },
          {
            key: 'compute',
            label: `算${compute.length > 0 ? ` ${compute.length}` : ''}`,
            tone: 'compute',
            title: '点一下就直接算出结果',
            onClick: () => onOpenGroup('算'),
          },
          {
            key: 'build',
            label: `造${build.length > 0 ? ` ${build.length}` : ''}`,
            tone: 'build',
            title: '还要再选对象（进入待选）',
            onClick: () => onOpenGroup('造'),
          },
        ]
      : [
          { key: 'back', label: '←', tone: 'back', title: '返回', onClick: onBack },
          ...(stage === 'compute' ? compute : build).map((op) => ({
            key: op.id,
            label: menuLabel(op),
            tone: stage,
            title: `${op.notation} —— ${op.doc}`,
            onClick: () => onPick(op),
          })),
        ]

  const n = items.length
  const R = stage === 'ring' ? 50 : Math.max(92, Math.min(150, 26 * n))
  const PAD_X = 46
  const PAD_Y = 20

  return (
    <div className="radial-layer" data-stage={stage}>
      {items.map((it, i) => {
        const t = (angleAt(i, n) * Math.PI) / 180
        const x = Math.min(Math.max(anchor.x + Math.cos(t) * R, PAD_X), containerW - PAD_X)
        const y = Math.min(Math.max(anchor.y + Math.sin(t) * R, PAD_Y), containerH - PAD_Y)
        return (
          <button
            key={it.key}
            className={`radial-btn radial-${it.tone}`}
            style={{ left: x, top: y }}
            title={it.title}
            onClick={(e) => {
              e.stopPropagation()
              it.onClick()
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
