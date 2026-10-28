import anime from 'animejs'
import { onUnmounted } from 'vue'

const MOTION_SELECTORS = ['.sentinel-kpi-card', '.sentinel-panel', '.sentinel-alert-row', '.sentinel-radar-pulse', '.topology-packet-dot']

export function useSentinelMotion() {
  const activeInstances: anime.AnimeInstance[] = []

  function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function resetStaticStyles(selectors: string[]) {
    if (typeof document === 'undefined') return
    document.querySelectorAll<HTMLElement | SVGElement>(selectors.join(', ')).forEach((node) => {
      node.style.opacity = '1'
      node.style.transform = 'none'
    })
  }

  function animateTopologyPackets() {
    if (typeof document === 'undefined') return
    const targets = ['.topology-packet-dot']
    anime.remove(targets)
    if (prefersReducedMotion()) {
      resetStaticStyles(targets)
      return
    }
    const packetDots = document.querySelectorAll('.topology-packet-dot')
    if (!packetDots.length) return
    activeInstances.push(
      anime({
        targets: packetDots,
        opacity: [0.35, 1],
        r: [3, 5.2],
        duration: 950,
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutSine',
        delay: anime.stagger(220)
      })
    )
  }

  function animateDashboardEntrance() {
    if (typeof document === 'undefined') return
    const targets = ['.sentinel-kpi-card', '.sentinel-panel']
    anime.remove(targets)
    if (prefersReducedMotion()) {
      resetStaticStyles(targets)
      animateTopologyPackets()
      return
    }
    const elements = document.querySelectorAll(targets.join(', '))
    if (elements.length) {
      activeInstances.push(
        anime({
          targets: elements,
          translateY: [12, 0],
          opacity: [0, 1],
          duration: 420,
          easing: 'easeOutExpo',
          delay: anime.stagger(65)
        })
      )
    }
    animateTopologyPackets()
  }

  function animateScenarioPulse() {
    if (typeof document === 'undefined') return
    const targets = ['.sentinel-alert-row', '.sentinel-radar-pulse']
    anime.remove(targets)
    if (prefersReducedMotion()) {
      resetStaticStyles(targets)
      return
    }
    const alertRows = document.querySelectorAll('.sentinel-alert-row')
    if (alertRows.length) {
      activeInstances.push(
        anime({
          targets: alertRows,
          translateX: [-6, 0],
          opacity: [0.45, 1],
          duration: 340,
          easing: 'easeOutQuad',
          delay: anime.stagger(40)
        })
      )
    }
    const radarNodes = document.querySelectorAll('.sentinel-radar-pulse')
    if (radarNodes.length) {
      activeInstances.push(
        anime({
          targets: radarNodes,
          scale: [0.96, 1.03, 1],
          opacity: [0.65, 1],
          duration: 460,
          easing: 'easeOutSine'
        })
      )
    }
  }

  function cleanupMotion() {
    while (activeInstances.length > 0) {
      activeInstances.pop()?.pause()
    }
    if (typeof document !== 'undefined') {
      anime.remove(MOTION_SELECTORS)
    }
  }

  onUnmounted(cleanupMotion)

  return {
    animateDashboardEntrance,
    animateScenarioPulse,
    animateTopologyPackets,
    cleanupMotion
  }
}
