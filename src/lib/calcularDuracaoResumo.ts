const CURRENT_YEAR = 2026;
const CURRENT_MONTH = 6; // June 2026

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function formatarDuracao(totalMeses: number): string {
  if (totalMeses <= 0) return "";
  if (totalMeses < 12) return totalMeses === 1 ? "(1 mês)" : `(${totalMeses} meses)`;
  const anos = Math.floor(totalMeses / 12);
  const meses = totalMeses % 12;
  if (meses === 0) return anos === 1 ? "(1 ano)" : `(${anos} anos)`;
  return `(${anos} ano${anos !== 1 ? "s" : ""} e ${meses} mês${meses !== 1 ? "es" : ""})`;
}

// Returns true if the text immediately after this match already has a duration "(..."
function jaTemDuracao(match: string, offset: number, str: string): boolean {
  return /^\s*\(/.test(str.slice(offset + match.length));
}

const MES_PT = "(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)";
const ATUAL  = "(?:atual|Atual|presente|Presente|atualmente|Atualmente)";
// Separators: "à", "a", en-dash, em-dash, hyphen — with optional surrounding spaces
const SEP    = "\\s*(?:à|a|[–—-])\\s*";

export function calcularDuracaoResumo(text: string): string {
  if (!text) return text;

  let result = text;

  // ── 1. Month/Year → Month/Year  (e.g. "Abril/2023 a Novembro/2023") ──────────
  result = result.replace(
    new RegExp(`${MES_PT}[/\\s](\\d{4})${SEP}${MES_PT}[/\\s](\\d{4})`, "gi"),
    (match, m1, y1, m2, y2, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const sm = MESES[m1.toLowerCase()] ?? 1;
      const em = MESES[m2.toLowerCase()] ?? 12;
      const totalMeses = (parseInt(y2) - parseInt(y1)) * 12 + (em - sm);
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 2. Month/Year → atual/presente  (e.g. "Abril/2023 – Presente") ──────────
  result = result.replace(
    new RegExp(`${MES_PT}[/\\s](\\d{4})${SEP}${ATUAL}`, "gi"),
    (match, m1, y1, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const sm = MESES[m1.toLowerCase()] ?? 1;
      const totalMeses = (CURRENT_YEAR - parseInt(y1)) * 12 + (CURRENT_MONTH - sm);
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 3. YYYY → atual/presente  (e.g. "1997 à Atual", "2021 – Presente") ──────
  // Lookbehind prevents matching "YYYY" inside "Month/YYYY" already processed
  result = result.replace(
    new RegExp(`(?<![/\\d])(\\d{4})${SEP}${ATUAL}`, "gi"),
    (match, y1, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const totalMeses = (CURRENT_YEAR - parseInt(y1)) * 12;
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 4. YYYY → YYYY  (e.g. "1990 a 1997", "2006 – 2015", "1990 à 1997") ─────
  result = result.replace(
    new RegExp(`(?<![/\\d])(\\d{4})${SEP}(\\d{4})(?![/\\d])`, "g"),
    (match, y1, y2, offset, str) => {
      if (jaTemDuracao(match, offset, str)) return match;
      const totalMeses = (parseInt(y2) - parseInt(y1)) * 12;
      const dur = formatarDuracao(totalMeses);
      return dur ? `${match} ${dur}` : match;
    }
  );

  // ── 5. desde YYYY  (e.g. "CEO desde 2010") ──────────────────────────────────
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
