# Publishing this archive to GitHub (so Google indexes it)

## 1. Create the repository
1. Go to <https://github.com/new>
2. Suggested name: `cheyenne-wy-city-council-2026-transcripts`
3. Suggested description: `Verbatim transcripts of every 2026 Cheyenne, Wyoming City Council, Finance Committee, Public Services Committee, Planning Commission and board meeting — searchable public record.`
4. Visibility: **Public** (required for Google indexing).
5. Do NOT initialize with a README (this folder already has one).
6. Click **Create repository**.

## 2. Push
From this folder:

```bash
git remote add origin https://github.com/<your-username>/cheyenne-wy-city-council-2026-transcripts.git
git branch -M main
git push -u origin main
```

(If prompted for credentials, use a Personal Access Token, not your password:
GitHub → Settings → Developer settings → Personal access tokens.)

## 3. Repository settings for discoverability
- **About** (gear icon, top right): add the description + topics:
  `cheyenne`, `wyoming`, `city-council`, `public-records`,
  `meeting-transcripts`, `open-government`, `data-center`, `transparency`
- Keep the repo **Public**. Google does not index private repos.

## 4. Get Google to index it fast
Google crawls new public repos automatically (usually days to a few weeks).
To accelerate:
1. Open [Google Search Console](https://search.google.com/search-console) (free,
   sign in with any Google account), add the repo URL as a URL-prefix property.
2. Use **URL Inspection** → paste the repo URL → **Request indexing**.
   Repeat for the README and 3–5 transcript pages.
3. Link to the repo from anywhere public (social post, blog, comment) — inbound
   links trigger crawling.
4. Verify with a `site:` search, e.g.
   `site:github.com/<your-username>/cheyenne-wy-city-council-2026-transcripts`
5. Keep adding new meetings monthly — recrawls follow fresh commits.

## 5. Optional: free browsable website (GitHub Pages)
1. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.
2. Your archive becomes browsable at `https://<your-username>.github.io/<repo>/`
   with one URL per transcript page — also indexed by Google.

## 6. Adding future meetings
1. Append the new video to `meetings.json` (same fields).
2. Refresh `cookies.txt` from your browser if expired.
3. Run `python3 scripts/fetch_transcripts.py` (only new entries download).
4. `git add -A && git commit -m "Add <date> <body>" && git push`.
