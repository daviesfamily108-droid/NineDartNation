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
       // Hide content under the sticky header by rendering a lightweight mask
       // element at the top of the wrapper. Using an overlay avoids layout shifts
       // and prevents clip-path + transform interactions that can cause rendering
       // artifacts in some browsers.
       const headerH = header.getBoundingClientRect().height
       const overlap = scrollTop > 0 ? headerH : 0
       try {
         // Find or create the mask node
         let mask = wrapper.querySelector('[data-ndn-top-mask]') as HTMLElement | null
         if (!mask) {
           mask = document.createElement('div')
           mask.setAttribute('data-ndn-top-mask', '1')
           // keep it non-interactive and on top of the wrapper content
           Object.assign(mask.style, {
             position: 'absolute',
             left: '0px',
             right: '0px',
             top: '0px',
             height: '0px',
             pointerEvents: 'none',
             zIndex: '20',
             background: 'linear-gradient(to bottom, rgba(17,24,39,1), rgba(17,24,39,0))'
           })
           wrapper.style.position = wrapper.style.position || 'relative'
           wrapper.insertBefore(mask, wrapper.firstChild)
         }
         if (overlap > 0) {
           mask.style.height = `${overlap}px`
           mask.style.display = ''
         } else {
           mask.style.height = '0px'
           mask.style.display = 'none'
         }
         // keep layout position unchanged
         wrapper.style.marginTop = '0px'
       } catch (e) {
         wrapper.style.marginTop = '0px'
       }
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
