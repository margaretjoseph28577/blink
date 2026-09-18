/**
 * LibraFlow brand mark, recreated as vector art from the supplied logo:
 * three book spines (navy / blue / orange), a bold "L", a wave underline
 * and a scatter of pixels. Crisp at any size, matches the brand colors.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="LibraFlow logo">
      {/* book spines */}
      <rect x="10" y="22" width="14" height="48" rx="3" fill="#16294a" />
      <rect x="13.5" y="29" width="7" height="2.6" rx="1.3" fill="#fff" />
      <rect x="13.5" y="34" width="7" height="2.6" rx="1.3" fill="#fff" />
      <rect x="28" y="14" width="14" height="60" rx="3" fill="#2b7fd4" />
      <rect x="31.5" y="21" width="7" height="2.6" rx="1.3" fill="#fff" />
      <rect x="31.5" y="26" width="7" height="2.6" rx="1.3" fill="#fff" />
      <rect x="31.5" y="52" width="7" height="7" rx="1.5" fill="#fff" />
      <rect x="46" y="24" width="13" height="54" rx="3" fill="#f29627" />
      <rect x="49" y="31" width="7" height="2.6" rx="1.3" fill="#fff" />
      <rect x="49" y="36" width="7" height="2.6" rx="1.3" fill="#fff" />
      {/* bold L */}
      <path d="M64 12h12v46h18v11H64V12Z" fill="#16294a" />
      {/* pixel scatter */}
      <rect x="80" y="20" width="6" height="6" fill="#16294a" />
      <rect x="89" y="13" width="5" height="5" fill="#2b7fd4" />
      <rect x="88" y="27" width="4" height="4" fill="#2b7fd4" />
      <rect x="80" y="33" width="5" height="5" fill="#16294a" />
      <rect x="94" y="22" width="4" height="4" fill="#2b7fd4" />
      {/* wave underline */}
      <path
        d="M4 82c14-12 30-14 46-7 17 7 33 6 46-3-11 14-29 18-47 11C34 77 18 77 4 82Z"
        fill="#16294a"
      />
      <path
        d="M56 90c14 2 28-1 40-10-9 12-24 17-40 14v-4Z"
        fill="#2b7fd4"
      />
    </svg>
  );
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className ?? ''}`}>
      <span className="text-[#16294a]">Libra</span>
      <span className="text-[#2b7fd4]">Flow</span>
    </span>
  );
}
