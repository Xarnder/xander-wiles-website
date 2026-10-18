# Forest Drift multiplayer: joining and inviting

Current live setup · 18 October 2026

## Join from another device

1. On your Mac, open the private invite sheet: `/Users/xanderwiles/.config/forest-drift/Forest Drift Online.html`.
2. Copy the complete **owner** link for your own device. For another person, use **editor** (builder) or **viewer** (visitor).
3. Transfer that link privately to the other device, for example using AirDrop or a private message. Transfer the individual link, not the whole invite sheet, which contains owner access.
4. Open the link in the other device’s browser. Enter a display name, choose a colour, and press **Join**.
5. Wait for **Forest Drift Online**, a player count, and **Saved online**. These confirm you are in the shared world.

No Forest Drift, Cloudflare, or Vercel account is needed to join. Both devices need an internet connection, but they do not need to use the same Wi-Fi. Your Mac does not need to stay on: Cloudflare hosts the world.

You can also open [Forest Drift](https://www.xanderwiles.com/pages/Forest-Drift/), select **Join Online**, and paste the complete invite link.

**Do not copy just the address currently visible in the browser.** The game removes the secret invite portion from the address after reading it. The URL ending in `?mp=b2c19e1b-3992-47df-bdc6-af40307a8988` identifies the world but does not grant a new device access. A complete invite also contains `#invite=…`.

## Invite other people

Use the private invite sheet above to copy the appropriate link. In the game, click the world-name/player-count button to open the online panel; any invite links available to that browser appear there with **Copy** buttons.

| Link | What it allows |
| --- | --- |
| **Viewer / Visitor** | Explore and see other players and shared changes. Cannot build. |
| **Editor / Builder** | Explore, add objects, and change existing objects, including other builders’ work. Can delete their own additions. |
| **Owner** | Build, change and delete anyone’s objects; control shared sky, weather and time. Keep this link private. |

The server checks these permissions. Deletions affecting other people’s attached work can require confirmation.

Anyone holding a link can use its role, including someone it is forwarded to. Display names are labels, not verified accounts. Share builder links only with people you trust to change the world. Never share the admin secret or the production secrets file; neither is needed for joining.

A browser that joined using only the owner link may show only that link, rather than all three roles. Use the private invite sheet for the other roles in that case.

## What is shared and saved

- Up to **20 players** can join a world at once. You see other players move around.
- Building changes are sent to the server, checked, shared with connected players, and saved online. Changes accepted later can override earlier changes to the same property.
- **Forest Drift Online** is a separate published copy of Main World. Playing the default **Main World** offline does not join this session, and local edits do not automatically sync to the online copy.
- Shared time pauses when the room is empty. The owner controls the shared environment.
- Ambient creatures run locally, so their exact movement is not necessarily the same for everyone. Flight is disabled online.
- Internet interruptions trigger reconnection. Wait for **Saved online** before closing the game after building. A disconnected or pending-save message is not confirmation that your changes reached the server.

## Finding other players

The locator bar appears at the top of the screen when another player is in the online world.
Coloured dots show players in your viewing direction. The nearest player stays highlighted with
their name and distance; an arrow at the edge tells you which way to turn when they are off-screen.
Up/down arrows indicate a height difference. Away or reconnecting players appear dimmed.
The bar is hidden when you are alone. Turn it on or off in **Settings → Graphics → Show locator bar (online worlds)**.
Refresh the page after the 18 October locator deployment to load this feature.

## Pause menus: Multiplayer and Dev & Debug

**Pause → Multiplayer** lists the players currently joined, their connection status, role,
and permissions. It is a read-only roster; it does not change anyone’s role.

**Pause → Dev & Debug controls** opens a sidebar beside the game on desktop (a bottom panel
on smaller screens). Turn on **Example movement** to walk a figure of eight from your current
position and jump periodically. Other players see this through the normal multiplayer connection.
Manual movement, looking and building are disabled during the test. Normal collisions still
apply, so start in an open area. Closing the panel stops the test; click the game to resume
manual play. Keep the testing browser tab visible for reliable updates.

## Your identity on different devices

The browser remembers your player identity and world access locally. Another device, browser profile, or private-browsing session creates a separate identity, even if you enter the same name.

This matters for builders: using the same name on a new device does not make you the creator of objects built on the old device. Owner access can still manage those objects. Clearing browser data can remove remembered access and identity; keep your original invite somewhere private so you can rejoin.

## If joining does not work

| Symptom | What to do |
| --- | --- |
| Missing invite code | Copy the original complete invite from the invite sheet or the game’s Copy button. Do not use the cleaned address-bar URL. |
| You see the offline Main World | Leave it and use **Join Online**, or open the complete invite. |
| You cannot build | Check your role in the online panel. Ask for the builder link if you joined as a visitor. |
| Room is full | Wait for a place to become available; the current cap is 20 players. |
| Connecting or reconnecting persists | Check your connection, keep the tab active, then reopen the original invite if needed. Avoid closing while edits are still pending. |
| Different game/world version | Refresh the game. If it persists, ask the owner to check the published world and deployment versions. |
| Slow graphics | Reduce graphics quality in Settings and close other running game tabs. |
| Service unavailable after heavy usage | The Cloudflare Free quota may have been reached. Daily quotas reset at 00:00 UTC; other limits may require owner attention. |

Desktop keyboard/mouse play is the verified path. Automated multiplayer tests passed in Chromium, Firefox and WebKit. A real iPad/Safari playtest has not yet been completed, so touch-device behaviour is not fully verified.

## Costs, backups and current limits

Hosting currently uses **Cloudflare Workers Free**, with no paid subscription or payment method. Exceeding free quotas can interrupt multiplayer instead of generating overage charges. The owner’s budget is £10/month with a £15 absolute ceiling; paid upgrades are not part of this setup. The existing $10 email alert is a notification, not a spending cap.

Online persistence is not a substitute for backups. A validated manual backup is stored on the Mac at:

`/Users/xanderwiles/.config/forest-drift/backups/Forest Drift Online-2026-10-18.forestworld`

That backup is a snapshot from 18 October, not a continuously updated copy. Scheduled R2 backups are not enabled. The planned four-hour load test and real iPad test remain outstanding; a short 20-player transport test completed without disconnects.

This guide intentionally contains no secret invite tokens and can be shared. The private invite sheet and secrets files should remain private.
