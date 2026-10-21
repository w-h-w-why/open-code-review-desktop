import type { OcrApi } from '@shared/types'

declare global {
  interface Window {
    ocr: OcrApi
  }
}

export {}
