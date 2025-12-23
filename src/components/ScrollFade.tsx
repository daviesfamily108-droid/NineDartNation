import React, {
  PropsWithChildren,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type ScrollFadeProps = PropsWithChildren<{
  className?: string;
  style?: CSSProperties;
}>;

export default function ScrollFade({
  children,
  className,
  style,
}: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [maskHeight, setMaskHeight] = useState(0);

  // Use CSS-based mask with GPU acceleration instead of DOM manipulation
  useEffect(() => {
    let raf = 0;
    let lastMaskHeight = 0;

    const updateMask = () => {
      const header = document.getElementById("ndn-header");
      if (!header) {
        if (lastMaskHeight !== 0) {
          lastMaskHeight = 0;
          setMaskHeight(0);
        }
        return;
      }
      const scroller = document.getElementById("ndn-main-scroll");
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY || 0;
      const headerH = header.getBoundingClientRect().height;
      const newMaskHeight = scrollTop > 0 ? headerH : 0;

      // Only update state if mask height changed significantly
      if (Math.abs(newMaskHeight - lastMaskHeight) > 1) {
        lastMaskHeight = newMaskHeight;
        setMaskHeight(newMaskHeight);
      }
    };

    updateMask();

    const onScrollOrResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateMask);
    };

    const scroller = document.getElementById("ndn-main-scroll");
    scroller?.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    return () => {
      scroller?.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        position: "relative",
        willChange: "transform",
        transform: "translateZ(0)", // Force GPU layer
      }}
    >
      {maskHeight > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: maskHeight,
            pointerEvents: "none",
            zIndex: 20,
            background:
              "linear-gradient(to bottom, rgba(17,24,39,1), rgba(17,24,39,0))",
            willChange: "height",
            transform: "translateZ(0)",
          }}
        />
      )}
      {children}
    </div>
  );
}
