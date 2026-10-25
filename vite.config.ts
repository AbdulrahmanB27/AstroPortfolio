import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// Base path is injected by the GitHub Pages workflow: "/" when public/CNAME exists (the
// custom domain, abdulrahmanbahjat.com), "/<repo>/" for a project site. Locally it stays
// "/" so `vite dev` and `vite preview` behave like the root of a domain.
const base = process.env.VITE_BASE_PATH ?? '/';
// Vite only warns about a malformed base and then ships a broken dist. The case that
// actually happened: Git Bash on Windows rewrites a lone "/" argument into the Git
// install path, so `VITE_BASE_PATH=/ npm run build` produced `/Program Files/Git/assets/…`
// in every entry. Refuse instead of warning (set the variable from PowerShell, or prefix
// the command with MSYS_NO_PATHCONV=1, or simply omit it — the default is "/").
if (!base.startsWith('/') || !base.endsWith('/')) {
  throw new Error(`VITE_BASE_PATH must look like "/" or "/repo/", got "${base}"`);
}

/**
 * Fills the `%TOKEN%`s in index.html from the content file.
 *
 * The social card, the structured data and the no-JavaScript fallback all repeat facts the
 * content studio edits — the email, the site URL, the resume path. Written into the HTML by
 * hand they would go stale the first time the owner changed one in the studio; read from the
 * JSON at build time they cannot. Escaped for an HTML attribute or text node, and the JSON-LD
 * is serialised rather than templated so a quote in a name cannot break it.
 */
function portfolioHtml(): Plugin {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return {
    name: 'portfolio-html',
    transformIndexHtml(html) {
      const data = JSON.parse(readFileSync(`${root}src/data/portfolio.json`, 'utf8'));
      const { profile, resume, meta } = data;
      const siteUrl = String(meta.url).replace(/\/?$/, '/');
      const person = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: profile.name,
        url: siteUrl,
        description: profile.tagline,
        email: `mailto:${profile.contact.email}`,
        alumniOf: profile.education.map((e: { institution: string }) => ({ '@type': 'EducationalOrganization', name: e.institution })),
        knowsAbout: profile.interests,
        sameAs: [profile.contact.github, profile.contact.linkedin].filter(Boolean),
      };
      const tokens: Record<string, string> = {
        SITE_URL: escape(siteUrl),
        PROFILE_NAME: escape(profile.name),
        PROFILE_TAGLINE: escape(profile.tagline),
        RESUME_FILE: escape(resume.file),
        CONTACT_EMAIL: escape(profile.contact.email),
        CONTACT_GITHUB: escape(profile.contact.github),
        // `<` is the only character that can end a script element from inside JSON.
        PERSON_JSON_LD: JSON.stringify(person).replace(/</g, '\\u003c'),
      };
      return html.replace(/%([A-Z_]+)%/g, (whole, key: string) => tokens[key] ?? whole);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), portfolioHtml()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // Multi-page build: the portfolio and the owner-only admin studio are separate
    // HTML entries so `/admin/` resolves as a real directory index on static hosting.
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        admin: `${root}admin/index.html`,
        // The simplified portfolio. A separate entry so it never pulls in three: it exists
        // to be fast and to work where WebGL does not.
        lite: `${root}lite/index.html`,
      },
      output: {
        /*
         * Function form, not the object form. React has to land in its own chunk or the
         * simplified entry reaches it through the r3f chunk and drags the whole renderer in
         * behind it — the one thing /lite/ exists to avoid. The object form declared a
         * `react` chunk that came out empty, because r3f had already claimed those modules;
         * matching on the resolved path is unambiguous.
         *
         * Order matters: `@react-three/*` lives under node_modules/@react-three, so it is
         * tested before the plain `react` prefix.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          const path = id.replace(/\\/g, '/');
          if (path.includes('/node_modules/postprocessing/')) return 'postfx';
          if (path.includes('/node_modules/@react-three/postprocessing/')) return 'postfx';
          if (path.includes('/node_modules/@react-three/')) return 'r3f';
          if (path.includes('/node_modules/three/')) return 'three';
          if (
            path.includes('/node_modules/react/') ||
            path.includes('/node_modules/react-dom/') ||
            path.includes('/node_modules/scheduler/')
          ) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  // Honour a harness-assigned PORT; fall back to the fixed ports the capture and e2e
  // scripts target when nothing assigns one.
  server: process.env.PORT
    ? { port: Number(process.env.PORT) }
    : { port: 5173, strictPort: true },
  preview: process.env.PORT
    ? { port: Number(process.env.PORT) }
    : { port: 4173, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
