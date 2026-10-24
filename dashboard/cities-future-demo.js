const story = document.querySelector('.city-story')
const steps = [...document.querySelectorAll('.story-step')]
const copies = [...document.querySelectorAll('.story-copy')]
const backdrop = document.querySelector('.city-backdrop')
const progress = document.querySelector('.story-progress span')
const counter = document.querySelector('.story-counter b')

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function updateStory() {
  if (!story) return

  const bounds = story.getBoundingClientRect()
  const scrollable = Math.max(story.offsetHeight - window.innerHeight, 1)
  const travelled = clamp(-bounds.top, 0, scrollable)
  const normalized = travelled / scrollable
  const sceneFloat = normalized * (steps.length - 1)
  const scene = Math.round(sceneFloat)

  copies.forEach((copy, index) => {
    const distance = Math.abs(sceneFloat - index)
    copy.classList.toggle('is-active', index === scene)
    copy.style.setProperty('--scene-distance', distance.toFixed(3))
  })

  backdrop?.style.setProperty('--scroll-progress', normalized.toFixed(3))
  progress?.style.setProperty('transform', `scaleY(${normalized})`)
  if (counter) counter.textContent = String(scene + 1).padStart(2, '0')
}

let ticking = false
function requestUpdate() {
  if (ticking) return
  ticking = true
  window.requestAnimationFrame(() => {
    updateStory()
    ticking = false
  })
}

window.addEventListener('scroll', requestUpdate, { passive: true })
window.addEventListener('resize', requestUpdate)
updateStory()
