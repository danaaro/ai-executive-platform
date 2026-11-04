# Welcome email for onboarded Launch users

> STATUS: 🟢 ready. A Gmail draft template is saved in Dana's Gmail ("Your Exec10X Launch digital team is ready"). Replace [First name], add the recipient, then send.

**Download link (unlisted, never put it on a page):** https://www.exec10x.ai/get/launch-8bghb8ag5ew5/exec10x-launch.zip
**Publishing a new version:** `exec10x-site/push-launch.sh`. It rebuilds the zip from `products/launch/plugin/launch`, keeps the same link, deploys and verifies. Existing users re-upload the new zip.
**Privacy of the link:** not linked from any page, no sitemap, `/get/` returns 404, and every file under `/get/` is served `noindex`. Anyone who has the link can download it; to revoke, change TOKEN in push-launch.sh, delete the old folder, and push.

Subject: Your Exec10X Launch digital team is ready

Hi [First name],

Welcome to Exec10X Launch. Your digital team starts with a communications partner: it learns your role and the way you write, plans your week on LinkedIn, and drafts posts that sound like you. It only drafts. You decide what goes out and when.

Getting started takes about 7 minutes:
1. Download your plugin: (link above)
2. Open the Claude desktop app. In the left sidebar click Customize, then Plugins. Click Add and upload the file you just downloaded.
3. Go to Settings › Capabilities and turn on "Code execution and file creation". Launch uses it to keep your content tracker.
4. Start a new task and type: /launch:setup

Have your LinkedIn profile link and company website handy. You'll finish setup with your first post drafted. Anytime, type /launch:commands to see everything it can do.

What you need: the Claude desktop app on a paid plan (Pro or higher). Optional: the Claude in Chrome extension.

Your files stay in a folder on your computer, and nothing is posted without you. The download link is just for you, so please don't forward it.

Dana, Exec10X
