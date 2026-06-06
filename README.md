# Brunel Chatbot Starter

This is a small Vercel MVP for an embeddable Brunel Centre chatbot.

It does three things:

1. Reads the source pages listed in `content/sources.json`.
2. Stores page chunks and OpenAI embeddings in Supabase.
3. Serves a chat API and a Framer-ready widget.

## Environment Variables

Add these in Vercel under Project Settings -> Environment Variables:

```txt
OPENAI_API_KEY=sk-your-openai-key
OPENAI_CHAT_MODEL=gpt-5.4-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-supabase-secret-key

INGEST_SECRET=make-a-long-random-password
DATAHUB_ZIP_URL=https://codeload.github.com/thebrunelcentre/Datahub-data/zip/refs/heads/main
```

Use the Supabase secret key only in Vercel. Do not paste it into Framer.

## Supabase Setup

You already ran this SQL. A copy is in `sql/schema.sql` in case you need it again.

For dataset ingestion, also run:

```txt
sql/dataset_schema.sql
```

## Deploy

1. Create a GitHub repository named `brunel-chatbot`.
2. Upload this project to that repository.
3. In Vercel, choose Add New -> Project.
4. Import the GitHub repository.
5. Add the environment variables above.
6. Deploy.

## Ingest Content

After Vercel deploys, open this URL in your browser:

```txt
https://YOUR-VERCEL-APP.vercel.app/api/ingest?secret=YOUR_INGEST_SECRET
```

You should see JSON with `ok: true` and a chunk count.

The current `content/sources.json` contains the Brunel overview pages plus all published Research and Data Hub posts from the CMS export.

For the full 90-post import, use batches so Vercel does not time out:

```txt
https://YOUR-VERCEL-APP.vercel.app/api/ingest?secret=YOUR_INGEST_SECRET&offset=0&limit=20
https://YOUR-VERCEL-APP.vercel.app/api/ingest?secret=YOUR_INGEST_SECRET&offset=20&limit=20
https://YOUR-VERCEL-APP.vercel.app/api/ingest?secret=YOUR_INGEST_SECRET&offset=40&limit=20
https://YOUR-VERCEL-APP.vercel.app/api/ingest?secret=YOUR_INGEST_SECRET&offset=60&limit=20
https://YOUR-VERCEL-APP.vercel.app/api/ingest?secret=YOUR_INGEST_SECRET&offset=80&limit=20
```

Each response includes `has_more` and `next_offset`. Continue until `has_more` is `false`.

## Refresh or Add Sources

The chatbot does not need prompt changes when new Brunel Centre Data Hub or Research posts are added. Add or refresh the source registry, validate it, then rerun ingestion.

1. Add the new public page to `content/sources.json`.
   - Data Hub posts should use a `data-hub-...` id, a `https://www.thebrunelcentre.co.uk/data-hub/...` URL, and include the `data-hub` tag.
   - Research articles should use a `research-...` id, a `https://www.thebrunelcentre.co.uk/research/...` URL, and include the `research` tag.
   - Generic pages such as About, Consultancy, Contact, Privacy, Terms, Accessibility and Governance can stay in the registry for grounded Q&A, but should not be tagged or treated as catalogue article results.
2. If the new Data Hub post has linked workbook data, add or update its mapping in `content/datahub-datasets.json`.
3. Run the source validation command locally:

```sh
npm run validate:sources
```

This checks that source URLs are valid, tags are arrays, source types can be inferred, Data Hub and Research posts are classified correctly, generic pages are excluded from article catalogues, and dataset mappings match source URLs after normalisation. URL matching tolerates encoded parentheses, normal parentheses, en dashes, hyphens, smart punctuation, trailing slashes, case differences and minor URL encoding differences.

4. Deploy the updated registry to Vercel.
5. Rerun `/api/ingest` in batches to refresh article chunks and embeddings.
6. If datasets changed, rerun `/api/ingest-datasets` in batches.

The current repo uses a static source registry. For production, replace or supplement `content/sources.json` with a Framer CMS or sitemap sync that writes the same source shape and then runs the validation and ingestion steps above.

## Test the Widget

Open:

```txt
https://YOUR-VERCEL-APP.vercel.app/index.html
```

Click the chat button and ask:

```txt
What does the Strategic Economic Audit say about the West of England economy?
```

## Ingest Data Hub Datasets

This optional test layer reads the public Datahub-data GitHub ZIP, parses each Data Hub post's linked Excel workbooks, and stores:

- analysis-sheet rows for exact lookup
- raw-sheet facts for auditable calculations
- workbook metadata for source/method context

Run `sql/dataset_schema.sql` in Supabase before ingesting. If you already ran an older version, run the updated file again; it adds the raw facts table and search function without deleting existing data.

Run it in small batches:

```txt
https://YOUR-VERCEL-APP.vercel.app/api/ingest-datasets?secret=YOUR_INGEST_SECRET&offset=0&limit=5
https://YOUR-VERCEL-APP.vercel.app/api/ingest-datasets?secret=YOUR_INGEST_SECRET&offset=5&limit=5
https://YOUR-VERCEL-APP.vercel.app/api/ingest-datasets?secret=YOUR_INGEST_SECRET&offset=10&limit=5
```

Continue increasing `offset` by `5` until `has_more` is `false`.

For the current test mapping, there are 59 Data Hub posts. Each batch downloads the GitHub ZIP, so keep the batch size small on Vercel Hobby.

Successful dataset ingestion now returns counts for `workbooks`, `rows`, and `facts`. The `facts` count means raw workbook values were loaded.

After dataset ingestion, ask exact-number questions such as:

```txt
Which area had the highest employment rate?
What was GDP per head in Bristol in 2023?
What does the child poverty data say for the Greater West of England?
Calculate the population-weighted NEET rate for Bristol and Gloucestershire.
```

For rate calculations, the backend uses numerator and denominator counts from raw sheets where available. It will not average percentages or estimate missing counts.

## Production Hardening Checks

Run the focused checks before deploying source or retrieval changes:

```sh
npm run validate:sources
npm run test:small-talk
npm run test:catalogue
npm run test:retrieval
npm run test:hardening
```

The chatbot API includes a lightweight per-IP in-memory rate limit for normal abuse protection. If the limit is exceeded, the API returns a polite chatbot message rather than internal details. For high-traffic production, use a shared store such as Vercel KV or Upstash so limits are enforced across all serverless instances.

## Add to Framer

Add a Framer Embed component and paste:

```html
<script src="https://YOUR-VERCEL-APP.vercel.app/widget.js"></script>
```

That loads the floating chat widget sitewide wherever the embed is present.

## Notes

- This MVP ingests normal web pages.
- For PDFs, either add the report page first or paste extracted PDF text into a `content` field in `content/sources.json`.
- The full production version should replace `content/sources.json` with an automated Framer CMS sync.
