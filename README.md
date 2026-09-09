# AstroPortfolio

Interactive space portfolio for **Abdulrahman Bahjat**. One continuous 3D universe:

1. **Home planet** — astronaut, rocket, and the menu under an enormous star.
2. **Rocket cockpit** — About, Skills, Resume (visual + PDF), Contact on the mission computer.
3. **Launch** — the rocket climbs, the planet falls away, the solar system is revealed.
4. **Solar system** — every planet is a project; select one to dock an orbital probe and read
   the project display. Click the star (or "Home planet") to fly home.

Built with Vite, React 19, TypeScript, three.js / React Three Fiber, GSAP, zustand and zod.
No backend: all content lives in `src/data/portfolio.json` and is edited with the static
content studio at `/admin/`.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173 (add ?nointro to skip the intro, ?dev=true for the dev overlay)
npm test             # unit tests (layout math, content schema)
npm run test:e2e     # Playwright end-to-end checks
npm run build        # production build → dist/ (portfolio + dist/admin/)
npm run pages:check  # simulate GitHub Pages hosting under /AstroPortfolio/
npm run build:resume # regenerate public/resume/Abdulrahman-Bahjat-Resume.pdf from the content file
npm run perf:check   # frame timing per state and device profile
npm run capture      # screenshots of every state into captures/
```

## Edit content

Open `/admin/` (locally: `http://localhost:5173/admin/`). It loads the current content,
validates every change, and exports a new `portfolio.json`. Replace
`src/data/portfolio.json`, run `npm test`, commit. See `docs/ADMIN.md` and
`.claude/skills/portfolio-content-model/SKILL.md`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which runs the tests, builds with the
right base path and publishes to GitHub Pages. One-time setup: create the repository, add it
as `origin`, push `main`, then set Settings → Pages → Source to "GitHub Actions". The base
path resolves itself — `/<repo>/` normally, or `/` if you add a `public/CNAME`. Details in
`docs/DEPLOY.md`.

## What was built, and what it cost

`docs/BUILD_REPORT.md` — everything that is in here, how each number was verified, which
content is still a placeholder, and the compromises the work rests on.

## Easter eggs

They exist. They never interfere with normal use. Look at the sky from the home planet,
try a modifier key when you launch, and type a certain five-letter word while in orbit.

## Docs

- `docs/SPEC.md` — the product specification (source of truth)
- `docs/ART_DIRECTION.md` — palette, scale, lighting, motion contract
- `tasks/todo.md`, `tasks/lessons.md` — plan, status, and lessons learned
- `CLAUDE.md` — agent guide for working in this repo
