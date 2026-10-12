/**
 * 월별 활동보고서(.docx) 생성 — 붙임3 서식의 [별지 1] 팀 활동 보고서 + [별지 2] 개인 활동 보고서 ×4
 *
 * 실행: NODE_PATH=<docx 가 설치된 node_modules> node GUMAP_report/_tools/reports/make_reports.js
 *   (docx 는 `npm i docx@9` 로 아무 폴더에나 설치하고 NODE_PATH 로 가리키면 된다)
 * 출력: GUMAP_report/보고서/2026-MM_활동보고서_GUMAP.docx, 활동보고서_본문.md
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType, ShadingType,
  AlignmentType, VerticalAlign, LevelFormat, PageBreak, HeightRule, BorderStyle,
} = require('docx');
const { TEAM, MONTHS } = require('./content');

const OUT = path.resolve(__dirname, '..', '..', '보고서');
const IMG = path.join(OUT, 'images');
const FONT = { ascii: 'Malgun Gothic', eastAsia: '맑은 고딕', hAnsi: 'Malgun Gothic', cs: 'Malgun Gothic' };
const PAGE_W = 11906, MARGIN = 1134, CONTENT_W = PAGE_W - MARGIN * 2;   // A4, 좌우 2cm
const LABEL_FILL = 'E8EEF7';
const BORDER = { style: BorderStyle.SINGLE, size: 6, color: '555555' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

/** 【…】 는 빨간 글씨로 — 제출 전에 실제 내용으로 바꿀 자리 */
function runs(text, opts = {}) {
  return String(text).split(/(【[^】]*】)/).filter(Boolean).map(part => new TextRun({
    text: part, font: FONT, size: opts.size || 18, bold: !!opts.bold,
    color: part.startsWith('【') ? 'C00000' : (opts.color || undefined),
  }));
}

function para(text, opts = {}) {
  return new Paragraph({
    children: runs(text, opts), alignment: opts.align,
    spacing: { before: opts.before || 0, after: opts.after == null ? 30 : opts.after, line: opts.line || 252 },
  });
}

function body(items) {
  return items.map(it => {
    if (it.h) return para(it.h, { bold: true, before: 60, after: 20, size: 18 });
    if (it.b) return new Paragraph({ children: runs(it.b), numbering: { reference: 'dash', level: 0 },
      spacing: { after: 20, line: 252 } });
    return para(it.p, { after: 40 });
  });
}

function cell(children, width, opts = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: { size: width, type: WidthType.DXA },
    columnSpan: opts.span, verticalAlign: opts.valign || VerticalAlign.CENTER,
    shading: opts.label ? { type: ShadingType.CLEAR, color: 'auto', fill: LABEL_FILL } : undefined,
    borders: CELL_BORDERS,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
  });
}

function label(text, width, opts = {}) {
  return cell(para(text, { bold: true, align: AlignmentType.CENTER, after: 0, size: 20 }), width, Object.assign({ label: true }, opts));
}

function photoCell(note, date, width, span) {
  return cell([
    para('※ 활동사진은 해당 페이지를 초과하지 않도록 1~2장 이내로 첨부할 것.', { size: 17, color: '666666', after: 60 }),
    para('【활동 사진 1~2장 첨부】', { align: AlignmentType.CENTER, before: 900, after: 900 }),
    para('일자: ' + date, { size: 19 }),
  ], width, { span, valign: VerticalAlign.TOP });
}

function formTitle(tag, title) {
  return [
    para(tag, { size: 17, color: '444444', after: 60 }),
    new Paragraph({ children: runs(title, { bold: true, size: 30 }), alignment: AlignmentType.CENTER, spacing: { before: 40, after: 160 } }),
  ];
}

function teamForm(m) {
  const W1 = 1900, W2 = CONTENT_W - W1;
  const img = fs.readFileSync(path.join(IMG, m.image));
  const content = body(m.team).concat([
    new Paragraph({ children: [new ImageRun({ type: 'jpg', data: img, transformation: { width: 400, height: 225 } })],
      alignment: AlignmentType.CENTER, spacing: { before: 60, after: 10 } }),
    para('▲ ' + m.imageCaption, { size: 16, color: '555555', align: AlignmentType.CENTER, after: 0 }),
  ]);
  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [W1, W2],
    rows: [
      new TableRow({ children: [label('팀명', W1), cell(para(TEAM.name, { bold: true, align: AlignmentType.CENTER, after: 0, size: 21 }), W2)] }),
      new TableRow({ children: [label('프로젝트 진행률', W1), cell([
        para('※ 전체 프로젝트 수행계획 대비 현재 진행 정도를 기재', { size: 16, color: '666666', after: 20 }),
        para(m.progress + '  (' + m.progressNote + ')', { bold: true, after: 0 }),
      ], W2)] }),
      new TableRow({ children: [label('활동 내용', W1, { valign: VerticalAlign.CENTER }), cell(content, W2, { valign: VerticalAlign.TOP })] }),
      new TableRow({ height: { value: 3600, rule: HeightRule.ATLEAST },
        children: [label('활동\n사진'.replace('\n', ' '), W1), photoCell('', m.photoDate, W2)] }),
    ],
  });
  return formTitle('[별지 1 필수] 팀 활동 보고서', `AX 기반 역량 강화 프로젝트 팀 활동보고서 (${m.month}월)`).concat([table]);
}

function personalForm(m, member) {
  const C = [1750, CONTENT_W / 2 - 1750, 1750, CONTENT_W / 2 - 1750];
  const rest = C[1] + C[2] + C[3];
  const items = [{ p: `담당: ${member.role} · 기간: ${m.weeks}` }].concat(m.personal[member.name]);
  const table = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: C,
    rows: [
      new TableRow({ children: [
        label('지도교수 확인', C[0]), cell(para('(서명/인)', { align: AlignmentType.RIGHT, after: 0, color: '666666' }), C[1]),
        label('학생 성명', C[2]), cell(para(member.name, { align: AlignmentType.CENTER, after: 0, bold: true }), C[3]),
      ] }),
      new TableRow({ children: [
        label('지도교수 소속', C[0]), cell(para(`${TEAM.advisor.dept} ${TEAM.advisor.major}`, { align: AlignmentType.CENTER, after: 0 }), C[1]),
        label('학생 소속', C[2]), cell(para(`${member.dept} ${member.major}`, { align: AlignmentType.CENTER, after: 0 }), C[3]),
      ] }),
      new TableRow({ children: [label('학생 연락처', C[0]), cell(para(member.phone, { after: 0 }), rest, { span: 3 })] }),
      new TableRow({ children: [label('프로젝트명', C[0]), cell(para(TEAM.project, { after: 0 }), rest, { span: 3 })] }),
      new TableRow({ height: { value: 5200, rule: HeightRule.ATLEAST },
        children: [label('활동 내용', C[0]), cell(body(items), rest, { span: 3, valign: VerticalAlign.TOP })] }),
      new TableRow({ height: { value: 4200, rule: HeightRule.ATLEAST },
        children: [label('활동 사진', C[0]), photoCell('', m.photoDate, rest, 3)] }),
    ],
  });
  return formTitle('[별지 2 필수] 개인 활동 보고서', `AX 기반 역량 강화 프로젝트 개인 활동보고서 (${m.month}월)`).concat([table]);
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

async function build(m) {
  let children = teamForm(m);
  TEAM.members.forEach(member => { children = children.concat([pageBreak()], personalForm(m, member)); });
  const doc = new Document({
    creator: 'GUMAP', title: `GUMAP ${m.month}월 활동보고서`,
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    numbering: { config: [{ reference: 'dash', levels: [{ level: 0, format: LevelFormat.BULLET, text: '-',
      alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 260, hanging: 200 } } } }] }] },
    sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 },
      margin: { top: 1000, bottom: 900, left: MARGIN, right: MARGIN } } }, children }],
  });
  const file = path.join(OUT, `${m.key}_활동보고서_GUMAP.docx`);
  fs.writeFileSync(file, await Packer.toBuffer(doc));
  return file;
}

function markdown() {
  const L = ['# GUMAP 월별 활동보고서 본문 (복사용)', '',
    '> 【 】 표시는 실제 일정·피드백·사진으로 바꿔야 하는 자리입니다. 개인 활동 내용은 계획서의 역할 분담을 기준으로 쓴 초안이니 각자 실제 수행한 내용으로 확인·수정하세요.', ''];
  MONTHS.forEach(m => {
    L.push(`## ${m.month}월 (${m.weeks})`, '', '### [별지 1] 팀 활동 보고서', '',
      `- 팀명: ${TEAM.name}`, `- 프로젝트 진행률: ${m.progress} (${m.progressNote})`, '', '**활동 내용**', '');
    m.team.forEach(it => L.push(it.h ? `\n${it.h}` : it.b ? `- ${it.b}` : it.p));
    L.push('', `(첨부 화면: 보고서/images/${m.image} — ${m.imageCaption})`, '', `활동 사진: 【1~2장】 · 일자: ${m.photoDate}`, '');
    TEAM.members.forEach(mb => {
      L.push(`### [별지 2] 개인 활동 보고서 — ${mb.name}`, '',
        `- 학생 소속: ${mb.dept} ${mb.major} · 연락처: ${mb.phone}`, `- 담당: ${mb.role}`, '');
      m.personal[mb.name].forEach(it => L.push(it.b ? `- ${it.b}` : it.p));
      L.push('');
    });
  });
  fs.writeFileSync(path.join(OUT, '활동보고서_본문.md'), L.join('\n'), 'utf8');
}

(async () => {
  for (const m of MONTHS) console.log('saved', await build(m));
  markdown();
  console.log('saved 활동보고서_본문.md');
})();
