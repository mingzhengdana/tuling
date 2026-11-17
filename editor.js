/* ============================================
   图片编辑器：比例裁剪 / 旋转 / 镜像
   ============================================ */

import { openModal, closeModal } from './utils.js'

const OUT_SIZE = 900

export function openEditor(source) {
  return new Promise((resolve) => {
    let rotation = 0
    let flip = false
    let ratio = 'original'
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      closeModal()
      resolve(result)
    }

    const image = new Image()
    image.crossOrigin = 'anonymous'

    const ratioValue = () => {
      if (ratio === '1:1') return 1
      if (ratio === '4:3') return 3 / 4
      if (image.naturalWidth && image.naturalHeight) {
        return Math.min(1.5, Math.max(0.7, image.naturalHeight / image.naturalWidth))
      }
      return 1
    }

    const draw = () => {
      const canvas = document.getElementById('editor-canvas')
      if (!canvas || !image.naturalWidth) return
      const width = OUT_SIZE
      const height = Math.round(OUT_SIZE * ratioValue())
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, width, height)

      const swap = rotation % 180 !== 0
      const effWidth = swap ? image.naturalHeight : image.naturalWidth
      const effHeight = swap ? image.naturalWidth : image.naturalHeight
      const scale = Math.max(width / effWidth, height / effHeight)
      const drawWidth = image.naturalWidth * scale
      const drawHeight = image.naturalHeight * scale

      ctx.save()
      ctx.translate(width / 2, height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      if (flip) ctx.scale(-1, 1)
      ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
      ctx.restore()
    }

    const renderSegments = () => {
      document.querySelectorAll('[data-ratio]').forEach((button) => {
        button.classList.toggle('active', button.dataset.ratio === ratio)
      })
    }

    openModal(
      `<div class="modal editor-modal">
        <h3 class="modal-title">编辑照片</h3>
        <p class="editor-tip">照片将按所选比例居中裁剪</p>
        <div class="editor-stage">
          <canvas id="editor-canvas"></canvas>
        </div>
        <div class="seg" data-seg>
          <button data-ratio="original" class="active">原图</button>
          <button data-ratio="1:1">方形</button>
          <button data-ratio="4:3">4:3</button>
        </div>
        <div class="editor-actions">
          <button class="btn btn-ghost btn-sm" data-rotate="-90">左转 90°</button>
          <button class="btn btn-ghost btn-sm" data-rotate="90">右转 90°</button>
          <button class="btn btn-ghost btn-sm" data-flip>镜像翻转</button>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-cancel>取消</button>
          <button class="btn btn-primary" data-ok>完成</button>
        </div>
      </div>`,
      {
        onMount: (root) => {
          root.querySelectorAll('[data-ratio]').forEach((button) => {
            button.onclick = () => {
              ratio = button.dataset.ratio
              renderSegments()
              draw()
            }
          })
          root.querySelectorAll('[data-rotate]').forEach((button) => {
            button.onclick = () => {
              rotation = (rotation + Number(button.dataset.rotate) + 360) % 360
              draw()
            }
          })
          root.querySelector('[data-flip]').onclick = () => {
            flip = !flip
            draw()
          }
          root.querySelector('[data-cancel]').onclick = () => finish(null)
          root.querySelector('[data-ok]').onclick = () => {
            const canvas = document.getElementById('editor-canvas')
            if (!canvas || !image.naturalWidth) {
              finish(null)
              return
            }
            finish(canvas.toDataURL('image/jpeg', 0.92))
          }
        },
        onDismiss: () => finish(null)
      }
    )

    image.onload = () => draw()
    image.onerror = (err) => {
      console.error('[Editor] image load failed', err)
      finish(null)
    }
    image.src = source
  })
}
