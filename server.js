require('dotenv').config()
const express = require('express')
const session = require('express-session')
const multer = require('multer')
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const app = express()
const PORT = process.env.PORT || 3002
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || 'changeme'
const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme-secret'
const UPLOADS_DIR = path.join(__dirname, 'uploads')

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const db = new Database(path.join(__dirname, 'share.db'))
db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    status TEXT DEFAULT 'ready',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)
try { db.exec(`ALTER TABLE uploads ADD COLUMN status TEXT DEFAULT 'ready'`) } catch {}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 7) + ext)
  }
})
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } })

app.use(express.urlencoded({ extended: true }))
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}))
app.use('/files', express.static(UPLOADS_DIR))

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next()
  res.redirect('/admin')
}

function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'file'
  return base + '-' + Math.random().toString(36).slice(2, 7)
}

function getFileType(mimetype) {
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype === 'application/pdf') return 'pdf'
  return 'download'
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function transcodeToMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ])
    ff.stderr.on('data', () => {})
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
  })
}

const typeIcons = { video: '🎬', audio: '🎵', pdf: '📄', download: '📎' }

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f0f; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }
  a { color: #7c9cf8; text-decoration: none; }
  a:hover { text-decoration: underline; }
  header { padding: 1.25rem 2rem; border-bottom: 1px solid #1e1e1e; display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 1.25rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
  header h1 a { color: inherit; }
  main { max-width: 960px; margin: 0 auto; padding: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
  .card { background: #1a1a1a; border-radius: 10px; overflow: hidden; border: 1px solid #222; transition: border-color 0.15s; display: block; }
  .card:hover { border-color: #444; text-decoration: none; }
  .card-thumb { aspect-ratio: 16/9; background: #111; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
  .card-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .card-thumb .icon { font-size: 2.25rem; }
  .card-thumb .pending-badge { position: absolute; bottom: 6px; right: 6px; background: #333; color: #aaa; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; }
  .card-body { padding: 0.75rem; }
  .card-name { font-weight: 500; font-size: 0.875rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-meta { font-size: 0.75rem; color: #555; margin-top: 0.2rem; }
  .empty { text-align: center; padding: 5rem 2rem; color: #444; }
  .empty p { margin-bottom: 1rem; }
  .container { max-width: 820px; margin: 2rem auto; padding: 0 2rem; }
  .container h2 { font-size: 1.4rem; font-weight: 700; color: #fff; margin-bottom: 1.5rem; letter-spacing: -0.02em; }
  .player { background: #000; border-radius: 10px; overflow: hidden; }
  .player video { width: 100%; display: block; }
  .player img { width: 100%; display: block; max-height: 82vh; object-fit: contain; background: #111; }
  .player audio { width: 100%; display: block; padding: 1.25rem; background: #1a1a1a; }
  .player embed { width: 100%; height: 82vh; display: block; }
  .download-wrap { padding: 3rem 2rem; text-align: center; background: #1a1a1a; border-radius: 10px; }
  .download-link { display: inline-block; background: #7c9cf8; color: #0f0f0f; padding: 0.7rem 1.5rem; border-radius: 8px; font-weight: 600; }
  .file-meta { color: #555; font-size: 0.8rem; margin-top: 0.75rem; }
  .share-row { display: flex; gap: 0.5rem; margin-top: 1.25rem; align-items: center; }
  .share-url { flex: 1; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; padding: 0.5rem 0.75rem; color: #aaa; font-size: 0.8rem; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .copy-btn { background: #222; border: 1px solid #333; color: #ccc; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; white-space: nowrap; }
  .copy-btn:hover { background: #2a2a2a; }
  .processing-wrap { background: #1a1a1a; border-radius: 10px; padding: 4rem 2rem; text-align: center; border: 1px solid #222; }
  .spinner { width: 36px; height: 36px; border: 3px solid #333; border-top-color: #7c9cf8; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .processing-wrap p { color: #666; font-size: 0.9rem; }
  .processing-wrap .sub { font-size: 0.78rem; color: #444; margin-top: 0.4rem; }
  .error-wrap { background: #1f1010; border: 1px solid #5a2020; border-radius: 10px; padding: 2rem; text-align: center; color: #f08080; }
  form { background: #1a1a1a; border-radius: 10px; padding: 2rem; border: 1px solid #222; }
  label { display: block; margin-bottom: 0.35rem; font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  input[type=text], input[type=password] { width: 100%; padding: 0.6rem 0.75rem; background: #111; border: 1px solid #2a2a2a; border-radius: 6px; color: #e0e0e0; font-size: 0.9rem; margin-bottom: 1.25rem; }
  input[type=file] { width: 100%; padding: 0.5rem 0; color: #aaa; font-size: 0.875rem; margin-bottom: 1.25rem; }
  input:focus { outline: none; border-color: #7c9cf8; }
  button[type=submit] { background: #7c9cf8; color: #0f0f0f; padding: 0.6rem 1.5rem; border: none; border-radius: 6px; font-weight: 700; font-size: 0.875rem; cursor: pointer; transition: opacity 0.15s; }
  button[type=submit]:hover:not(:disabled) { background: #9bb3fa; }
  button[type=submit]:disabled { opacity: 0.5; cursor: not-allowed; }
  .progress-wrap { margin-top: 1.25rem; display: none; }
  .progress-wrap.visible { display: block; }
  .progress-bar-track { background: #111; border-radius: 6px; height: 6px; overflow: hidden; margin-bottom: 0.5rem; }
  .progress-bar-fill { height: 100%; background: #7c9cf8; border-radius: 6px; width: 0%; transition: width 0.15s; }
  .progress-label { font-size: 0.78rem; color: #555; }
  .error { background: #1f1010; border: 1px solid #5a2020; color: #f08080; padding: 0.7rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-size: 0.875rem; }
  .hint { font-size: 0.775rem; color: #444; margin-top: 1.25rem; }
  .admin-grid { display: grid; gap: 0.5rem; margin-top: 2rem; }
  .admin-row { background: #1a1a1a; border: 1px solid #222; border-radius: 8px; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 1rem; }
  .admin-row-thumb { width: 60px; height: 40px; background: #111; border-radius: 4px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
  .admin-row-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .admin-row-info { flex: 1; min-width: 0; }
  .admin-row-name { font-weight: 500; font-size: 0.875rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .admin-row-meta { font-size: 0.75rem; color: #555; margin-top: 0.15rem; }
  .delete-btn { background: transparent; border: 1px solid #5a2020; color: #f08080; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.78rem; cursor: pointer; flex-shrink: 0; }
  .delete-btn:hover { background: #2a1010; }
  .admin-section { margin-bottom: 2.5rem; }
  .admin-section h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 1rem; }
  .admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .logout-btn { background: transparent; border: 1px solid #333; color: #666; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.78rem; cursor: pointer; }
  .logout-btn:hover { border-color: #555; color: #aaa; }
`

const layout = (title, body, extraHead = '', isAdmin = false) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${css}</style>
  ${extraHead}
</head>
<body>
  <header>
    <h1><a href="/">share</a></h1>
    ${isAdmin ? '<a href="/admin" style="font-size:0.8rem;color:#555">admin</a>' : ''}
  </header>
  ${body}
</body>
</html>`

// Index
app.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM uploads ORDER BY created_at DESC').all()
  if (items.length === 0) {
    return res.send(layout('share', `
      <main><div class="empty"><p>Nothing shared yet.</p></div></main>
    `, '', req.session.authenticated))
  }
  const cards = items.map(item => {
    const type = getFileType(item.mimetype)
    const pending = item.status === 'pending'
    const thumb = type === 'image'
      ? `<img src="/files/${item.filename}" alt="${item.name}" loading="lazy">`
      : `<span class="icon">${typeIcons[type]}</span>`
    return `
      <a href="/watch/${item.slug}" class="card">
        <div class="card-thumb">
          ${thumb}
          ${pending ? '<span class="pending-badge">processing</span>' : ''}
        </div>
        <div class="card-body">
          <div class="card-name">${item.name}</div>
          <div class="card-meta">${formatSize(item.size)}</div>
        </div>
      </a>`
  }).join('')
  res.send(layout('share', `<main><div class="grid">${cards}</div></main>`, '', req.session.authenticated))
})

// Admin — login form or dashboard
app.get('/admin', (req, res) => {
  if (!req.session.authenticated) {
    return res.send(layout('admin — share', `
      <main>
        <div class="container">
          <h2>sign in</h2>
          <form method="POST" action="/admin/login">
            <label>password</label>
            <input type="password" name="password" required autofocus>
            <button type="submit">sign in</button>
          </form>
        </div>
      </main>
    `))
  }

  const items = db.prepare('SELECT * FROM uploads ORDER BY created_at DESC').all()

  const rows = items.length === 0
    ? '<p style="color:#555;font-size:0.875rem">No uploads yet.</p>'
    : items.map(item => {
        const type = getFileType(item.mimetype)
        const thumb = type === 'image'
          ? `<img src="/files/${item.filename}" alt="">`
          : typeIcons[type]
        const statusLabel = item.status !== 'ready' ? ` · ${item.status}` : ''
        return `
          <div class="admin-row">
            <div class="admin-row-thumb">${thumb}</div>
            <div class="admin-row-info">
              <div class="admin-row-name"><a href="/watch/${item.slug}">${item.name}</a></div>
              <div class="admin-row-meta">${formatSize(item.size)} · ${new Date(item.created_at).toLocaleDateString()}${statusLabel}</div>
            </div>
            <form method="POST" action="/admin/delete/${item.slug}" onsubmit="return confirm('Delete \\'${item.name.replace(/'/g, "\\'")}\\' permanently?')">
              <button type="submit" class="delete-btn">delete</button>
            </form>
          </div>`
      }).join('')

  res.send(layout('admin — share', `
    <main>
      <div class="container">
        <div class="admin-header">
          <h2>admin</h2>
          <form method="POST" action="/admin/logout">
            <button type="submit" class="logout-btn">sign out</button>
          </form>
        </div>

        <div class="admin-section">
          <h3>upload a file</h3>
          <form id="upload-form" method="POST" action="/upload" enctype="multipart/form-data">
            <label>name</label>
            <input type="text" name="name" placeholder="my cool video" required autofocus>
            <label>file</label>
            <input type="file" name="file" id="file-input" required>
            <button type="submit" id="submit-btn">upload</button>
            <div class="progress-wrap" id="progress-wrap">
              <div class="progress-bar-track"><div class="progress-bar-fill" id="progress-bar"></div></div>
              <div class="progress-label" id="progress-label">uploading...</div>
            </div>
          </form>
          <p class="hint">max 500 MB · videos are automatically converted to MP4</p>
        </div>

        <div class="admin-section">
          <h3>${items.length} upload${items.length !== 1 ? 's' : ''}</h3>
          <div class="admin-grid">${rows}</div>
        </div>
      </div>
    </main>
    <script>
      const form = document.getElementById('upload-form')
      const btn = document.getElementById('submit-btn')
      const progressWrap = document.getElementById('progress-wrap')
      const progressBar = document.getElementById('progress-bar')
      const progressLabel = document.getElementById('progress-label')

      form.addEventListener('submit', function(e) {
        e.preventDefault()
        const data = new FormData(form)
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', function(e) {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            progressBar.style.width = pct + '%'
            progressLabel.textContent = 'uploading... ' + pct + '%'
          }
        })

        xhr.addEventListener('load', function() {
          if (xhr.responseURL) window.location.href = xhr.responseURL
        })

        xhr.addEventListener('error', function() {
          btn.disabled = false
          btn.textContent = 'upload'
          progressWrap.classList.remove('visible')
          alert('upload failed, please try again')
        })

        btn.disabled = true
        btn.textContent = 'uploading...'
        progressWrap.classList.add('visible')
        xhr.open('POST', '/upload')
        xhr.send(data)
      })
    </script>
  `))
})

// Admin login
app.post('/admin/login', (req, res) => {
  if (req.body.password === UPLOAD_PASSWORD) {
    req.session.authenticated = true
    res.redirect('/admin')
  } else {
    res.send(layout('admin — share', `
      <main>
        <div class="container">
          <h2>sign in</h2>
          <div class="error">wrong password</div>
          <form method="POST" action="/admin/login">
            <label>password</label>
            <input type="password" name="password" required autofocus>
            <button type="submit">sign in</button>
          </form>
        </div>
      </main>
    `))
  }
})

// Admin logout
app.post('/admin/logout', (req, res) => {
  req.session.destroy()
  res.redirect('/')
})

// Delete upload
app.post('/admin/delete/:slug', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM uploads WHERE slug = ?').get(req.params.slug)
  if (!item) return res.redirect('/admin')
  try { fs.unlinkSync(path.join(UPLOADS_DIR, item.filename)) } catch {}
  db.prepare('DELETE FROM uploads WHERE slug = ?').run(req.params.slug)
  res.redirect('/admin')
})

// Handle upload
app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('no file uploaded')

  const slug = slugify(req.body.name || 'file')
  const isVideo = req.file.mimetype.startsWith('video/')
  const status = isVideo ? 'pending' : 'ready'

  db.prepare('INSERT INTO uploads (name, slug, filename, mimetype, size, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.body.name, slug, req.file.filename, req.file.mimetype, req.file.size, status)

  if (isVideo) {
    const mp4Filename = req.file.filename.replace(/\.[^.]+$/, '') + '.mp4'
    const mp4Path = path.join(UPLOADS_DIR, mp4Filename)
    transcodeToMp4(req.file.path, mp4Path)
      .then(() => {
        try { fs.unlinkSync(req.file.path) } catch {}
        db.prepare('UPDATE uploads SET filename=?, mimetype=?, size=?, status=? WHERE slug=?')
          .run(mp4Filename, 'video/mp4', fs.statSync(mp4Path).size, 'ready', slug)
        console.log(`transcoded: ${slug}`)
      })
      .catch(err => {
        console.error(`transcode failed for ${slug}:`, err)
        db.prepare('UPDATE uploads SET status=? WHERE slug=?').run('error', slug)
      })
  }

  res.redirect(`/watch/${slug}`)
})

// Watch page
app.get('/watch/:slug', (req, res) => {
  const item = db.prepare('SELECT * FROM uploads WHERE slug = ?').get(req.params.slug)
  if (!item) return res.status(404).send(layout('not found — share', `
    <main><div class="empty"><p>file not found</p></div></main>
  `, '', req.session.authenticated))

  const shareUrl = `https://share.rhodesjason.com/watch/${item.slug}`

  if (item.status === 'pending') {
    return res.send(layout(`${item.name} — share`, `
      <div class="container">
        <h2>${item.name}</h2>
        <div class="processing-wrap">
          <div class="spinner"></div>
          <p>converting video...</p>
          <p class="sub">this page will refresh automatically</p>
        </div>
      </div>
    `, `<meta http-equiv="refresh" content="4">`, req.session.authenticated))
  }

  if (item.status === 'error') {
    return res.send(layout(`${item.name} — share`, `
      <div class="container">
        <h2>${item.name}</h2>
        <div class="error-wrap">
          <p>conversion failed — <a href="/files/${item.filename}" download>download original</a></p>
        </div>
      </div>
    `, '', req.session.authenticated))
  }

  const type = getFileType(item.mimetype)
  const fileUrl = `/files/${item.filename}`
  let player

  if (type === 'video') {
    player = `<div class="player"><video controls playsinline preload="metadata"><source src="${fileUrl}" type="${item.mimetype}">your browser doesn't support video</video></div>`
  } else if (type === 'image') {
    player = `<div class="player"><img src="${fileUrl}" alt="${item.name}"></div>`
  } else if (type === 'audio') {
    player = `<div class="player"><audio controls><source src="${fileUrl}" type="${item.mimetype}"></audio></div>`
  } else if (type === 'pdf') {
    player = `<div class="player"><embed src="${fileUrl}" type="application/pdf"></div>`
  } else {
    player = `<div class="download-wrap"><a href="${fileUrl}" download class="download-link">download ${item.name}</a></div>`
  }

  res.send(layout(`${item.name} — share`, `
    <div class="container">
      <h2>${item.name}</h2>
      ${player}
      <p class="file-meta">${formatSize(item.size)} · ${new Date(item.created_at).toLocaleDateString()}</p>
      <div class="share-row">
        <div class="share-url">${shareUrl}</div>
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>{this.textContent='copied!';setTimeout(()=>this.textContent='copy link',1500)})">copy link</button>
      </div>
    </div>
  `, '', req.session.authenticated))
})

app.listen(PORT, () => console.log(`share running on port ${PORT}`))
