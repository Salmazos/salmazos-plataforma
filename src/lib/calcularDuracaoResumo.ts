const CURRENT_YEAR = 2026;
const CURRENT_MONTH = 6; // June 2026

// Month name → number (lowercase keys; handles abbreviated and accented variants)
const MESES: Record<string, number> = {
  jan: 1,  janeiro: 1,
  fev: 2,  fevereiro: 2,
  mar: 3,  março: 3,   marco: 3,
  abr: 4,  abril: 4,
  mai: 5,  maio: 5,
  jun: 6,  junho: 6,
  jul: 7,  julho: 7,
  ago: 8,  agosto: 8,
  set: 9,  setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

function formatarDuracao(totalMeses: number): string {
  if (totalMeses <= 0) return "";
  if (totalMeses < 12) return totalMeses === 1 ? "(1 mês)" : `(${totalMeses} meses)`;
  const anos = Math.floor(totalMeses / 12);
  const meses = totalMeses % 12;
  if (meses === 0) return anos === 1 ? "(1 ano)" : `(${anos} anos)`;
  return `(${anos} ano${anos !== 1 ? "s" : ""} e ${meses} mês${meses !== 1 ? "es" : ""})`;
}

// True if the text immediately after this match already starts with "(" — duration already present
function jaTemDuracao(match: string, offset: number, str: string): boolean {
  return /^\s*\(/.test(str.slice(offset + match.length));
}

// Separators between date parts:
// explicit chars (à, á, a, –, —, -, /) with optional surrounding spaces
// OR just whitespace followed by a 4-digit year (lookahead keeps it safe)
const SEP = "\\s*(?:à|á|a|–|—|-|/)\\s*|\\s+(?=\\d{4})";

// Portuguese month names: full and abbreviated, with/without accents (case-insensitive flag handles capitalisation)
const MES_PT =
  "(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço|co)?|abr(?:il)?|maio?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)";

// Open-ended keywords (longer alternatives first so they are tried before shorter prefixes)
const ATUAL =
  "(?:nos dias atuais|até o momento|até hoje|atualmente|atual|presente)";

// Separator between month name and year number: slash, space, or hyphen (one or more chars)
const MES_ANO_SEP = "[/\\s-]+";

export function calcularDuracaoResumo(text: string): string {
  if (!text) return text;

  let result = text;

  // ── 1. Month/Year → Month/Year ────────────────────────────────────────────────
  // e.g. "Abril/2023 a Novembro/2023"  →  "(7 meses)"
  result = result.replace(
    new RegExp(
      `(${MES_PT})${MES_ANO_SEP}(\\d{4})(?:${SEP})(${MES_PT})${MES_ANO_SEP}(\\d{4})`,
      "gi"
    ),
    (match, m1, y1, m2, y2, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const sm = MESES[m1.toLowerCase()] ?? 1;
      const em = MESES[m2.toLowerCase()] ?? 12;
      const totalMeses = (parseInt(y2) - parseInt(y1)) * 12 + (em - sm);
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 2. Month/Year → atual/presente ───────────────────────────────────────────
  // e.g. "Abril/2023 – Presente"  →  "(~X anos/meses)"
  result = result.replace(
    new RegExp(
      `(${MES_PT})${MES_ANO_SEP}(\\d{4})(?:${SEP})${ATUAL}`,
      "gi"
    ),
    (match, m1, y1, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const sm = MESES[m1.toLowerCase()] ?? 1;
      const totalMeses = (CURRENT_YEAR - parseInt(y1)) * 12 + (CURRENT_MONTH - sm);
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 3. YYYY → atual/presente ──────────────────────────────────────────────────
  // e.g. "1997 à Atual", "2021 – Presente", "2023 a Atual"
  // Lookbehind prevents matching the YYYY inside already-processed "Mês/YYYY" strings
  result = result.replace(
    new RegExp(`(?<![/\\d])(\\d{4})(?:${SEP})${ATUAL}`, "gi"),
    (match, y1, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const totalMeses = (CURRENT_YEAR - parseInt(y1)) * 12;
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 4. YYYY → YYYY ────────────────────────────────────────────────────────────
  // e.g. "1990 a 1997", "2006 – 2015", "1997/2000", "1998 á 2000", "1997 - 2000"
  // Lookbehind/lookahead prevent matching YYYY inside "Mês/YYYY" or longer numbers
  result = result.replace(
    new RegExp(`(?<![/\\d])(\\d{4})(?:${SEP})(\\d{4})(?![/\\d])`, "g"),
    (match, y1, y2, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const totalMeses = (parseInt(y2) - parseInt(y1)) * 12;
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 5. desde YYYY ─────────────────────────────────────────────────────────────
  // e.g. "CEO desde 2010"
  result = result.replace(
    /desde\s+(\d{4})/gi,
    (match, y1, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const totalMeses = (CURRENT_YEAR - parseInt(y1)) * 12;
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  return result;
}
