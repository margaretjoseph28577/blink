import { net } from 'electron';
import type { IsbnResult } from '../../shared/types';

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await net.fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await net.fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null; // Open Library returns a 1x1 placeholder for missing covers
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeIsbn(raw: string): { isbn10: string | null; isbn13: string | null } {
  const digits = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (digits.length === 10) return { isbn10: digits, isbn13: isbn10to13(digits) };
  if (digits.length === 13) return { isbn10: isbn13to10(digits), isbn13: digits };
  return { isbn10: null, isbn13: null };
}

function isbn10to13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + String((10 - (sum % 10)) % 10);
}

function isbn13to10(isbn13: string): string | null {
  if (!isbn13.startsWith('978')) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

interface OlBook {
  title?: string;
  publishers?: string[];
  publish_places?: string[] | { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  pagination?: string;
  authors?: { key: string }[];
  works?: { key: string }[];
  by_statement?: string;
  edition_name?: string;
  subjects?: string[];
  covers?: number[];
  description?: string | { value: string };
}

async function fetchOlAuthorNames(keys: string[]): Promise<string | null> {
  const names: string[] = [];
  for (const key of keys.slice(0, 4)) {
    const author = (await fetchJson(`https://openlibrary.org${key}.json`)) as
      | { name?: string }
      | null;
    if (author?.name) names.push(author.name);
  }
  return names.length ? names.join(', ') : null;
}

async function lookupOpenLibrary(isbn: string): Promise<IsbnResult | null> {
  const data = (await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`)) as OlBook | null;
  if (!data?.title) return null;

  // The parent work record holds authors and subjects that editions often lack.
  interface OlWork {
    authors?: { author?: { key: string } }[];
    subjects?: string[];
  }
  let work: OlWork | null = null;
  if (data.works?.length) {
    work = (await fetchJson(`https://openlibrary.org${data.works[0].key}.json`)) as OlWork | null;
  }

  // Authors may live on the edition, on the parent work, or only in by_statement.
  let authors: string | null = null;
  if (data.authors?.length) {
    authors = await fetchOlAuthorNames(data.authors.map((a) => a.key));
  }
  if (!authors && work?.authors?.length) {
    const keys = work.authors.map((a) => a.author?.key).filter((k): k is string => !!k);
    if (keys.length) authors = await fetchOlAuthorNames(keys);
  }
  if (!authors && data.by_statement) {
    authors = data.by_statement.replace(/^by\s+/i, '').replace(/[.\s]+$/, '').trim() || null;
  }

  const SUBJECT_NOISE =
    /open library|staff picks|nyt:|new york times|accessible book|protected daisy|in library|large type|reading level|fiction in english|translations into/i;
  const subjects = (data.subjects ?? work?.subjects ?? []).filter(
    (s) => typeof s === 'string' && s.length < 40 && !SUBJECT_NOISE.test(s),
  );

  let coverDataUrl: string | null = null;
  if (data.covers?.length) {
    coverDataUrl = await fetchImageAsDataUrl(
      `https://covers.openlibrary.org/b/id/${data.covers[0]}-M.jpg`,
    );
  } else {
    coverDataUrl = await fetchImageAsDataUrl(
      `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
    );
  }

  const yearMatch = data.publish_date ? /\b(1[5-9]\d{2}|20\d{2})\b/.exec(data.publish_date) : null;
  const places = (data.publish_places ?? [])
    .map((p) => (typeof p === 'string' ? p : p.name))
    .filter(Boolean);
  const description =
    typeof data.description === 'string' ? data.description : (data.description?.value ?? null);

  return {
    isbn,
    title: data.title,
    authors,
    publisher: data.publishers?.[0] ?? null,
    place: places[0] ?? null,
    year: yearMatch ? Number(yearMatch[1]) : null,
    edition: data.edition_name ?? null,
    pages: data.number_of_pages ? String(data.number_of_pages) : (data.pagination ?? null),
    subject: subjects.slice(0, 3).join('; ') || null,
    category: subjects[0]?.split(',')[0].trim() ?? null,
    description,
    coverDataUrl,
    source: 'openlibrary',
  };
}

interface GBooksVolume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    description?: string;
    imageLinks?: { thumbnail?: string };
  };
}

async function lookupGoogleBooks(isbn: string): Promise<IsbnResult | null> {
  const data = (await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
  )) as { items?: GBooksVolume[] } | null;
  const info = data?.items?.[0]?.volumeInfo;
  if (!info?.title) return null;
  let coverDataUrl: string | null = null;
  if (info.imageLinks?.thumbnail) {
    coverDataUrl = await fetchImageAsDataUrl(info.imageLinks.thumbnail.replace('http://', 'https://'));
  }
  const yearMatch = info.publishedDate ? /\b(1[5-9]\d{2}|20\d{2})\b/.exec(info.publishedDate) : null;
  return {
    isbn,
    title: info.title,
    authors: info.authors?.join(', ') ?? null,
    publisher: info.publisher ?? null,
    place: null,
    year: yearMatch ? Number(yearMatch[1]) : null,
    edition: null,
    pages: info.pageCount ? String(info.pageCount) : null,
    // Google categories look like "Fiction / Thrillers" — first segment is the category.
    subject: info.categories?.join(', ') ?? null,
    category: info.categories?.[0]?.split('/')[0].trim() ?? null,
    description: info.description ?? null,
    coverDataUrl,
    source: 'googlebooks',
  };
}

export async function lookupIsbn(rawIsbn: string): Promise<IsbnResult | null> {
  const { isbn10, isbn13 } = normalizeIsbn(rawIsbn);
  const candidates = [isbn13, isbn10].filter((x): x is string => !!x);
  if (candidates.length === 0) return null;
  for (const isbn of candidates) {
    const ol = await lookupOpenLibrary(isbn);
    if (ol) {
      // Open Library sometimes has the edition but no author anywhere; borrow
      // missing fields from Google Books rather than returning holes.
      if (!ol.authors || !ol.publisher || !ol.year || !ol.subject) {
        const gb = await lookupGoogleBooks(isbn);
        if (gb) {
          ol.authors = ol.authors ?? gb.authors;
          ol.publisher = ol.publisher ?? gb.publisher;
          ol.year = ol.year ?? gb.year;
          ol.pages = ol.pages ?? gb.pages;
          ol.subject = ol.subject ?? gb.subject;
          ol.category = ol.category ?? gb.category;
          ol.description = ol.description ?? gb.description;
          ol.coverDataUrl = ol.coverDataUrl ?? gb.coverDataUrl;
        }
      }
      return { ...ol, isbn: isbn13 ?? isbn };
    }
  }
  for (const isbn of candidates) {
    const gb = await lookupGoogleBooks(isbn);
    if (gb) return { ...gb, isbn: isbn13 ?? isbn };
  }
  return null;
}
