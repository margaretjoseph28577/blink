import { useQuery } from '@tanstack/react-query';
import { BookOpen } from '@phosphor-icons/react';
import { call } from '../api/client';

/** Cover data URL for a book, cached for the session. */
export function useCover(bookId: number) {
  return useQuery({
    queryKey: ['cover', bookId],
    queryFn: () => call('cover:read', { bookId }),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Small book-cover thumbnail for list rows. Fetched once per book and cached
 * for the session, so re-searching or paging doesn't re-read cover files.
 */
export default function CoverThumb({ bookId }: { bookId: number }) {
  const { data: cover } = useCover(bookId);

  if (cover) {
    return (
      <img
        src={cover}
        alt=""
        className="h-10 w-7 shrink-0 rounded-sm object-cover ring-1 ring-slate-900/10"
      />
    );
  }
  return (
    <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded-sm bg-indigo-50 text-slate-300 ring-1 ring-slate-200">
      <BookOpen size={14} weight="duotone" />
    </div>
  );
}

/** Larger cover for grid cards and the quick-view panel. */
export function CoverLarge({ bookId, className }: { bookId: number; className?: string }) {
  const { data: cover } = useCover(bookId);
  if (cover) {
    return <img src={cover} alt="" className={`object-cover ${className ?? ''}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-indigo-50 text-slate-300 ${className ?? ''}`}>
      <BookOpen size={40} weight="duotone" />
    </div>
  );
}
