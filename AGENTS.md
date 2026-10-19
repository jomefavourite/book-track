<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->

## Sitemap

Whenever you add, rename or remove a page route, update `lib/siteMap.ts`. It feeds both the human-readable `/sitemap` page and `sitemap.xml`. Mark pages that need sign-in with `requiresSignIn` so they stay out of `sitemap.xml`.

## UI verification

When making UI changes, check both light mode and dark mode before considering the work complete.
