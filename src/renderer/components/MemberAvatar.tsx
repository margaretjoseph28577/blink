import { useQuery } from '@tanstack/react-query';
import { call } from '../api/client';

const PALETTE = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500',
  'bg-cyan-500', 'bg-purple-500', 'bg-orange-500', 'bg-teal-500',
];

/** Member photo when one is saved, otherwise colored initials. */
export default function MemberAvatar({
  memberId,
  name,
  size = 32,
}: {
  memberId: number;
  name: string;
  size?: number;
}) {
  const { data: photo } = useQuery({
    queryKey: ['member-photo', memberId],
    queryFn: () => call('memberPhoto:read', { memberId }),
    staleTime: 5 * 60 * 1000,
  });

  const style = { width: size, height: size };
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        style={style}
        className="shrink-0 rounded-full object-cover ring-1 ring-slate-900/10"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const color = PALETTE[memberId % PALETTE.length];
  return (
    <div
      style={{ ...style, fontSize: size * 0.36 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${color}`}
    >
      {initials || '?'}
    </div>
  );
}
