# Video Share

**One-line summary**: Simple video sharing site for Jason's son to upload and share videos with friends.

## The Idea
A minimal, dark-mode video site hosted at `share.rhodesjason.com`. Son can upload videos with a name, friends can browse an index and watch individual videos via share links.

## Goals / Why This
- Easy for a kid to use
- No third-party platform (YouTube, etc.)
- Private-ish — upload behind a password, viewing is open
- Clean, simple dark mode UI

## Decisions Made
- URL: `share.rhodesjason.com`
- Auth: password-protected upload, open viewing
- Index page listing all videos + individual video URLs
- Hosted on DO droplet alongside other apps
- Videos stored on droplet filesystem (50GB disk, plenty for personal use)
- Stack: Node.js/Express backend, plain HTML/CSS/JS frontend (no framework needed)

## Open Questions
- Password approach: simple hardcoded password env var, or something fancier? (hardcoded is fine for this)
- Video URL format: /watch/:slug or /watch/:id ?
- Max upload size? nginx has a default 1MB limit — need to raise it for video
- What happens when disk fills up? (probably fine to ignore for now)

## App Structure
```
/
├── index.html          — lists all videos
├── watch/:slug         — individual video player page
├── upload              — password-protected upload form (or /admin)
└── /videos/*           — served video files
```

## Tech Stack
- Node.js + Express
- Multer for file uploads
- Videos stored at /var/www/video-share/uploads/
- Metadata stored in a simple JSON file or SQLite
- Plain HTML/CSS — dark mode, minimal

## Hosting
- Port: 3002
- nginx: share.rhodesjason.com → localhost:3002
- SSL via Certbot

## Next Steps
- [ ] Build the app
- [ ] Set up nginx config + SSL on droplet
- [ ] Deploy and test upload flow
- [ ] Share URL with son

## Notes & Context
- Initial session: 2026-03-01
- Keep it simple — this is a kid's project, not a product
