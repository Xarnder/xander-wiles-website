# Setting up Cloudflare for Forest Drift multiplayer — the beginner's guide

**What this does:** puts the multiplayer server (the "room" your friends connect to) on the internet,
so people can play together from their own homes, on any device.

**Time:** about 20–30 minutes, once.
**Cost:** £0 to start. No payment card is needed for any of steps 1–12.
**You need:** this Mac, a web browser, and an email address you can check.

> **Why you have to do some of this yourself:** Claude can't create accounts, type passwords, accept
> terms, or enter payment details. Those steps are marked **🙋 You**. Everything marked **🤖 Claude can
> do this** you can hand over by saying, for example, "do step 8 for me".

---

## What you're building

```
Friends' browsers ──(internet)──► Cloudflare: forest-drift-mp.<your-name>.workers.dev
                                     └─ one "room" per online world (a Durable Object)
The game itself stays on Vercel, exactly as now.
```

- **Cloudflare Workers** run the server code (`pages/Forest-Drift/server`).
- **Durable Objects** are where each online world lives: one per world, with its own small database.
- **workers.dev** is a free web address Cloudflare gives you, so you don't need a domain.

---

## Step 1 — Create your Cloudflare account 🙋 You

1. Go to **<https://dash.cloudflare.com/sign-up>**.
2. Enter your email and choose a strong password. A password manager is ideal.
3. Tick the terms box (read them; this is your decision) and click **Sign up**.
4. Open the email from Cloudflare and click the **verify** link.
5. If it asks "What would you like to do?" or offers to add a website, **skip it**. You don't need a
   domain.

✅ **Check:** you can see the Cloudflare dashboard, with your email in the top-right corner.

## Step 2 — Turn on two-step login (strongly recommended) 🙋 You

1. Click the person icon (top right) → **My Profile** → **Authentication**.
2. Under **Two-Factor Authentication**, click **Set up** and follow the steps with an authenticator
   app (for example Apple Passwords, 1Password or Google Authenticator).
3. Save the backup codes somewhere safe.

Why: anyone who gets into this account could delete your worlds or run up a bill.

## Step 3 — Choose your workers.dev name 🙋 You

1. In the left sidebar, open **Compute (Workers)** → **Workers & Pages**. On some accounts it's just
   called **Workers & Pages**.
2. If it asks you to **choose a subdomain**, type a short name, for example `xander`, and confirm.
   - Your server's address will become `https://forest-drift-mp.<that-name>.workers.dev`.
   - Players see this address, so keep it friendly.
3. If it doesn't ask now, that's fine: step 8 will ask instead.

## Step 4 — Open Terminal in the server folder 🙋 You (or 🤖 Claude can do this)

1. Open **Terminal** (press ⌘ Space, type "Terminal", press Return).
2. Copy and paste this, then press Return:

   ```bash
   cd ~/Documents/Work/Code/Web_Apps/xander-wiles-website/pages/Forest-Drift/server && npm install
   ```

✅ **Check:** it finishes without red "ERR!" lines. Yellow "warn" lines are fine.

## Step 5 — Connect this Mac to your Cloudflare account 🙋 You

1. In the same Terminal, run:

   ```bash
   npx wrangler login
   ```

2. Your browser opens a Cloudflare page asking to **Allow Wrangler** access to your account. Read
   it, then click **Allow**. This is the one approval Claude can't give for you.
3. Back in Terminal you'll see "Successfully logged in".

✅ **Check:**

```bash
npx wrangler whoami
```

This prints your email and account name. From here on, Claude can run the remaining commands for
you, because they use this login.

## Step 6 — Tell the server where the game lives 🤖 Claude can do this

The server only accepts connections from the website the game is played on (plus your own Mac, for
testing).

1. Open the live game in your browser and look at the address bar. The part before
   `/pages/Forest-Drift`, for example `https://xanderwiles.com`, is the **origin**.
2. Open `pages/Forest-Drift/server/wrangler.jsonc` and check the `ALLOWED_ORIGINS` line. It
   currently says:

   ```jsonc
   "ALLOWED_ORIGINS": "https://xanderwiles.com,https://www.xanderwiles.com"
   ```

   If your origin is different (for example a `….vercel.app` address), replace it, keeping the
   format: no slash at the end, and commas between addresses.

## Step 7 — Make your admin key 🙋 You

The admin key is the password for **publishing** worlds online (decision Q2-A: only you can do that).
It must be new; don't reuse the one in `server/.dev.vars`, which is only for testing on this Mac.

1. Make a long random key:

   ```bash
   openssl rand -base64 32
   ```

2. Copy what it prints and **save it in your password manager** as "Forest Drift admin key". You'll
   paste it into the game whenever you publish a world.

## Step 8 — Put the server online 🤖 Claude can do this

```bash
npm run deploy
```

- If it asks to **register a workers.dev subdomain**, type the name you chose in step 3 and press
  Return.
- At the end it prints your address, for example:

  ```
  https://forest-drift-mp.xander.workers.dev
  ```

  Copy it; you'll need it in steps 10–11.

## Step 9 — Give the server your admin key 🙋 You

```bash
npx wrangler secret put ADMIN_SECRET
```

When it says **Enter a secret value**, paste the key from step 7 (nothing shows as you paste; that's
normal) and press Return. Cloudflare stores it encrypted; nobody, including you, can read it back.

✅ **Check:** open `https://forest-drift-mp.<your-name>.workers.dev/health` in your browser. You
should see `{"ok":true}`.

- If you get a "523" error straight after the first deploy, wait a minute and refresh.

## Step 10 — Point the game at the server 🤖 Claude can do this

Tell Claude: _"My server address is https://forest-drift-mp.….workers.dev — connect the game to it."_
Claude will:

1. Put the address in `DEPLOYED_SERVER_URL` in `pages/Forest-Drift/src/lib/game/net/mpConfig.ts`.
2. Run the checks, then commit and push when you say so. Vercel rebuilds the site automatically.

**To try it before redeploying the site**, open the live game once with the server added to the
address. The browser remembers it:

```
https://<your site>/pages/Forest-Drift/?mpServer=https://forest-drift-mp.<your-name>.workers.dev
```

✅ **Check:** the Worlds screen now shows a **Join Online** button.

## Step 11 — Publish your first online world 🙋 You

1. On the Worlds screen, open a world's **…** menu → **Publish Online…**.
2. Paste your admin key (step 7). Tick "Remember" only on your own computer.
3. You get three links:
   - **Builder link:** friends who should build with you.
   - **Visitor link:** people who can look around but not build.
   - **Owner link:** keep this one to yourself. It can change the sky, weather and time.
4. Click **Join now**, pick a name and a colour, and you're in. Your links stay under
   **Worlds → Online Worlds → Invite links**.
5. Send a builder link to a friend, or open it on the iPad, and check you can see each other move.

> Everything anyone builds in the online world is shared live and saved on the server. Builders
> can change anything, but only whoever added something (or you, the owner) can remove it.

## Step 12 — Costs, and a budget alert 🙋 You

**Free plan (where you start):**

| What                                    | Free allowance                                                |
| --------------------------------------- | ------------------------------------------------------------- |
| Requests (incoming messages count 20:1) | 100,000 a day, reset at midnight UTC (1 am UK time in summer) |
| Room "awake" time                       | 13,000 GB-seconds a day (about 29 hours of one room)          |
| Storage                                 | 5 GB in total (a world is a few hundred KB)                   |

What that means in play: a player who is walking uses about half a request a second; standing
still uses almost nothing. So on the free plan:

- **Four people** playing together can go for about **14 hours a day**.
- **Twenty people** all moving non-stop use the day's allowance in about **2¾ hours**.

If an allowance runs out, new connections fail until it resets. Nothing is lost.

**Paid plan (decision Q22-A): only in months with big sessions.**

1. Before a big session (10 or more people, or several hours), go to **Workers & Pages → Plans**
   (or **Manage Account → Billing**) and choose **Workers Paid** ($5 a month, about £4). This needs
   a payment card, which only you can add.
2. **Budget alert (decision Q26):** **Manage Account → Billing → Billable Usage → Create budget
   alert**. Set **$10** (about £8), with your email as recipient. Cloudflare may already have added
   a $10 alert for you. An alert is only an email: it doesn't stop anything, and it arrives the day
   after the threshold is crossed.
3. After the busy month, you can switch back to Free under the same **Plans** page.

---

## Everyday jobs (🤖 Claude can do all of these)

| Job                        | Command (run in `pages/Forest-Drift/server`)                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Put new server code online | `npm run deploy` (not during a session: everyone gets disconnected for a moment, then reconnects) |
| Watch live server logs     | `npx wrangler tail`                                                                               |
| Change the admin key       | `npx wrangler secret put ADMIN_SECRET`                                                            |
| Check who's logged in      | `npx wrangler whoami`                                                                             |

You can also see requests, errors and logs in the dashboard: **Workers & Pages → forest-drift-mp**.

## If something goes wrong

| You see                                             | What it means → what to do                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| "Couldn't reach the multiplayer server"             | Wrong or misspelt address → check step 10, then open `/health` (step 9).                         |
| "Origin not allowed" / players can't connect at all | The site address isn't in `ALLOWED_ORIGINS` → step 6, then step 8 again.                         |
| "Publishing is not configured on this server."      | The admin key secret is missing → step 9.                                                        |
| "That admin key is not right."                      | Typo, or the key from `.dev.vars` → use the step 7 key, or set a new one with step 9.            |
| "This invite link isn't valid…"                     | An old or mistyped link → send the link again from **Online Worlds → Invite links**.             |
| "Please refresh the game to update it."             | That player has an old copy of the game open → they refresh the page.                            |
| 523 error right after the first deploy              | Normal for a minute or two → wait, then refresh.                                                 |
| Errors late in a long day of play                   | The free daily allowance ran out → it resets at midnight UTC; go Paid for busy months (step 12). |

## What's still to come

- **Your safety net, already there:** on the Worlds screen, under **Online Worlds**, your world has
  **Save a copy** (the live online world into My Worlds) and **Restore…** (go back to an earlier
  version, kept hourly for two days and daily for 30 days).
- **Weekly backups to R2 (Q27-A):** added in a later phase, with its own short guide.
- **First real-internet test:** once step 11 works, Claude measures the timings over the internet
  and on the iPad, and confirms the free-plan usage against the dashboard.
