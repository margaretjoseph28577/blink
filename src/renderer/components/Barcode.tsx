/**
 * Code 39 barcode rendered as inline SVG — no library, prints crisply.
 * Charset: 0-9 A-Z - . space $ / + % (covers accession numbers and member codes).
 */

// 9 elements per char (bar,space,... alternating), '1' = wide (3 units), '0' = narrow.
const CODE39: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100',
  A: '100001001', B: '001001001', C: '101001000', D: '000011001',
  E: '100011000', F: '001011000', G: '000001101', H: '100001100',
  I: '001001100', J: '000011100', K: '100000011', L: '001000011',
  M: '101000010', N: '000010011', O: '100010010', P: '001010010',
  Q: '000000111', R: '100000110', S: '001000110', T: '000010110',
  U: '110000001', V: '011000001', W: '111000000', X: '010010001',
  Y: '110010000', Z: '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', $: '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
};

const WIDE = 3;

/** Bars for one framed value (*value*): [xOffset, width] pairs in narrow-bar units. */
function encode(value: string): { bars: [number, number][]; totalUnits: number } {
  const text = `*${value.toUpperCase()}*`;
  const bars: [number, number][] = [];
  let x = 0;
  for (const ch of text) {
    const pattern = CODE39[ch];
    if (!pattern) continue; // unsupported char — skip rather than corrupt the code
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === '1' ? WIDE : 1;
      if (i % 2 === 0) bars.push([x, w]); // even index = bar, odd = space
      x += w;
    }
    x += 1; // inter-character gap
  }
  return { bars, totalUnits: x - 1 };
}

export default function Barcode({
  value,
  height = 34,
  unit = 1.6,
  showText = true,
}: {
  value: string;
  /** bar height in px */
  height?: number;
  /** narrow bar width in px */
  unit?: number;
  showText?: boolean;
}) {
  const { bars, totalUnits } = encode(value);
  const width = totalUnits * unit;
  const textH = showText ? 12 : 0;
  return (
    <svg
      width={width}
      height={height + textH}
      viewBox={`0 0 ${width} ${height + textH}`}
      role="img"
      aria-label={value}
      shapeRendering="crispEdges"
    >
      {bars.map(([x, w], i) => (
        <rect key={i} x={x * unit} y={0} width={w * unit} height={height} fill="#000" />
      ))}
      {showText && (
        <text
          x={width / 2}
          y={height + 10}
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          fill="#000"
        >
          {value.toUpperCase()}
        </text>
      )}
    </svg>
  );
}
