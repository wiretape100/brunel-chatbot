create extension if not exists vector;

create table if not exists brunel_documents (
  id bigserial primary key,
  source_type text not null,
  title text not null,
  url text,
  content text not null,
  metadata jsonb default '{}',
  embedding vector(1536),
  created_at timestamptz default now()
);

create or replace function match_brunel_documents (
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id bigint,
  title text,
  url text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    brunel_documents.id,
    brunel_documents.title,
    brunel_documents.url,
    brunel_documents.content,
    1 - (brunel_documents.embedding <=> query_embedding) as similarity
  from brunel_documents
  where brunel_documents.embedding is not null
  order by brunel_documents.embedding <=> query_embedding
  limit match_count;
$$;
