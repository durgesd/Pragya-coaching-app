# Pragya Coaching — Homework App

Send homework/worksheets (photo, PDF, video, HTML, or any file) to a
whole class or specific students. Students get a real notification
and everything opens **inside the app** — nothing is a public,
shareable link.

**Important architecture note:** unlike a simple single-device tool,
this needs a small server running somewhere, because a teacher's
phone and a student's phone are different devices — there's no way
for one phone to hand data straight to another without something in
the middle. This app is that "something in the middle": a small
Node.js server + one shared database file, plus a Teacher app and a
Student app that both talk to it.

---

## 1. Install & run

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
cd pragya-coaching-app
npm install
```

**Create the teacher login** (you'll use this to log into the Teacher panel):
```bash
npm run setup:teacher
```
Follow the prompts to set a username and password.

**Generate push notification keys** (one-time):
```bash
npm run setup:vapid
```
Copy the two lines it prints into a `.env` file (copy `.env.example`
to `.env` first, then paste them in — also set `JWT_SECRET` per the
comment in that file).

**Start the server:**
```bash
npm start
```
- Teacher panel: `http://localhost:3000/teacher/`
- Student panel: `http://localhost:3000/student/`

## 2. Deploying so real phones can reach it

`localhost` only works on the same computer. For your teacher and
students to use this from their own phones, deploy it somewhere with
a public HTTPS address — **push notifications and the microphone-free
camera-free upload flow both require HTTPS** (except localhost).

Easy low-cost options that run a persistent Node process (needed here
— this is *not* a static site like GitHub Pages, which can't run a
server or store uploaded files):
- **Railway.app** or **Render.com** — connect your GitHub repo, they
  detect `npm start` automatically. Add your `.env` values in their
  dashboard's environment variables section.
- A small VPS (DigitalOcean/Hetzner) running Node directly, with
  [Caddy](https://caddyserver.com/) or nginx in front for free
  automatic HTTPS.

Wherever you deploy, the `server/data/` and `server/uploads/` folders
must persist across restarts/redeploys (use a persistent disk/volume
— check your host's docs) or you'll lose classes, students, and
homework whenever it restarts.

## 3. Using it

**Teacher panel:**
1. **Classes tab** — add a class (e.g. "Class 6"), then add students
   to it (name + roll number). Each student gets a random 4-digit PIN
   shown once — send it to them yourself (e.g. on WhatsApp): *"Class
   6, Roll 3, PIN 4821 — use this to log into [your app link]."*
2. **Send tab** — write a title, upload a photo/PDF/video/file (or
   paste HTML/text directly), choose a whole class or specific
   students, and tap Send. Students with notifications on get an
   alert immediately.
3. **History tab** — see who has actually opened each homework.

**Student panel:** log in with Class + Roll Number + PIN, tap
"Enable Notifications" once, and homework appears as cards — new ones
marked "New", tap to open right there in the app.

## 4. How "opens only in this app" actually works — and its honest limits

Every protection below is real and does meaningfully raise the bar
against casual copying/reselling of your material. **None of them,
and no website anywhere, can fully stop someone determined enough to
screenshot or screen-record their own phone** — that's a limit of
what any browser allows, not something this app failed to do. Please
set that expectation with yourself before relying on this for content
where a leak would be very costly.

What it actually does:
- **Files are never on a public URL.** Uploaded content lives in a
  private folder on the server. The app fetches a short-lived,
  single-use "ticket" (expires in 60 seconds) before it can load a
  file at all — a copied link stops working almost immediately and
  can't be reshared as a normal download link.
- **No download/save prompts.** Videos have their download button
  disabled; PDFs are drawn onto a canvas (an image), not shown in a
  normal PDF viewer with Print/Save built in; images are shown, not
  linked to a file.
- **A watermark with the student's name and roll number** is overlaid
  on every photo, video, and PDF page. It won't stop a screenshot,
  but it makes any leaked copy traceable back to whoever shared it —
  often the strongest real-world deterrent for a small coaching
  business.
- **Right-click and text selection are disabled** on the student
  side, which stops the most casual "save image as" / "select all,
  copy" attempts.
- One file type is an honest exception: files the app can't safely
  render itself (like `.docx` or `.pptx`) open in the phone's own
  viewer app, where none of the above protections apply — avoid using
  those formats for content you specifically don't want easily saved;
  export as PDF or an image instead.

## 5. Other things worth knowing

- **PINs, not passwords.** Student login is a 4-digit PIN — good
  enough to stop a random stranger, not meant to resist someone who
  already knows the student well enough to guess repeated tries
  (there's a lockout after 6 wrong attempts per device, per student,
  for 10 minutes).
- **One teacher account.** This is built for a single coaching
  centre with one teacher managing everything. Extending it to
  multiple teacher logins is possible later but isn't included here.
- **Storage grows over time.** Videos and PDFs use real disk space on
  your server — check your host's storage limits, and delete old
  homework from the History tab if space gets tight.
- **Backups**: the `server/data/` folder (classes, students, homework
  records) and `server/uploads/` folder (the actual files) are what
  matters — back up both regularly using your hosting provider's
  backup/snapshot feature, or by copying them somewhere safe
  periodically.
