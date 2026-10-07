// Builds a formatted .xlsx calling list. exceljs is loaded only when a download is requested.

export const CALL_STATUSES = [
  'Not Called', 'Connected', 'Interested', 'Not Interested', 'Call Back',
  'No Answer', 'Busy', 'Switched Off', 'Wrong Number', 'Booked',
];

const COLUMNS = [
  { key: 'sno',      header: '#',                 width: 5 },
  { key: 'phone',    header: 'Phone',             width: 14 },
  { key: 'name',     header: 'Name',              width: 20 },
  { key: 'interest', header: 'Service Interest',  width: 28, wrap: true },
  { key: 'lastAt',   header: 'Last Message On',   width: 18, numFmt: 'dd-mmm-yyyy hh:mm AM/PM' },
  { key: 'lastMsg',  header: 'Last Message',      width: 36, wrap: true },
  { key: 'note',     header: 'Admin Note',        width: 24, wrap: true },
  { key: 'stage',    header: 'Lead Stage',        width: 12 },
  { key: 'label',    header: 'Label',             width: 13 },
  { key: 'assigned', header: 'Assigned To',       width: 16, toFill: true },
  { key: 'status',   header: 'Call Status',       width: 16, toFill: true },
  { key: 'followUp', header: 'Follow-up Date',    width: 15, toFill: true, numFmt: 'dd-mmm-yyyy' },
  { key: 'remarks',  header: 'Remarks',           width: 32, toFill: true, wrap: true },
];

const HEADER_ROW = 4;
const COLOR = {
  header: 'FF15803D', fillHeader: 'FFB45309', headerText: 'FFFFFFFF',
  zebra: 'FFF9FAFB', toFill: 'FFFEFCE8', border: 'FFD1D5DB', subtitle: 'FF6B7280',
};
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin  = { style: 'thin', color: { argb: COLOR.border } };
const box   = { top: thin, left: thin, bottom: thin, right: thin };

// exceljs writes dates as UTC; shift so Excel shows local (IST) wall-clock time
const toExcelDate = (d) => {
  if (!d) return null;
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
};

const fmtHuman = (ymd) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const dateRangeText = (from, to) => {
  if (from && to) return from === to ? fmtHuman(from) : `${fmtHuman(from)} – ${fmtHuman(to)}`;
  if (from) return `from ${fmtHuman(from)}`;
  if (to)   return `up to ${fmtHuman(to)}`;
  return 'All dates';
};

/**
 * rows: [{ phone, name, interest, lastAt, lastMsg, note, stage, label }]
 * meta: { dateFrom, dateTo, filtersText }
 */
export async function downloadCallingSheet(rows, { dateFrom, dateTo, filtersText }) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Admin Panel';
  wb.created = new Date();

  const ws = wb.addWorksheet('Calling List', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: HEADER_ROW }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));
  const lastCol = ws.getColumn(COLUMNS.length).letter;

  // Title + summary
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell('A1').value = 'WhatsApp Customers — Calling List';
  ws.getCell('A1').font = { size: 14, bold: true };
  ws.mergeCells(`A2:${lastCol}2`);
  const exportedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  ws.getCell('A2').value =
    `Last message: ${dateRangeText(dateFrom, dateTo)}   ·   ${rows.length} customers   ·   Exported ${exportedAt}` +
    (filtersText ? `   ·   ${filtersText}` : '');
  ws.getCell('A2').font = { size: 10, italic: true, color: { argb: COLOR.subtitle } };

  // Header
  const header = ws.getRow(HEADER_ROW);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: COLOR.headerText } };
    cell.fill = solid(c.toFill ? COLOR.fillHeader : COLOR.header);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = box;
  });
  header.height = 24;

  // Data
  rows.forEach((r, idx) => {
    const row = ws.getRow(HEADER_ROW + 1 + idx);
    const values = { ...r, sno: idx + 1, lastAt: toExcelDate(r.lastAt) };
    COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.toFill ? null : (values[c.key] ?? '');
      cell.border = box;
      cell.alignment = { vertical: 'top', wrapText: !!c.wrap, horizontal: c.key === 'sno' ? 'center' : 'left' };
      if (c.numFmt) cell.numFmt = c.numFmt;
      if (c.key === 'phone') cell.numFmt = '@';
      if (c.toFill) cell.fill = solid(COLOR.toFill);
      else if (idx % 2 === 1) cell.fill = solid(COLOR.zebra);
    });
  });

  const firstData = HEADER_ROW + 1;
  const lastData  = HEADER_ROW + Math.max(rows.length, 1);

  // Call Status dropdown + colour coding
  const statusCol = ws.getColumn('status').letter;
  for (let r = firstData; r <= lastData; r++) {
    ws.getCell(`${statusCol}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CALL_STATUSES.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid status',
      error: 'Please pick a status from the list.',
    };
  }
  const first = `${statusCol}${firstData}`;
  const rule = (values, bg, fg) => ({
    type: 'expression',
    formulae: [`OR(${values.map((v) => `${first}="${v}"`).join(',')})`],
    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: bg } }, font: { color: { argb: fg }, bold: true } },
  });
  ws.addConditionalFormatting({
    ref: `${statusCol}${firstData}:${statusCol}${lastData}`,
    rules: [
      rule(['Interested', 'Booked', 'Connected'], 'FFDCFCE7', 'FF166534'),
      rule(['Not Interested', 'Wrong Number'], 'FFFEE2E2', 'FF991B1B'),
      rule(['Call Back', 'No Answer', 'Busy', 'Switched Off'], 'FFFEF3C7', 'FF92400E'),
    ],
  });

  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: COLUMNS.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const range = dateFrom || dateTo ? `${dateFrom || 'start'}_to_${dateTo || 'today'}` : `all-${new Date().toISOString().slice(0, 10)}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whatsapp-calling-${range}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
