# Atelier Sareno — Website

Production-ready static website. No build step, no dependencies, no framework.
Open `index.html` in a browser and the whole site works.

## Pages

| File | URL | Purpose |
|---|---|---|
| `index.html` | `/` | Homepage — hero, service strip, booking CTA |
| `services.html` | `/services.html` | Fabric houses, service list with prices |
| `about.html` | `/about.html` | Heritage, contact details |
| `appointment.html` | `/appointment.html` | Booking form with date/time picker |
| `404.html` | — | Not-found page (auto-used by Vercel/Netlify/GitHub Pages) |

`index.html` sits at the root of this folder. That is what fixes the previous 404 —
the host now finds a homepage immediately.

## File structure

```
.
├── index.html
├── services.html
├── about.html
├── appointment.html
├── 404.html
├── favicon.svg
├── robots.txt
├── vercel.json
├── README.md
└── assets/
    ├── css/styles.css
    ├── js/main.js
    └── img/
        ├── hero-poster.jpg
        ├── home-fitting.jpg
        ├── appointment-hero.webp
        ├── about-atelier.webp
        ├── service-suits.webp
        ├── service-shirts.webp
        ├── service-tuxedo.webp
        ├── service-alterations.webp
        └── service-outerwear.webp
```

Every path in the HTML is relative (`assets/...`) on every page, including
`404.html`, so the site works from the domain root, a subfolder, a custom domain,
or `file://` alike.

## Deploy

### Vercel
1. Push this folder to a GitHub repository (see below).
2. In Vercel: **Add New → Project → Import** your repo.
3. Framework preset: **Other**. Build command: *(leave empty)*. Output directory: *(leave empty)*.
4. Deploy. A minimal `vercel.json` is included; no build step runs.

If you upload this folder *inside* another folder in your repo, set Vercel's
**Root Directory** to that folder.

### GitHub
1. Go to <https://github.com/new> and create an empty repository.
2. On the new repo page click **"uploading an existing file."**
3. Unzip this package first, then drag the **contents** of the folder
   (`index.html`, `assets/`, etc.) into the upload area — not the `.zip` itself,
   and not the enclosing folder.
4. Commit.

### Netlify / Cloudflare Pages / any static host
Drop this folder in. Publish directory is the folder root. No build command.

## Editing content

- **Text and prices** — edit directly in the `.html` files.
- **Photos** — replace files in `assets/img/` keeping the same filenames, or point
  the `src` at a new file. Recommended widths: hero 1600px, service thumbs 600px.
- **Colors and type** — CSS custom properties at the top of `assets/css/styles.css`
  (`--cream`, `--panel`, `--ink`, `--brass`).
- **Hero background video** — put an MP4 at `assets/video/hero.mp4`, then in
  `index.html` delete the hero `<img>` and uncomment the `<video>` block directly
  below it. Keep the file under ~5 MB and muted for autoplay to work.

## Appointment form — important

The form validates name, email, phone, date and time before it will submit, then
shows a confirmation with an **Add to Google Calendar** button. That button adds the
appointment to the *customer's* calendar via a Google Calendar template URL — it
works with no server.

**The form does not yet send you anything.** There is no backend, so no email
arrives and nothing is written to your own calendar. To make that happen, a
developer needs to add a server endpoint. The hook is already marked in
`assets/js/main.js` (search for `Hook for a real backend`):

```js
fetch("/api/appointments", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, email, phone, service, place, start, end, notes })
});
```

Simple options for that endpoint:
- **Vercel Serverless Function** (`/api/appointments.js`) + Google Calendar API
  service account + an email service such as Resend, Postmark or SendGrid.
- **Formspree / Basin / Netlify Forms** — email-only, no calendar, no code.
- **Calendly / Cal.com embed** — replaces the custom picker entirely and handles
  calendar sync and reminders for you.

## Fonts

Loaded from Google Fonts (Cormorant Garamond, Jost, JetBrains Mono) with
`preconnect` and `display=swap`. Local fallbacks are declared in the CSS font
stacks, so text stays readable if the CDN is blocked. To self-host, download the
families into `assets/fonts/`, add `@font-face` rules at the top of `styles.css`,
and remove the two Google `<link>` tags from each page.

## Contact details in the markup

Email `info@ateliersareno.com`, phone `+1 (631) 223-8775`,
address `734 Walt Whitman Road, Melville, NY 11747`.
Update these in `about.html`, `appointment.html`, and in `STUDIO_ADDRESS` at the
top of `assets/js/main.js`.

## Checked before release

- `index.html` opens correctly as the homepage from the folder root.
- Every `src` and `href` resolves to a file that exists in this package.
- All internal navigation links work in both directions across all four pages.
- Booking form: rejects blank or invalid name / email / phone, blocks past dates,
  requires a date and a time, then renders the confirmation summary and a working
  Google Calendar link.
- Image `width`/`height` attributes match each file's real pixel dimensions.
- Responsive down to 375px, with a mobile nav menu.
- No console errors, no external dependencies beyond Google Fonts.
