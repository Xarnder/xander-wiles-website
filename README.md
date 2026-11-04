# xander-wiles-website

## New laptop setup

Install Git and Node.js 22 (the version in `.nvmrc`). With nvm already installed:

```bash
git clone https://github.com/Xarnder/xander-wiles-website.git
cd xander-wiles-website
nvm install
nvm use
npm ci
cp .env.example .env.local
```

Restore your existing `.env.local` securely from the old laptop, or fill in the template before building. Do not overwrite a restored file with the template. See [the transfer checklist](docs/new-laptop-setup.md) for other files and browser data to move.

```bash
npm run dev       # source static pages + local API routes, http://localhost:3000
# Or build and preview the complete site:
npm run build     # installs and builds the nested apps; allow several minutes
npm run preview   # http://localhost:3000
```

The static preview does not run `/api/*` serverless functions. Individual Vite/SvelteKit apps have their own installs and dev servers. See [local development](docs/local-development.md) for commands and authentication configuration.
