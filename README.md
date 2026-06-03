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
```

Use the Supabase secret key only in Vercel. Do not paste it into Framer.

## Supabase Setup

You already ran this SQL. A copy is in `sql/schema.sql` in case you need it again.

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

## Test the Widget

Open:

```txt
https://YOUR-VERCEL-APP.vercel.app/index.html
```

Click the chat button and ask:

```txt
What does the Strategic Economic Audit say about the West of England economy?
```

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
