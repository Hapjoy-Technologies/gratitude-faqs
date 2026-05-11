# FAQ Lambdas — AWS Console Setup Guide

Two Node.js 20 Lambdas back the FAQ site. They share one S3 bucket.

- `get-faqs/` — public, returns the FAQ JSON from S3.
- `put-faqs/` — password-gated, writes the FAQ JSON and uploads images.

Everything below is done in the AWS Console. Pick a region first (e.g. `us-east-1`) and stay in it for **all** of these steps — Lambdas can only see resources in the same region.

---

## Step 1 — Create the S3 bucket

1. Open the **S3** service in the AWS Console.
2. Click **Create bucket**.
3. **Bucket name**: pick something unique, e.g. `gratitude-faqs-content`. Note it down — you'll reuse it below.
4. **Region**: pick your chosen region.
5. Under **Object Ownership**, leave **ACLs disabled** (default).
6. Under **Block Public Access settings for this bucket**:
   - **Uncheck** the master "Block all public access" checkbox.
   - Confirm the warning by ticking the acknowledgement box at the bottom.
   - (We're allowing public access only for image files via a bucket policy. The FAQ JSON stays private.)
7. Under **Bucket Versioning**, select **Enable**. This gives you free rollback history for every save.
8. Leave the rest as default and click **Create bucket**.

### Add the bucket policy (make `articles/*` publicly readable)

1. Open the bucket you just created.
2. Go to the **Permissions** tab.
3. Scroll to **Bucket policy** and click **Edit**.
4. Paste the following, replacing `YOUR_BUCKET_NAME`:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublicReadArticles",
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/articles/*"
     }]
   }
   ```
5. Click **Save changes**. Only files under the `articles/` prefix are now publicly readable; `faqs.json` itself stays private.

---

## Step 2 — Seed the bucket with current content

The repo already contains the migrated content at `data/faqs.json` and existing images under `images/articles/`.

### Upload `faqs.json`

1. Inside the bucket, click **Upload**.
2. Click **Add files** and select `data/faqs.json` from this repo.
3. Click **Upload**. The object should appear at the bucket root as `faqs.json`.

### Upload existing article images

1. Back at the bucket root, click **Create folder**, name it `articles`, and click **Create folder**.
2. Open the new `articles/` folder.
3. Click **Upload** → **Add files**, select everything inside `images/articles/` from this repo.
4. Click **Upload**.

> If you ever need to start fresh, you can re-run `node scripts/export-seed.mjs` locally to regenerate `data/faqs.json` from `data/faqs.js`, then re-upload.

---

## Step 3 — Create the IAM role for the Lambdas

Both Lambdas share one role with permission to read/write only this bucket.

1. Open **IAM** → **Roles** → **Create role**.
2. **Trusted entity type**: AWS service. **Use case**: **Lambda**. Click **Next**.
3. On the permissions screen, search and tick **AWSLambdaBasicExecutionRole** (lets the Lambda write logs to CloudWatch). Click **Next**.
4. **Role name**: `gratitude-faqs-lambda`. Click **Create role**.

Now add S3 access as an inline policy:

1. Open the role you just created.
2. Go to the **Permissions** tab → **Add permissions** → **Create inline policy**.
3. Switch to the **JSON** tab and paste, replacing `YOUR_BUCKET_NAME`:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:GetObject", "s3:PutObject"],
       "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
     }]
   }
   ```
4. Click **Next**. Name the policy `s3-faqs-access`. Click **Create policy**.

---

## Step 4 — Package the Lambda code

Lambda Function URLs run zipped code. You need to create one zip per Lambda **with its `node_modules` included** (so `@aws-sdk/client-s3` is available at runtime).

On your local machine, in this repo:

1. Open a terminal at the repo root.
2. Run these commands once to install dependencies and create the zips:
   ```bash
   cd lambdas/get-faqs && npm install && zip -r ../get-faqs.zip . && cd ../..
   cd lambdas/put-faqs && npm install && zip -r ../put-faqs.zip . && cd ../..
   ```
3. You'll now have `lambdas/get-faqs.zip` and `lambdas/put-faqs.zip` — these are the files you'll upload to AWS.

> If you ever update the Lambda code, repeat this step before re-uploading.

---

## Step 5 — Create the `get-faqs` Lambda (public read)

1. Open **Lambda** → **Create function**.
2. Choose **Author from scratch**.
3. **Function name**: `gratitude-faq-get`.
4. **Runtime**: **Node.js 20.x**.
5. **Architecture**: x86_64 (default is fine).
6. Expand **Change default execution role** → choose **Use an existing role** → select `gratitude-faqs-lambda`.
7. Click **Create function**.

### Upload the code

1. On the function page, scroll to the **Code** section.
2. Click **Upload from** → **.zip file** → select `lambdas/get-faqs.zip` → **Save**.

### Set the environment variables

1. Go to the **Configuration** tab → **Environment variables** → **Edit**.
2. Add:
   - Key: `BUCKET_NAME` — Value: your bucket name (e.g. `gratitude-faqs-content`).
3. Click **Save**.

### Bump timeout (optional but recommended)

1. **Configuration** tab → **General configuration** → **Edit**.
2. Set **Timeout** to `10 sec`. Click **Save**.

### Enable a Function URL

1. **Configuration** tab → **Function URL** → **Create function URL**.
2. **Auth type**: **NONE** (this endpoint is public).
3. Expand **Additional settings** → **Configure cross-origin resource sharing (CORS)** → tick it on, and set:
   - **Allow origin**: `*`
   - **Allow headers**: `Content-Type`
   - **Allow methods**: `GET`, `OPTIONS`
   - **Max age**: `300`
4. Click **Save**.
5. **Copy the Function URL** that appears — you'll paste it into `js/config.js` later as `getFaqsUrl`.

---

## Step 6 — Create the `put-faqs` Lambda (password-gated writes)

First pick a strong shared password. Anyone who knows it can edit the live site, so treat it like a deploy key. Generate one in a terminal:
```
openssl rand -base64 24
```
Save it in a password manager.

### Create the function

1. **Lambda** → **Create function**.
2. **Author from scratch**, name `gratitude-faq-put`, **Runtime: Node.js 20.x**.
3. Under **Change default execution role** → **Use an existing role** → `gratitude-faqs-lambda`.
4. **Create function**.

### Upload the code

1. **Code** section → **Upload from** → **.zip file** → `lambdas/put-faqs.zip` → **Save**.

### Set the environment variables

1. **Configuration** → **Environment variables** → **Edit** → add:
   - `BUCKET_NAME` — your bucket name.
   - `EDITOR_PASSWORD` — the password you just generated.
   - `PUBLIC_BASE_URL` — `https://YOUR_BUCKET_NAME.s3.amazonaws.com` (used to build URLs for uploaded images).
2. **Save**.

### Bump timeout + memory

1. **Configuration** → **General configuration** → **Edit**.
2. **Timeout**: `15 sec`. **Memory**: `256 MB` (image base64 decoding needs a bit more headroom).
3. **Save**.

### Enable a Function URL

1. **Configuration** → **Function URL** → **Create function URL**.
2. **Auth type**: **NONE**. (The Lambda code itself rejects requests without the correct password header — Function URL auth would force IAM signing, which we don't want for a browser.)
3. CORS settings:
   - **Allow origin**: `*` (or restrict to your editor's URL once you know it, e.g. `https://gratefulness.me`).
   - **Allow headers**: `Content-Type`, `x-editor-password`
   - **Allow methods**: `POST`, `OPTIONS`
   - **Max age**: `300`
4. **Save**.
5. **Copy the Function URL** — you'll paste it into `js/config.js` as `putFaqsUrl`.

---

## Step 7 — Configure the frontend

Open `js/config.js` in this repo and replace the three placeholder values:

- `getFaqsUrl` — the `get-faqs` Function URL from Step 5.
- `putFaqsUrl` — the `put-faqs` Function URL from Step 6.
- `imagesBaseUrl` — `https://YOUR_BUCKET_NAME.s3.amazonaws.com/articles/`.

Commit and redeploy the static site.

---

## Step 8 — Verify everything works

### A. Public read works

1. Open the `get-faqs` Function URL directly in a browser. You should see the FAQ JSON.
2. Open `index.html` (served from your static host or `python3 -m http.server` locally). The page should render exactly like before — the data is coming from S3 via the Lambda now.

### B. Editor login works

1. Open `editor.html` in a browser.
2. Enter the password from Step 6. It should unlock and show the categories.
3. Enter a wrong password — it should reject.

### C. Editing works end-to-end

1. In the editor, click a category, click a question, edit the answer in the WYSIWYG.
2. Click **Save changes**. Status indicator should turn green.
3. Open `index.html` in a new tab, hard-refresh (Cmd/Ctrl + Shift + R). Your edit should appear.

### D. Image upload works

1. In the WYSIWYG, click the image icon in the toolbar.
2. Pick a PNG/JPG (≤ 5 MB). When prompted for alt text, type a description.
3. The image should upload and appear inline.
4. Save. Confirm on the public site that the image renders.

### E. Rollback works

1. Edit something and save twice.
2. In S3, open `faqs.json`, click the **Versions** tab. You should see at least two versions.
3. Click an older version → **Actions** → **Copy** → paste back as the current `faqs.json`. The public site reverts.

---

## Updating Lambda code later

When you change `lambdas/get-faqs/index.mjs` or `lambdas/put-faqs/index.mjs`:

1. Re-run the zip commands from Step 4.
2. In Lambda Console, open the function → **Code** section → **Upload from** → **.zip file** → pick the new zip → **Save**.

That's it. The new code takes effect immediately on the next request.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Editor: "Failed to load FAQs" | `getFaqsUrl` in `js/config.js` is wrong, or the bucket policy / IAM role isn't letting the Lambda read `faqs.json`. Check the Lambda's CloudWatch logs. |
| Editor: 401 Unauthorized after typing correct password | `EDITOR_PASSWORD` env var on `put-faqs` doesn't match. Re-set it in **Configuration → Environment variables**. |
| Image uploads succeed but image is broken on the public site | The bucket policy in Step 1 is missing or wrong, so the image URL isn't publicly readable. Re-check the policy resource is `arn:aws:s3:::YOUR_BUCKET_NAME/articles/*`. |
| Browser console: CORS error | Re-check the CORS settings on the Function URL. **Allow headers** must include `x-editor-password` for `put-faqs`. |
| Editor save says "Session expired" | Password was rotated. Log in again. |
