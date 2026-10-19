# Zen Visuals website

The one-page site for zenvisuals.co.uk: films, photos, reviews, pricing and an enquiry form.

- **Hosting:** Netlify (free plan). It rebuilds the site automatically whenever something changes.
- **Editing:** Pages CMS (free). You log in, change text, prices, photos, films and reviews, and press Save.
- **Enquiries:** the form uses Netlify Forms. Each enquiry is emailed to you.
- **No website builder and no monthly fee** apart from your domain name.

---

## One-time setup (about 30 minutes)

### 1. Put the site on GitHub
GitHub is where the site's files live. Pages CMS and Netlify both read from it.

1. Create a free account at **github.com**.
2. Click **+ → New repository**, name it `zenvisuals-site`, set it to **Private**, and click **Create repository**.
3. On the next screen, click **uploading an existing file**. Drag in everything from this folder, including the `.pages.yml` file. On a Mac, press Cmd+Shift+. in Finder to show hidden files. Then click **Commit changes**.
   - GitHub's web uploader takes 100 files at a time. If it complains, upload the `media` folder in a second go.

### 2. Host it on Netlify
1. Sign up at **netlify.com** with your GitHub account.
2. Choose **Add new site → Import an existing project → GitHub**, then pick `zenvisuals-site`.
3. The settings fill in by themselves (build command `node build.mjs`, publish folder `dist`). Click **Deploy**.
4. After about a minute you'll get a link like `zenvisuals.netlify.app`. Check it looks right.

### 3. Turn on the enquiry form
1. In Netlify, open the site and go to **Forms**, then click **Enable form detection**.
2. Redeploy once: **Deploys → Trigger deploy → Deploy site**.
3. Go to **Forms → Form notifications → Add notification → Email notification**, choose the `enquiry` form, and enter the email address that should get enquiries.
4. Send yourself a test enquiry from the live site.

### 4. Point zenvisuals.co.uk at the new site
1. In Netlify, go to **Domain management → Add a domain**, enter `zenvisuals.co.uk`, and add `www.zenvisuals.co.uk` too.
2. Netlify shows you the DNS records to set.
3. Set those records wherever the domain is registered:
   - **Registered through Wix:** go to Wix → **Domains → Manage DNS records**, and replace the A record and the `www` CNAME with Netlify's. Or transfer the domain away from Wix.
   - **Registered elsewhere** (123-reg, GoDaddy, IONOS and so on): change the records there.
4. Within a few hours Netlify adds the padlock (HTTPS) automatically.
5. Only cancel the Wix plan once the new site is showing on zenvisuals.co.uk. If the domain is registered with Wix, keep the domain itself.

### 5. Set up the editing dashboard
1. Go to **app.pagescms.org** and sign in with GitHub.
2. Allow it access to the `zenvisuals-site` repository.
3. You'll see **Films, Photos, Reviews** and **Page text & prices**. Edit anything and press **Save**. The live site updates about a minute later.
4. To let Zuzia edit too, add her GitHub account under the repository's **Settings → Collaborators**.

---

## Everyday editing

| To… | Go to… |
|---|---|
| Change a price | **Page text & prices → Pricing → Wedding packages** |
| Add a new film | **Films → Add an entry**: upload the MP4 and a cover image, and choose Wedding or Commercial |
| Make a film the big featured one | Tick **featured** on that film and untick it on the old one |
| Add photos | **Photos → Add an entry**: upload, describe, and pick a section and size |
| Add a review | **Reviews → Add an entry** |
| Update the Google rating line | **Page text & prices → Big review quote → Rating line** |
| Add Instagram later | **Page text & prices → Social links → Instagram** |

**Photo sizes in the grid:**
- `normal`: a standard tile
- `tall`: a taller tile
- `wide`: two tiles wide
- `full`: the full width of the page

Upload photos at about **2000 pixels** on the long edge (JPG).

**Films:** keep each MP4 under about **20MB** so it uploads and plays smoothly. In HandBrake (free), the **"Web → Vimeo YouTube 720p30"** preset with quality around RF 26 does this. Lower that number for better quality and bigger files, or raise it for smaller files.

---

## For developers

- **Text and media:** content is in `content/*.json`, and media is in `media/`.
- **Building:** `node build.mjs` creates `dist/`. It needs no dependencies, just Node 18 or later.
- **Page code:** markup is in `build.mjs`, styles in `src/styles.css`, and behaviour (film player, lightbox, form) in `src/main.js`.
