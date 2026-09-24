# Caden's Quest — marketing plan

Written September 2026. Revisit it after each phase in
[Suggested order](#suggested-order).

**Where things stand.** The game is free to play in the browser at
[cadensquest.com](https://cadensquest.com). It has three floors and a
content editor, and every run comes from a seed. PostHog records how runs
go. All the art is placeholder.

**The goal.** Build an audience big enough to pay for the art in
[ART_SPEC.md](ART_SPEC.md) and for a composer. That could come from a store
release, a crowdfunding campaign, or both. Everything here aims at that
audience. Because the game is already playable, every post can end with
"play it now".

**How to read this.** The ideas are in priority order. Each one says why it
suits this game, what it takes, what Claude can do, and what only you can
do. Claude can build and write almost all of it. Only you can post, send,
pay and own the accounts.

---

## The short version

1. **Make the game share itself:** a daily seed with a result people can
   paste into a chat.
2. **Go where players already are:** an itch.io page now, then short clips
   posted every week or two.
3. **Own your audience:** a mailing list, starting now.
4. **Steam once there's a cover image,** crowdfunding once the mailing list
   is big enough to fund the first days.
5. **Before each push, fix what the numbers say** first.

## The pitch

Use the same words on every channel. A draft:

> **A roguelike deckbuilder where every card is also a step.**
>
> Caden's Quest is a tactical deckbuilder on an isometric map. Every card
> in your hand is a choice: play it to fight, or throw it away for the
> steps to get where you need to be. Set the ground on fire and lure
> enemies through it, tame a wounded wolf to fight beside you, and fight
> down through three floors to the way out. Free to play in your browser.

Discarding to move is what sets it apart, so lead with it.

## Before a big push

A post can only bring players in; the first minute decides whether they
stay. Before any large push:

- **Teach the first minute.** There is no tutorial yet. The first floor
  should show discarding for movement, and the extra step it costs to
  walk away from an enemy, before a player loses to them.
- **Add juice and sound.** Clips are how small games get noticed, and a
  hit with no screen shake, damage number or sound makes a flat clip.
- **Fix the worst drop-off** the numbers show (see
  [idea 10](#10-numbers-that-say-what-to-fix-first)).

---

## The ideas

### 1. Daily Descent — one seed a day, and a result to share

**Why it fits.** Every map comes from one number, so everyone can play the
same three floors on the same day. A short result people paste into a chat
spreads without ads, the way Wordle's did. It also gives players a reason
to come back tomorrow.

**What it takes.**

- A seed made from the date, the same for everyone, changing at midnight UTC.
- A DAILY button beside NEW RUN, with one attempt a day, remembered in the
  browser.
- A result built from the run summary the game already records
  (`run_ended`): floors reached, turns, what killed Caden, and a link. Text
  to copy, plus an image to share from a phone.
- Challenge links for any run, not only the daily. `?seed=` already
  replays a map, so "beat my run" is just a link.
- A leaderboard, if wanted: a small Vercel function and a key-value store
  (for example Upstash Redis from Vercel's marketplace). Scores come from
  the player's browser, so they can be faked. Keep it for fun, with no
  prizes.

**Watch out.** A run is the seed *plus* the content files. If content
changes during the day, players before and after the change get different
dailies. Publish content changes at the daily rollover.

**Claude:** builds all of it. **You:** pick the name, play it, deploy.

### 2. Clips and a trailer, recorded from seeded runs

**Why it fits.** Short clips are how small games get noticed. Because a
seed replays a run exactly, a good moment can be set up and recorded again
until it looks right.

**What it takes.** A capture mode, driven through the dev handle
(`window.__game`) in headless Chrome and recorded to MP4 and GIF:

- a clean HUD
- a steady camera
- scripted card plays

Moments worth recording:

- enemies routed through fire
- an area burst
- a tamed wolf fighting at Caden's side
- a guardian falling and the portal opening

Do this after the juice pass.

**Claude:** builds the capture scripts, sets up and records the moments,
and puts together a rough 30–60 second trailer. **You:** choose the clips,
post them, and get trailer music (the composer, when there is one).

### 3. An itch.io page, now

**Why it fits.** It's free and built for browser games. Players there
expect unfinished games, try them and leave comments. Devlogs are built
in, and followers hear about each update. It gives people a second way in
besides cadensquest.com.

**What it takes.**

- A zip of a static build. itch.io serves each game from its own
  sub-folder, so asset paths must be relative; that's a build setting.
- Tags: roguelike, deckbuilder, tactical, turn-based, isometric, pixel art.
- Free, with optional pay-what-you-want. A trickle of money is also a
  signal of interest.
- Links to cadensquest.com and the mailing list.

**Claude:** makes the build, writes the page, chooses tags. **You:** create
the account and the page, and upload.

### 4. A mailing list and a press page

**Why it fits.** Social posts and algorithms come and go; a mailing list
is an audience you own. A crowdfunding campaign's first days depend on it.

**What it takes.**

- A signup form from a mailing-list service (Buttondown or Mailchimp, for
  example).
- The form on the end-of-run screen, where a player has just finished a
  run and is most likely to say yes.
- A small `/press` page on cadensquest.com: the pitch, a fact sheet,
  screenshots, clips, the logo and a contact address.

**Claude:** builds the page and the form into the app and writes the press
text. **You:** choose the service and own the account.

### 5. Devlogs from the git history

**Why it fits.** The history already reads like a devlog: burning and
healing ground, taming and summoning, area spells, floors and portals. A
post every week or two keeps followers interested and gives every channel
something new.

**Where.**

- the itch.io devlog
- the website
- Bluesky and X, with #ScreenshotSaturday
- r/roguelikedev's weekly Sharing Saturday thread

**Claude:** drafts each post from `git log` plus fresh screenshots and
clips, and writes player-facing patch notes. **You:** edit them into your
own voice and post them.

### 6. Where to post

| Place | Good for | Note |
|-------|----------|------|
| r/WebGames | A link people can play right away | The best fit: it runs in the browser |
| r/roguelites | Deckbuilder and roguelite players | Read the self-promotion rules first |
| r/roguelikes | Roguelike players | Stricter about what counts; a devlog goes down better than an ad |
| r/roguelikedev | Other roguelike developers | Sharing Saturday threads |
| r/indiegaming, r/IndieDev | Indie players and developers | Progress posts, clips |
| r/playmygame | Honest early feedback | Before the big pushes |
| Bluesky, X | Clips, #ScreenshotSaturday | Post regularly |
| TikTok, YouTube Shorts | Vertical clips | Claude can record at phone size |
| Discord servers | Roguelike and game-dev communities | Join and take part before posting |

The rule everywhere: post the game, not an ad, and reply to every comment.
Claude can check each community's rules before a post goes up.

### 7. Streamers and YouTubers

**Why it fits.** Deckbuilder runs are short and self-contained, which
suits streams. A seed also lets a streamer's viewers play the same run
afterwards: "play my seed".

**What it takes.**

- A list of creators who play similar games. Smaller channels are more
  likely to reply.
- A short personal email to each: a link, a clip, and a seed to try.
- Timing: after the juice pass and some real art, because first
  impressions count.

**Claude:** researches and builds the list and drafts each email. If you
authorise the Gmail connector in claude.ai, Claude can put the drafts
straight into your Gmail. **You:** send them and handle the replies.

### 8. A Steam page, once there's a cover image

**Why it fits.** Steam is where people buy games like this. Wishlists are
what count there: Steam emails everyone who wishlisted a game when it
releases, and uses wishlists when deciding what to show at launch. So the
page should go up months before release, collecting them.

**What it takes.**

- The Steam Direct fee: US$100 per game, paid back once the game has
  earned US$1,000.
- A Steamworks account, with identity, tax and bank details.
- The store images Steam asks for (the main one is called the *capsule*):
  a cover image in several sizes, plus screenshots and ideally a trailer.
  Placeholder art hurts here, so commission these first (row 6 of
  ART_SPEC's first table: store art gets its own brief).
- A desktop build: the web game wrapped with Electron or Tauri.
  Achievements can come later.
- A "Coming Soon" page, public for at least two weeks before release.
  That is Valve's minimum; months is better.
- Steam Next Fest, usually in February, June and October. It needs a
  demo, and registration closes weeks before each one.

**Claude:** makes the desktop build, writes the store text, researches tags
from similar games, writes the store-art brief, and puts together the
trailer. **You:** pay the fee, register, submit, and set the price.

### 9. Crowdfunding, once the list can carry it

**Why later.** Most of a campaign's backers usually come from the audience
the creator brings: the mailing list, the wishlists, the followers. Few
come from browsing Kickstarter. A campaign launched before that audience
exists risks failing in public.

**What it takes.**

- A budget built from the art spec's asset list, priced from real artist
  quotes, plus a composer's quote.
- Reward tiers. A tier that fits this game: backers design a card or an
  enemy with the content editor, credited in the game.
- Kickstarter's cut: 5%, plus payment processing of about 3–5%. Money is
  collected only if the goal is met.
- Alternatives that fund as you go: Steam Early Access, pay-what-you-want
  on itch.io, or Ko-fi or Patreon for devlog followers.

**Claude:** writes the budget table, page text, reward tiers, FAQ, video
script and update schedule. **You:** make the video (your face and voice
matter), launch it, and look after the backers.

### 10. Numbers that say what to fix first

**Why it matters.** Every channel sends people to the same first minute.
If they leave there, more traffic just means more people leaving.

**What's already recorded:**

- `run_started`, `row_reached`, `zone_entered`
- `card_played`, `card_discarded`, `card_collected`, `reward_skipped`
- `enemy_killed`, `player_died`, `run_won`
- `run_ended`, with the whole run's totals

**PostHog dashboards worth building:**

- **Where runs end:** the floor and row of `player_died`, and what did
  the killing.
- **How far players get:** how many runs reach floor 2, floor 3, and the
  way out.
- **Whether they come back** for another run.
- **Cards:** which get taken or skipped as rewards, and which get played
  or discarded. Cards that are always thrown away are dead weight.
- **Channels:** put a `?ref=` on every posted link and record it on
  `run_started`, so you can see which posts bring players who stay.

Keep development play out of the numbers: turn on
`NUXT_PUBLIC_POSTHOG_DEV` only while testing delivery.

**Claude:** adds the `ref` tagging and writes the queries. Given a PostHog
API key, it can pull the numbers and analyse them. **You:** own the
project and decide what to fix.

### Smaller ideas

- **Community cards.** Take card ideas from players, build the best with
  the editor, and credit the designer. It keeps people involved between
  updates.
- **A share image for every run,** not only the daily: how far Caden got,
  his deck, and what ended the run.
- **A logo and avatar,** from the store-art brief, used the same way
  everywhere.

---

## Suggested order

| When | What |
|------|------|
| **Now** (2–4 weeks) | PostHog dashboards, then fix the worst drop-off · Daily Descent · itch.io page · mailing-list signup at the end of a run · first devlog |
| **Next** (1–3 months) | Juice and sound · clips every week or two · press page · first art commission: the Steam images and Caden, the cheapest way to a presentable store page |
| **Then** | Steam "Coming Soon" page, desktop build, trailer · a Next Fest with a demo · streamer emails |
| **Later** | Kickstarter or Early Access, once the list and the wishlists can fund the first days |

## Who does what

| Claude can | Only you can |
|------------|--------------|
| **Build:** the daily seed, share results, capture mode, press page, signup form, desktop and itch.io builds, analytics tagging | **Own the accounts:** itch.io, Steamworks, the mailing list, social media, Kickstarter |
| **Write:** store pages, devlogs, patch notes, the press kit, emails, the Kickstarter page, art briefs | **Post, send and reply.** Your voice is the marketing. |
| **Research:** similar games, tags, communities and their rules, creators to contact | **Pay:** the Steam fee, the artist, the composer, any ads |
| **Analyse:** PostHog numbers (given access), balance from simulated runs | **Decide:** price, name, and when to launch |

Claude can't post, send email or run ads on its own. With the Gmail and
Google Drive connectors authorised in claude.ai, it can leave email drafts
in Gmail and files in Drive for you to use.
