# Wishlist: Phase 2 and later

Items deliberately kept out of the trial (v0.1). Started 2026-10-31.

## Product
- **Visual dashboard:** pipeline and stats in a proper UI instead of Excel. Natural bridge to the exec10x platform: the plugin is the entry product, the platform the upgrade.
- **Auto-posting and real scheduling:** publish approved posts to LinkedIn on a set date. Needs an API or automation (n8n/Make), so revisit once the voice is proven.
- **More channels:** beyond LinkedIn, based on what the user asks for at intake.
- **More message types:** emails, letters, newsletters, board updates, team announcements, using the voice already built for posts.
- **Automatic LinkedIn stats:** personal-profile impressions aren't available through any API; the trial relies on manual entry or reading through Chrome.

## Business
- **White-glove setup:** a 30-minute deep setup session run by Dana or Susan as part of a paid package.
- **Coaching layer (optional):** let Dana or Susan see the client's pipeline as proof of value and for coaching. The trial keeps it private to the user.

## Reviewed: Eden's content-agent flow (2026-10-31)
His flow: profile → connections (Metricool + Apify) → research (what works + 10 ideas) → writing (one idea, every network) → video (cuts, captions, motion) → publish and measure, with the numbers feeding back into research.
- **Adopted in the trial:** the stats feed back into `/launch:plan-week`, and there's an idea bank of about 10.
- **Metricool:** the preferred Phase 2 route to auto-posting, scheduling and automatic stats across networks, cleaner than n8n/Make. Kept out of the trial because it adds an account and setup time, and it posts on the user's behalf.
- **Apify:** not planned. It scrapes LinkedIn (against LinkedIn's terms), needs an API key and paid usage, and breaks the "no external services" security story.
- **One idea → every network, and video:** Phase 2, together with more channels.
