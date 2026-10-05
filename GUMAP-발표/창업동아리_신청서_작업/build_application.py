from pathlib import Path
import json
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'AI중심대학 2026 창업동아리 신청지원서(GUMAP-팀장명미정)_초안.docx'
doc = Document()
# Preset: grant_proposal (narrative_proposal alias), proposal_centerpiece header.
# Named overrides: KoreanFont=Malgun Gothic; CompactTable=9pt/1.1;
# ConsentText=9.5pt/1.15. Geometry remains preset US Letter, 9360 DXA.
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.top_margin = sec.bottom_margin = sec.left_margin = sec.right_margin = Inches(1)
sec.header_distance = sec.footer_distance = Inches(.45)
styles = doc.styles
for name in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3']:
    s=styles[name]
    s.font.name='맑은 고딕'
    s.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'),'맑은 고딕')
    s.font.color.rgb=RGBColor.from_string('222222')
normal=styles['Normal']
normal.font.size=Pt(11)
normal.paragraph_format.space_before=Pt(0)
normal.paragraph_format.space_after=Pt(6)
normal.paragraph_format.line_spacing=1.25
normal.paragraph_format.widow_control=True
for name,size,before,after,color in [('Heading 1',16,16,8,'2E74B5'),('Heading 2',13,12,6,'2E74B5'),('Heading 3',12,8,4,'1F4D78')]:
    s=styles[name]; s.font.size=Pt(size); s.font.bold=True
    s.font.color.rgb=RGBColor.from_string(color)
    f=s.paragraph_format; f.space_before=Pt(before); f.space_after=Pt(after); f.keep_with_next=True; f.line_spacing=1.15
styles['Title'].font.size=Pt(22)
styles['Title'].font.bold=True
styles['Title'].paragraph_format.space_before=Pt(0)
styles['Title'].paragraph_format.space_after=Pt(10)
styles['Subtitle'].font.size=Pt(11)
styles['Subtitle'].paragraph_format.space_after=Pt(10)
for name,size,line,after in [('Small',9,1.15,4),('TableText',9,1.1,2),('Consent',9.5,1.15,4),('Citation',9,1.15,4)]:
    s=styles.add_style(name,1); s.base_style=normal; s.font.size=Pt(size)
    s.paragraph_format.line_spacing=line; s.paragraph_format.space_after=Pt(after)
    s.paragraph_format.space_before=Pt(4 if name=='Citation' else 0)

header=sec.header.paragraphs[0]
header.text='2026 AI중심대학 창업동아리  |  GUMAP'
header.style=styles['Small']
footer=sec.footer.paragraphs[0]
footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
footer.style=styles['Small']
footer.add_run('작성 초안  ·  ')
fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); footer._p.append(fld)

def p(text='',style=None,bold=False):
    a=doc.add_paragraph(style=style)
    a.add_run(text).bold=bold
    return a
def h(text,level=1): return doc.add_heading(text,level)
def page(title):
    doc.add_page_break(); h(title)
def table(headers,rows,widths):
    assert sum(widths)==9360
    t=doc.add_table(rows=1,cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.LEFT; t.autofit=False
    pr=t._tbl.tblPr
    tw=pr.find(qn('w:tblW')); tw.set(qn('w:w'),'9360'); tw.set(qn('w:type'),'dxa')
    ind=OxmlElement('w:tblInd'); ind.set(qn('w:w'),'120'); ind.set(qn('w:type'),'dxa'); pr.append(ind)
    mar=OxmlElement('w:tblCellMar')
    for k,v in [('top',80),('bottom',80),('start',120),('end',120)]:
        e=OxmlElement('w:'+k); e.set(qn('w:w'),str(v)); e.set(qn('w:type'),'dxa'); mar.append(e)
    pr.append(mar)
    borders=OxmlElement('w:tblBorders')
    for k in ['top','left','bottom','right','insideH','insideV']:
        e=OxmlElement('w:'+k); e.set(qn('w:val'),'single'); e.set(qn('w:sz'),'4'); e.set(qn('w:color'),'D5DAE0'); borders.append(e)
    pr.append(borders)
    for i,w in enumerate(widths): t.columns[i].width=Inches(w/1440)
    for cell,text in zip(t.rows[0].cells,headers): cell.text=text
    for row in rows:
        cells=t.add_row().cells
        for cell,text in zip(cells,row): cell.text=str(text)
    for ri,row in enumerate(t.rows):
        rp=row._tr.get_or_add_trPr()
        nosplit=OxmlElement('w:cantSplit'); rp.append(nosplit)
        if ri==0:
            repeat=OxmlElement('w:tblHeader'); rp.append(repeat)
        for ci,cell in enumerate(row.cells):
            cell.width=Inches(widths[ci]/1440)
            cell._tc.get_or_add_tcPr().find(qn('w:tcW')).set(qn('w:w'),str(widths[ci]))
            cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for par in cell.paragraphs:
                par.style=styles['TableText']
                if ri==0:
                    for run in par.runs: run.bold=True
            if ri==0:
                shade=OxmlElement('w:shd'); shade.set(qn('w:fill'),'F4F6F9'); cell._tc.get_or_add_tcPr().append(shade)
    p('',style='Small')
    return t
def link(label,url,note=''):
    a=p(style='Citation')
    rel=doc.part.relate_to(url,RT.HYPERLINK,is_external=True)
    el=OxmlElement('w:hyperlink'); el.set(qn('r:id'),rel)
    run=OxmlElement('w:r'); rpr=OxmlElement('w:rPr')
    c=OxmlElement('w:color'); c.set(qn('w:val'),'2E74B5'); rpr.append(c)
    run.append(rpr); txt=OxmlElement('w:t'); txt.text=label; run.append(txt); el.append(run); a._p.append(el)
    if note: a.add_run(' — '+note)

p('[별지 1호]',style='Small')
a=p('2026 AI중심대학\n창업동아리 지원 신청서',style='Title'); a.alignment=WD_ALIGN_PARAGRAPH.CENTER
a=p('GUMAP | AI 기반 실내 상세지도 구축 및 위치 안내 서비스',style='Subtitle'); a.alignment=WD_ALIGN_PARAGRAPH.CENTER
table(['항목','기재 내용'],[
('신청 구분','☑ 신규 창업동아리   □ 기존 창업동아리'),
('창업 동아리명 / 참여인원','GUMAP(가칭) / 3명(팀장 포함, 최종 명단 확정 예정)'),
('창업 주제','LiDAR·360도 영상·BLE 비콘을 활용한 AI 기반 실내 상세지도 제작 및 위치 안내 서비스'),
('대표학생(팀장)','성명 [입력] / 학번 [입력] / 학부·전공 [입력]\n연락처 [입력] / 이메일 [입력]'),
('창업 지도교수','성명 [입력] / 소속학부·전공 [입력] / 직급 [입력]\n이메일 [입력]@kumoh.ac.kr')
],[2100,7260])
h('요약문',2)
p('동아리 활동 계획',bold=True)
p('2026년 10~12월 교내 건물 1개 동의 시범 구역을 대상으로 도면과 현장 정보를 수집하고, iPad Pro의 LiDAR 측정과 360도 촬영 자료를 활용해 실 단위 상세지도를 제작한다. AI를 활용해 실명·호실 정보 정리와 지도 데이터 검수를 보조하고, BLE 비콘을 이용한 구역 인식 및 실내 경로 안내 시제품을 구현한다. 사용자 평가와 시설 담당자 인터뷰를 통해 지도 구축·유지관리 서비스의 사업화 가능성을 검증한다.')
p('창업 주제 및 아이템',bold=True)
p('건물 입구에서 강의실·시설 출입문까지 안내하는 실내 상세지도 서비스이다. 공간 데이터 제작, 현장 사진 연결, 지도 수정·관리, BLE 위치 보조 기능을 묶어 대학과 공공시설 등에 제공하는 구축형 서비스와 유지관리 상품을 개발한다.')
p('상기와 같이 『2026 AI중심대학 창업동아리』 지원 신청서를 제출합니다.',style='Small')
p('별첨 1. 창업동아리 활동계획서 1부\n별첨 2. 개인정보 수집·이용 및 제공 동의서 1부',style='Small')
p('2026년 9월 [일 입력]일\n대표학생 [성명] (인)                     지도교수 [성명] (인)',style='Small')
p('국립금오공과대학교 AI중심대학사업단장 귀하',style='Small',bold=True)

page('[별첨 1] 창업동아리 활동계획서')
p('동아리명: GUMAP(가칭)',style='Small')
h('1. 창업동아리 개요',2)
p('대학과 대형 공공시설을 처음 방문하는 이용자는 건물 위치를 찾은 뒤에도 강의실, 행정실, 계단과 엘리베이터를 다시 찾아야 한다. 현장 안내도와 온라인 지도에 실 번호, 출입문, 층간 이동 정보가 충분히 반영되지 않으면 방문객의 이동 시간이 늘어나고 시설 운영자의 반복 안내 부담도 커진다.')
p('본 동아리는 이러한 문제를 해결하기 위해 실내 공간을 직접 조사하고 상세지도 데이터로 구축하는 기술과 사업모델을 개발한다. 단순한 도면 이미지 제공을 넘어 실 영역·출입문·복도·계단·엘리베이터를 구조화하고, 현장 영상과 위치 정보를 연결해 실제 이동에 활용할 수 있는 지도를 제작한다. 교내 실증을 바탕으로 소규모 팀이 반복 수행할 수 있는 구축 절차와 유지관리 체계를 마련하는 것이 운영 목적이다.')
h('2. 창업 주제 및 아이템',2)
p('아이템명: GUMAP Indoor — AI 기반 실내 상세지도 제작·관리 및 위치 안내 서비스',bold=True)
p('공간 수집 및 상세지도 제작: 교내 테크노관 등 협조가 가능한 건물 1개 동을 선정하고, 인접한 2개 층의 공개 복도와 주요 시설을 우선 조사한다. 사용 가능한 도면을 기준으로 iPad Pro 11인치 M4의 LiDAR 측정 자료와 현장 확인 내용을 대조하여 실 구획, 출입문, 시설명, 통행 가능 구간을 반영한다. 실 단위 공간 데이터와 길찾기 경로망을 GeoJSON·IMDF 등으로 관리한다.')
p('360도 현장 정보 연결: Insta360 X4로 교차로, 출입구, 층간 이동 지점 등을 촬영하고 지도 위치에 연결한다. 사용자는 지도와 현장 모습을 함께 확인할 수 있으며, 제작자는 사진을 근거로 시설 표기와 동선을 검수한다. 360도 영상은 시각적 기록으로 활용하고 공간 치수는 도면·LiDAR·기준 길이 확인으로 별도 보정한다.')
p('AI 활용: 도면과 현장 표지판의 호실·시설명 인식 결과를 대장과 대조하고, 누락·중복 항목을 검수 대상으로 표시한다. 자동 처리 결과는 사람이 확인한 뒤 지도에 반영한다. Claude Pro는 지도 데이터 처리 코드 개발, 오류 분석, 검수 보조, 사용자 평가 정리에 활용한다.')
p('BLE 위치 보조 및 안내: Minew i3 비콘 8개를 초기 후보로 편성하여 주요 분기점과 층간 이동부에서 수신 신호를 측정한다. 비콘 식별자와 설치 위치를 연결하고 수신세기 변화에 따른 구역 인식·층 판별을 시험한다. 비콘 수량은 건물 전체 위치 서비스가 아닌 제한된 실증 구역을 위한 것이며, 전파 간섭과 벽체 영향을 측정하여 배치를 조정한다.')
p('제공 기능: 층별 지도, 시설·호실 검색, 출입문까지의 경로, 계단·엘리베이터 선택, 현장 사진 보기, 시설 정보 수정 기능을 시제품에 구현한다. BLE 기능은 스마트폰 앱 등 수신이 가능한 환경에서 검증하고, 웹 지도에는 QR 진입점·수동 출발점 선택을 함께 제공한다.',style='Small')

page('3. 실제 창업으로의 확장 가능성과 전략')
h('고객과 제공 가치',2)
p('초기 고객은 대학 시설·학생지원 부서와 방문객 안내가 필요한 공공시설 운영자이다. 시설 운영자에게는 실내지도 신규 구축과 정보 갱신 서비스를, 이용자에게는 호실 검색과 경로 안내를 제공한다. 고객의 기존 도면 보유 여부와 업데이트 업무를 조사하여 현장 수집, 지도 제작, 검수, 운영 중 어디에서 비용 절감 효과가 큰지 확인한다.')
h('수익모델과 시장 검증',2)
p('초기에는 건물 규모와 구축 범위에 따라 산정하는 지도 제작비, 시설명·호실 변경 반영과 콘텐츠 운영에 대한 정기 유지관리비를 수익모델로 설정한다. BLE 위치 안내는 필요한 구역에 한해 설치·점검 범위를 추가하는 선택형 기능으로 구성한다. 실제 판매가격은 실증 과정에서 측정한 작업시간, 장비 활용비, 현장 방문 횟수와 고객 인터뷰 결과를 근거로 산정한다.')
p('지원 기간에는 시설 운영 관계자 3명 이상을 인터뷰하고, 재학생·방문객 20명 이상을 대상으로 목적지 탐색 실험을 수행한다. 지도 도입 의향, 필요한 갱신 주기, 도입 예산 범위, 기존 안내 방식의 불편을 확인한다. 12월에는 시연 영상, 샘플 지도, 작업 공정별 소요시간과 견적 산정표를 묶어 제안 자료를 완성한다. 유료 계약 및 매출은 검증 이후 목표로 두며 현재 실적으로 기재하지 않는다.')
h('확장 및 운영 전략',2)
p('실증 이후 도면 입력 규칙, 공간 속성, 현장 촬영 기준, 지도 검수 항목을 표준화하여 다른 건물에서도 재사용한다. 도면이 없는 구역은 현장 수집 비중을 높이고, 기존 도면이 있는 구역은 AI 인식과 사람 검수를 결합하여 제작 시간을 줄인다. 건물별 변경 이력을 관리하고 출입구를 실외 보행 경로와 연결해 향후 캠퍼스 전체와 지역 공공시설로 확장한다.')
h('4. 본 창업동아리의 우수성',2)
p('GUMAP 프로젝트에는 캠퍼스 지도, 도면 정합·편집 도구, IMDF 변환 및 실내 경로망 구축을 위한 작업 기반이 마련되어 있다. 이를 활용해 본 활동에서는 현장 검증과 상세정보 보완, 위치 보조 실험, 고객 수요 검증에 집중할 수 있다. 기존 프로젝트 자산은 이번 창업동아리 실증의 출발점으로 활용하며, 모든 기능의 현장 성능이 이미 검증된 것으로 간주하지 않는다.')
p('3인 팀은 공간 데이터·현장 조사, 서비스 개발·BLE 실험, 기획·고객 검증을 나누어 담당하고 지도 검수와 사용자 실험에는 공동 참여한다. AI 활용 결과와 실제 현장 자료를 대조하는 절차를 운영하여 개발 속도와 데이터 품질을 함께 관리한다. 사용 중인 기능을 직접 시연하고 문제 발견부터 수정 결과까지 기록하는 방식으로 실행 역량을 입증한다.')
p('특허·소프트웨어 등록·경진대회 및 해커톤 실적: [실제 보유 실적이 있으면 대회명·주최기관·수상일·수상명 또는 등록번호 입력. 없으면 “해당 없음”으로 확정.]',style='Small')

page('5. 창업동아리 활동 계획')
h('1) 참여 학생 명단',2)
table(['구분','학번','성명','학부·전공','학년','E-mail'],[
('팀장','[입력]','[입력]','[입력]','[입력]','[입력]'),
('팀원','[입력]','[입력]','[입력]','[입력]','[입력]'),
('팀원','[입력]','[입력]','[입력]','[입력]','[입력]'),
],[850,1500,1200,2000,810,3000])
p('역할 분담안: 팀장 — 기획·일정·고객 인터뷰·성과보고 / 팀원 1 — 도면 정합·실내지도 데이터·현장 조사 / 팀원 2 — 지도 서비스·BLE 수신 및 구역 인식·사용자 평가. 최종 구성원의 역량에 따라 조정한다.',style='Small')
h('2) 예산 활용 계획',2)
p('신규 창업동아리 / 총 3,000,000원 / 2026년 10~12월',bold=True)
table(['비목','활용 계획 및 산출 근거','금액'],[
('재료비\n(장비 포함 요청안)','iPad Pro 11 M4 1대, Insta360 X4 1대, Minew i3 8개, microSD 1개, 촬영 삼각대 1개, 고정·표시 재료. 상세 내역은 구매 참고 부록 참조.','2,520,000원'),
('클라우드 활용비','Claude Pro 월간 구독: 40,000원 × 1인 × 3개월. 지도 데이터 처리 코드 개발, 분석·검수 보조에 활용. 인원 확정 전 1인 기준 편성.','120,000원'),
('회의비','시제품 검토·사용자 평가 결과 회의: 10,000원 × 3인 × 10회. 1일 1회, 1인당 최대 1만원 및 총 지원금 10% 이내.','300,000원'),
('사무용품비','현장 조사 기록지·검수표 출력용 용지 및 파일, 필기구: 20,000원 × 3개월.','60,000원'),
('합계','','3,000,000원')
],[1750,5710,1900])
p('예산 편성 조건: 공고상 재료비는 소모성 재료 구입으로 안내되어 있으므로 iPad·카메라·비콘·삼각대 등의 구매 허용 여부와 적정 비목을 사업단에 확인한 뒤 확정한다. 허용되지 않는 장비는 교내 대여·기보유 장비 활용 또는 허용된 임차 방식으로 전환하고, 변경 예산을 다시 산정한다. 위 표는 장비 구매가 허용된다는 조건의 요청안이며 집행 승인 내역이 아니다.',style='Small')
p('Claude Pro는 공식 월간요금 US$20를 참고하되 환율·세금·결제 수수료 변동을 고려한 예산 단가 40,000원으로 산정했다. 실제 결제액에 따라 정산하며, SaaS 구독료의 클라우드 활용비 인정 여부를 확인한다. 3인 개별 구독 선택 시의 대체 예산은 부록에 제시했다.',style='Small')

page('5. 창업동아리 활동 계획 — 세부 실행')
h('3) 세부 활동 계획',2)
table(['기간','주요 활동','산출물'],[
('10월 1~2주','실증 건물·구역 선정, 도면·촬영·비콘 설치 협의, 장비 구매 및 비목 확인, 사용자 요구 조사','실증 범위도, 조사표, 승인된 예산'),
('10월 3~4주','도면 정합, LiDAR 보조 측정, 360도 촬영, 시설·호실 대장 정리, 비콘 수신 기초 실험','시범 2개 층 공간 초안, 촬영 목록, 신호 측정 기록'),
('11월 1~2주','실·출입문·복도 상세화, AI 인식 결과 검수, 경로망 구축, 지도 검색·층 전환 구현','상세지도 1차본, 검수 기록, 길찾기 시제품'),
('11월 3~4주','비콘 배치·신호 보정, 구역 인식 시험, 현장 사진 연결, 시설 담당자 인터뷰','BLE 실험 결과, 고객 요구 목록'),
('12월 1~2주','20명 이상 사용자 평가, 경로 오류 수정, 제작시간·유지관리 작업량 측정','평가 보고서, 개선 지도, 견적 산정 근거'),
('12월 3~4주','최종 시연, 사업화 제안 자료 제작, 활동·정산 보고, 후속 실증 계획 수립','최종 시제품, 시연 영상, 사업화 제안서')
],[1500,5100,2760])
h('성과 목표 및 확인 방법',2)
p('아래 수치는 지원 기간의 목표이며 현재 달성 실적이 아니다.',style='Small')
table(['구분','목표','확인 방법'],[
('지도 구축','1개 동의 인접 2개 층 시범 구역','확정한 공개 구역 목록과 지도 대조'),
('상세정보 품질','대상 시설·출입문 표기 일치율 95% 이상','현장 확인표 기준 항목별 대조'),
('경로 안내','시험 경로 20개 중 18개 이상 정상 안내','벽·금지구역 통과 없이 목적지 도착 확인'),
('BLE 구역 인식','지정 구역 분류 정확도 85% 이상 목표','사전 구분한 구역에서 별도 평가 100회 이상; 층 오인식 별도 기록'),
('고객·사용자 검증','운영 관계자 3명, 사용자 20명 이상','인터뷰 기록과 과제 수행·만족도 결과')
],[1800,3300,4260])
p('주 1회 작업 점검과 월 1회 지도교수 검토를 운영한다. 도면·영상의 사용 허가 범위를 기록하고 촬영된 얼굴·개인정보는 공개 전 비식별 처리한다. 시설 출입 제한과 현장 통행 조건을 지도에 반영하며, 원본 자료와 수정 이력을 함께 보관한다.',style='Small')

page('[별첨 2] 개인정보 수집·이용 및 제공 동의서')
src=Path(r'C:\Users\barah\.codex\attachments\92b8440b-7872-4f8a-9793-4b3004e94d73\pasted-text.txt').read_text(encoding='utf-8')
consent=src.split(' 국립금오공과대학교 AI중심대학사업단은 「창업동아리지원 프로그램」',1)[1]
consent='국립금오공과대학교 AI중심대학사업단은 「창업동아리지원 프로그램」'+consent.split('\n구분\n성  명',1)[0]
# Preserve the supplied consent text; no consent or signature is preselected.
for line in consent.strip().split('\n'):
    if line.strip(): p(line.strip(),style='Consent')
table(['구분','성명','동의 여부','서명'],[
('지도교수','[입력]','□ 동의함   □ 동의하지 않음',''),
('팀장','[입력]','□ 동의함   □ 동의하지 않음',''),
('팀원','[입력]','□ 동의함   □ 동의하지 않음',''),
('팀원','[입력]','□ 동의함   □ 동의하지 않음',''),
],[1400,1700,4360,1900])
p('2026년 9월 [일 입력]일',style='Consent')
p('국립금오공과대학교 AI중심대학사업단장 귀하',style='Consent',bold=True)

page('구매 참고 부록 — 신청서 본문과 분리')
p('조사일: 2026.09.05. 아래 링크는 구매 후보 확인용이다. 검색에 노출된 가격은 과거 수집본일 수 있으며, 현재 재고·선택 옵션·배송비·결제가는 확정하지 못했다. 예산 편성액과 판매 노출가를 구분했다. 이 부록은 원본 HWP 신청서에 옮길 때 본문에서 제외할 수 있다.',style='Small')
h('장비·재료 구성: 합계 2,520,000원',2)
equipment=[
('iPad Pro 11인치 M4','256GB / Wi-Fi / 1대','1,500,000','1,500,000'),
('Insta360 X4','기본 구성 / 1대','602,000','602,000'),
('Minew i3 BLE 비콘','실증용 / 8개','35,000','280,000'),
('microSD 메모리','128GB / U3·V30 / 1개','60,000','60,000'),
('촬영용 셀피스틱·삼각대','Insta360 미니 투인원 2.0 / 1개','57,000','57,000'),
('고정·표시 소모품','비콘 부착 테이프·위치 라벨 / 1식','21,000','21,000'),
]
table(['품목','수량·규격','예산 단가(원)','금액(원)'],equipment,[2650,3310,1700,1700])
link('iPad Pro M4 11인치 256GB Wi-Fi | 쿠팡','https://www.coupang.com/vp/products/8183880101?itemId=23402511370','해당 모델의 상품 표기는 확인. 검색에 반품·중고 상세 링크가 노출돼 신품 재고와 가격은 미확정. 150만원은 신품 구매 목표 예산이며, 현재 구매 가능한 가격으로 확인된 금액이 아니다.')
link('Insta360 X4 | 쿠팡','https://www.coupang.com/vp/products/8099203929?itemId=22902021778&vendorItemId=89936524413','검색 노출가 602,000원. 새 상품·반품 혼합 최저가는 예산 근거에서 제외. 본체의 360도 촬영으로 시설·동선 사진을 수집한다.')
link('i3 비콘 판매 후보 | 쿠팡','https://www.coupang.com/vp/products/1890899947?itemId=3212885760&vendorItemId=71204821668','노출가 33,500원, 일부 검색본 32,000원. 판매 정보의 제조자·수입자는 현승으로 기재되어 Minew 정품 여부 미확인. 본 신청서의 Minew i3 35,000원은 견적 전 추정 단가이며 이 판매가를 Minew 가격으로 확정한 것이 아니다.')
link('샌디스크 Extreme PRO microSD 128GB 판매 후보 | 쿠팡','https://www.coupang.com/vp/products/9664555376?itemId=28893598867&vendorItemId=95826091634','128GB·U3·V30 옵션 표기 확인, 현재 결제가는 미확정. 60,000원은 편성액이며 카메라 권장 카드 목록과 대조 후 확정한다.')
link('Insta360 미니 투인원 셀피스틱 삼각대 2.0 | 쿠팡','https://www.coupang.com/vp/products/9439930208','검색 노출가 57,000원. 촬영 안정화 및 반복 촬영 위치 확보용. 본체 번들에 포함된다면 중복 구매하지 않는다.')
p('고정·표시 재료 21,000원은 부착 테이프와 위치 식별 라벨의 추정 합계이며 특정 판매상품의 확인 가격은 아니다. 배송비·옵션 차이로 장비 합계가 달라지면 회의비 등과 함께 총 300만원 이내로 재산정한다.',style='Small')

page('작성·집행 참고 부록')
h('Claude Pro 구독 인원별 대체 예산',2)
table(['비목','1인 구독안(본문)','3인 개별 구독안'],[
('장비·재료 요청액','2,520,000원','2,520,000원'),
('Claude Pro / 3개월','120,000원\n40,000원 × 1인 × 3개월','360,000원\n40,000원 × 3인 × 3개월'),
('회의비','300,000원\n10,000원 × 3인 × 10회','90,000원\n10,000원 × 3인 × 3회'),
('사무용품비','60,000원','30,000원'),
('총액','3,000,000원','3,000,000원'),
],[2400,3480,3480])
link('Claude 공식 요금','https://claude.com/pricing','Pro 월간 결제 US$20. 40,000원은 환율·세금 등을 감안한 월별 예산 상한 가정이며 공식 원화 정가가 아니다. 10~12월 지원 기간에 맞춰 월간 결제로 편성한다.')
link('Claude 구독과 API 요금 구분 | 공식 도움말','https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console','본 예산은 개발자가 사용하는 Pro 구독료이다. 서비스 이용자의 요청을 처리하는 Claude API·서버 운영비는 포함하지 않는다. 3인안은 각자 별도 계정으로 구독한다.')
h('제출 전 확정할 내용',2)
p('신청 구분·인원: 신규 동아리로 가정했다. 기존 GUMAP 개발 프로젝트가 있다는 사실만으로 공고의 “기존 창업동아리” 해당 여부가 확정되지는 않는다. 현재 운영 중인 창업동아리에 해당한다면 지원 범위가 100만원의 클라우드 사용료로 바뀌므로 신청 구분부터 확인한다. 3인 명단은 예정이며 제출 시 본교 재학생 2인 이상을 확정한다.',style='Small')
p('인적사항·서명: 팀명, 대표학생과 팀원 성명·학번·소속·학년·이메일, 대표 연락처, 지도교수 정보를 입력한다. 수상·등록 실적은 증빙 가능한 내용만 확정한다. 개인정보 동의와 서명·날인은 각 당사자가 직접 작성한다.',style='Small')
p('예산·장비: 사업단에 태블릿·360도 카메라·비콘 구매 허용 여부, 적용 비목과 소유·관리 방식, Claude Pro 구독료 인정 여부를 문의 후 확정한다. Minew 비콘은 제조사·모델·설정 앱·배터리 구성·납품 기한을 확인한다. 장비 구매가 불허되면 대여 가능한 동급 장비 확보와 수정 예산이 필요하다.',style='Small')
p('제출: 본 파일은 제공된 공고·양식 텍스트를 바탕으로 만든 편집용 DOCX 초안이다. 공고의 원본 “창업동아리 프로그램 지원신청서.hwp”에 내용을 옮기고 대괄호 입력란과 작성용 부록을 정리한다. 파일명은 “AI중심대학 2026 창업동아리 신청지원서(팀명-팀장명)”으로 맞춘다. 제출 마감은 2026년 9월 13일 23:59, 제출처는 tldus1900@kumoh.ac.kr이다.',style='Small')
h('기술·작성 근거',2)
link('Apple RoomPlan 공식 소개','https://developer.apple.com/augmented-reality/roomplan/','카메라와 LiDAR 기반 실내 공간 수집 가능성의 근거. 본 과제는 측정·변환·현장 검수를 포함하며, 장비 구매만으로 상세지도가 자동 완성되는 것으로 가정하지 않는다.')
link('Apple iPad Pro 11인치 M4 기기 안내','https://support.apple.com/en-gb/guide/ipad/ipaded0ae0b7/26/ipados/26','LiDAR 탑재 모델 확인.')
link('Minew i3 공식 사양','https://www.minew.com/product/i3-robust-beacon/','iBeacon 지원과 설정 앱 등 모델 확인용. 광고 도달거리는 실내 위치 정확도나 설치 간격을 의미하지 않는다.')
p('작성 근거: 사용자가 제공한 2026년 모집 공고 및 신청 양식, 작업 폴더의 README.md와 AX역량강화_프로젝트계획서_GUMAP.md. 기존 계획서의 인원·일정·예산·목표는 이번 지원 조건에 맞춰 다시 구성했다. 기존 계획의 목표를 수상 실적 또는 달성 성과로 옮기지 않았다.',style='Small')

doc.core_properties.title='2026 AI중심대학 창업동아리 지원 신청서 — GUMAP'
doc.core_properties.subject='실내 상세지도 제작 및 BLE 위치 안내 서비스'
doc.core_properties.author='GUMAP'
doc.core_properties.comments='인적사항 및 예산 집행 가능 여부 확인 전 작성 초안'
doc.save(OUT)
# Structural and arithmetic QA, meaningful to the requested form.
assert sum([1500000,602000,35000*8,60000,57000,21000])==2520000
assert 2520000+120000+300000+60000==3000000
assert 2520000+360000+90000+30000==3000000
assert 300000 <= 3000000*.1
for t in doc.tables:
    grid=[int(e.get(qn('w:w'))) for e in t._tbl.tblGrid]
    assert sum(grid)==9360
    for row in t.rows:
        vals=[int(c._tc.get_or_add_tcPr().find(qn('w:tcW')).get(qn('w:w'))) for c in row.cells]
        assert vals==grid
all_text='\n'.join(a.text for a in doc.paragraphs)
assert '기존 계획의 목표를 수상 실적 또는 달성 성과로 옮기지 않았다' in all_text
assert '개인정보의 보유 및 이용 기간 : 5년' in all_text
qa={'file':str(OUT),'tables':len(doc.tables),'page_breaks':len(doc.element.xpath('//w:br[@w:type="page"]')),'equipment_total':2520000,'budget_1person':3000000,'budget_3persons':3000000,'geometry':'9360 DXA, explicit grid/tcW/tblW','visual_qa':'pending renderer'}
(ROOT/'structural_qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(qa,ensure_ascii=False))
