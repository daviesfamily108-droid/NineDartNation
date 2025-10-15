import React, { PropsWithChildren, useEffect, useRef, type CSSProperties } from 'react'

type ScrollFadeProps = PropsWithChildren<{
  className?: string
  style?: CSSProperties
}>

export default function ScrollFade({ children, className, style }: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Clip content under the sticky header so text never shows over it
  useEffect(() => {
    let raf = 0
    const updateClip = () => {
      const wrapper = ref.current
      if (!wrapper) return
  const header = document.getElementById('ndn-header') as HTMLElement | null
      if (!header) {
        wrapper.style.clipPath = ''
        return
      }
  const scroller = document.getElementById('ndn-main-scroll') as HTMLElement | null
  const scrollTop = scroller ? scroller.scrollTop : (window.scrollY || 0)
  // As soon as the user scrolls at all, reserve the full header height so content never slides under it
  const headerH = header.getBoundingClientRect().height
  const overlap = scrollTop > 0 ? headerH : 0
  wrapper.style.marginTop = overlap > 0 ? `${overlap}px` : '0px'
    }
    updateClip()
    const onScrollOrResize = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updateClip)
    }
    // Listen to the app's main scroll container instead of window
    const scroller = document.getElementById('ndn-main-scroll')
  scroller?.addEventListener('scroll', onScrollOrResize as any, { passive: true } as any)
    // Fallback to window for safety (mobile or non-standard layouts)
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    return () => {
  scroller?.removeEventListener('scroll', onScrollOrResize as any)
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}
