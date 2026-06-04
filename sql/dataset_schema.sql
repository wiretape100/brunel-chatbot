create extension if not exists vector;

create table if not exists brunel_dataset_files (
  id bigserial primary key,
  post_slug text not null,
  post_title text not null,
  post_url text,
  github_url text,
  github_path text,
  category text,
  folder_path text not null,
  workbook_path text not null unique,
  workbook_name text not null,
  analysis_sheet text,
  row_count int default 0,
  column_count int default 0,
  metadata jsonb default '{}',
  content_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists brunel_dataset_rows (
  id bigserial primary key,
  dataset_file_id bigint not null references brunel_dataset_files(id) on delete cascade,
  post_slug text not null,
  post_title text not null,
  post_url text,
  workbook_path text not null,
  workbook_name text not null,
  row_index int not null,
  row_data jsonb not null,
  search_text text not null,
  created_at timestamptz default now()
);

create table if not exists brunel_dataset_facts (
  id bigserial primary key,
  dataset_file_id bigint not null references brunel_dataset_files(id) on delete cascade,
  post_slug text not null,
  post_title text not null,
  post_url text,
  workbook_path text not null,
  workbook_name text not null,
  sheet_name text not null,
  geography text,
  year int,
  measure text not null,
  value numeric,
  value_text text,
  unit text,
  dimensions jsonb default '{}',
  metadata jsonb default '{}',
  source_row int,
  source_column int,
  search_text text not null,
  created_at timestamptz default now()
);

create table if not exists brunel_dataset_summaries (
  id bigserial primary key,
  dataset_file_id bigint not null references brunel_dataset_files(id) on delete cascade,
  post_slug text not null,
  post_title text not null,
  post_url text,
  workbook_path text not null,
  workbook_name text not null,
  content text not null,
  metadata jsonb default '{}',
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists brunel_dataset_files_post_slug_idx
  on brunel_dataset_files(post_slug);

create index if not exists brunel_dataset_rows_post_slug_idx
  on brunel_dataset_rows(post_slug);

create index if not exists brunel_dataset_rows_search_idx
  on brunel_dataset_rows using gin (to_tsvector('english', search_text));

create index if not exists brunel_dataset_facts_post_slug_idx
  on brunel_dataset_facts(post_slug);

create index if not exists brunel_dataset_facts_measure_idx
  on brunel_dataset_facts(measure);

create index if not exists brunel_dataset_facts_geography_year_idx
  on brunel_dataset_facts(geography, year);

create index if not exists brunel_dataset_facts_search_idx
  on brunel_dataset_facts using gin (to_tsvector('english', search_text));

create or replace function match_brunel_dataset_summaries (
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id bigint,
  post_title text,
  post_url text,
  workbook_name text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    brunel_dataset_summaries.id,
    brunel_dataset_summaries.post_title,
    brunel_dataset_summaries.post_url,
    brunel_dataset_summaries.workbook_name,
    brunel_dataset_summaries.content,
    1 - (brunel_dataset_summaries.embedding <=> query_embedding) as similarity
  from brunel_dataset_summaries
  where brunel_dataset_summaries.embedding is not null
  order by brunel_dataset_summaries.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function search_brunel_dataset_rows (
  query_text text,
  match_count int default 8
)
returns table (
  id bigint,
  post_title text,
  post_url text,
  workbook_name text,
  row_index int,
  row_data jsonb,
  rank float
)
language sql stable
as $$
  select
    brunel_dataset_rows.id,
    brunel_dataset_rows.post_title,
    brunel_dataset_rows.post_url,
    brunel_dataset_rows.workbook_name,
    brunel_dataset_rows.row_index,
    brunel_dataset_rows.row_data,
    ts_rank_cd(
      to_tsvector('english', brunel_dataset_rows.search_text),
      websearch_to_tsquery('english', query_text)
    ) as rank
  from brunel_dataset_rows
  where to_tsvector('english', brunel_dataset_rows.search_text)
    @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;

create or replace function search_brunel_dataset_facts (
  query_text text,
  match_count int default 20
)
returns table (
  id bigint,
  post_title text,
  post_url text,
  workbook_name text,
  sheet_name text,
  geography text,
  year int,
  measure text,
  value numeric,
  value_text text,
  unit text,
  dimensions jsonb,
  metadata jsonb,
  source_row int,
  source_column int,
  rank float
)
language sql stable
as $$
  select
    brunel_dataset_facts.id,
    brunel_dataset_facts.post_title,
    brunel_dataset_facts.post_url,
    brunel_dataset_facts.workbook_name,
    brunel_dataset_facts.sheet_name,
    brunel_dataset_facts.geography,
    brunel_dataset_facts.year,
    brunel_dataset_facts.measure,
    brunel_dataset_facts.value,
    brunel_dataset_facts.value_text,
    brunel_dataset_facts.unit,
    brunel_dataset_facts.dimensions,
    brunel_dataset_facts.metadata,
    brunel_dataset_facts.source_row,
    brunel_dataset_facts.source_column,
    ts_rank_cd(
      to_tsvector('english', brunel_dataset_facts.search_text),
      websearch_to_tsquery('english', query_text)
    ) as rank
  from brunel_dataset_facts
  where to_tsvector('english', brunel_dataset_facts.search_text)
    @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;
