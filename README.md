[README.md](https://github.com/user-attachments/files/31468634/README.md)
# Neon-Dodge# 🕹️ Neon Dodge

A fast-paced browser dodging game built with plain HTML, CSS, and JavaScript — no frameworks, no game engine, no dependencies. Control a glowing orb, survive an endless stream of falling neon enemies, and chase your high score.

**▶ [Play it live](https://crockycodes.github.io/Neon-Dodge)** 

---

## Features

- **Endless dodging gameplay** — enemies fall from the top, move left/right to survive
- **Rising difficulty** — the game gradually speeds up the longer you last
- **Particle effects & screen shake** on crash for extra impact
- **Ambient background music**, generated live in-browser with the Web Audio API — no audio files needed
- **Local high score tracking**, saved between sessions with `localStorage`
- **Fully responsive** — scales to fit any screen size
- **Mobile support** — drag to move, tap to restart
- **Retro synthwave landing page** with an animated grid horizon

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | ← / → arrow keys | Drag anywhere on the game |
| Restart after crash | SPACE | Tap anywhere |
| Toggle music | Click the music button in the nav | Same |

## Tech stack

- HTML5
- CSS3 (custom properties, `transform`, `@keyframes`, media queries for responsive/touch behavior)
- Vanilla JavaScript (no libraries) — game loop via `requestAnimationFrame`, sound and music via the Web Audio API

## Running it locally

No build step or install required — it's just static files.

1. Clone the repo:
   ```bash
   git clone https://github.com/crockycodes/neon-dodge.git
   ```
2. Open `index.html` in your browser, or serve it with a tool like VS Code's Live Server extension.

## Project structure

```
neon-dodge/
├── index.html   # page structure — landing section + game
├── style.css    # all styling, animations, responsive rules
└── game.js      # game logic — movement, collisions, sound, music, difficulty
```

## Credits

Built by [Saurav](https://github.com/crockycodes) — first solo game project, built while learning to code.
